const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const db = require('../db');
const mpesaQr = require('../services/mpesaQr');
const { materializeSale } = require('../services/saleMaterializer');

const router = express.Router();

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const PASSKEY = process.env.MPESA_PASSKEY;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const PAYMENT_BASE_URL = process.env.VITE_PAYMENT_BASE_URL;
const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

if (!SHORTCODE) console.warn('WARN: MPESA_SHORTCODE not set');
if (!CALLBACK_URL) console.warn('WARN: MPESA_CALLBACK_URL not set — STK will fail');
if (!PAYMENT_BASE_URL) console.warn('[WARN: VITE_PAYMENT_BASE_URL not set — QR falls back to relative');

console.log(`M-Pesa env: ${process.env.MPESA_ENV || 'sandbox'} | base: ${BASE_URL}`);
console.log(`Shortcode: ${SHORTCODE || 'MISSING'} | Callback: ${CALLBACK_URL || 'MISSING'}`);

let mpesaAccessToken = null;
let mpesaTokenExpiry = 0;

async function getMpesaAccessToken() {
  if (mpesaAccessToken && Date.now() < mpesaTokenExpiry - 60000) {
    console.log('[TOKEN] using cached token');
    return mpesaAccessToken;
  }
  console.log('[TOKEN] fetching new M-Pesa access token');
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  );
  if (!res.data?.access_token) throw new Error('No access token from M-PESA');
  mpesaAccessToken = res.data.access_token;
  mpesaTokenExpiry = Date.now() + res.data.expires_in * 1000;
  console.log('[TOKEN] new token acquired, expires in', res.data.expires_in, 's');
  return mpesaAccessToken;
}

function formatPhone(phone) {
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.length === 10 && (cleaned.startsWith('07') || cleaned.startsWith('01'))) {
    cleaned = '254' + cleaned.slice(1);
  } else if (cleaned.length === 9 && cleaned.startsWith('7')) {
    cleaned = '254' + cleaned;
  } else if (!cleaned.startsWith('254')) {
    cleaned = '254' + cleaned;
  }
  if (cleaned.length !== 12) throw new Error('Invalid phone number');
  return cleaned;
}

// ==================== NEXT INVOICE ====================
router.get('/next-invoice', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const row = await db.getAsync(
      `SELECT COUNT(*) as c FROM sales WHERE invoice_no LIKE ?`,
      [`CW-${today}-%`]
    );
    const next = String((row?.c || 0) + 1).padStart(4, '0');
    const invoice_no = `CW-${today}-${next}`;
    console.log(`[NEXT-INVOICE] generated: ${invoice_no}`);
    res.json({ invoice_no });
  } catch (err) {
    console.error('[NEXT-INVOICE] error:', err.message);
    res.status(500).json({ error: 'Failed to generate invoice number', details: err.message });
  }
});

// ==================== CREATE PAYMENT SESSION ====================
router.post('/qr/generate', async (req, res) => {
  const t0 = Date.now();
  const { invoice_no, amount, cart } = req.body || {};
  console.log(`[QR-GEN] start invoice=${invoice_no} amount=${amount} items=${cart?.items?.length || 0}`);

  try {
    if (!invoice_no || !amount || !cart) {
      console.warn('[QR-GEN] missing params');
      return res.status(400).json({ error: 'invoice_no, amount, cart required' });
    }

    const existing = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    console.log(`[QR-GEN] existing session: ${existing ? 'yes' : 'no'}`);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const qrPayload = PAYMENT_BASE_URL
      ? `${PAYMENT_BASE_URL}/pay/${invoice_no}`
      : `/pay/${invoice_no}`;

    if (!existing) {
      await db.runAsync(
        `INSERT INTO payment_sessions
         (invoice_no, sale_id, amount, merchant_id, status, expires_at, created_at, cart_payload)
         VALUES (?, NULL, ?, ?, 'pending', ?, datetime('now'), ?)`,
        [invoice_no, amount, SHORTCODE, expiresAt, JSON.stringify(cart)]
      );
      console.log(`[QR-GEN] inserted new session, expires ${expiresAt}`);
    } else {
      await db.runAsync(
        `UPDATE payment_sessions
         SET amount = ?, cart_payload = ?, expires_at = ?, status = 'pending',
             updated_at = datetime('now')
         WHERE invoice_no = ?`,
        [amount, JSON.stringify(cart), expiresAt, invoice_no]
      );
      console.log(`[QR-GEN] updated existing session, expires ${expiresAt}`);
    }

    console.log(`[QR-GEN] ✓ done in ${Date.now() - t0}ms`);
    res.json({
      success: true,
      invoice_no,
      amount,
      qr_payload: qrPayload,
      expires_at: expiresAt,
      existing: !!existing,
    });
  } catch (err) {
    console.error(`[QR-GEN] ✗ error (${Date.now() - t0}ms):`, err.message);
    res.status(500).json({ error: 'Failed to create session', details: err.message });
  }
});

// ==================== M-PESA DYNAMIC QR ====================
router.post('/qr/mpesa', async (req, res) => {
  const start = Date.now();
  const { invoice_no, amount } = req.body || {};
  console.log(`[MPESA-QR] start invoice=${invoice_no} amount=${amount}`);

  try {
    if (!invoice_no || !amount) {
      console.warn('[MPESA-QR] missing params');
      return res.status(400).json({ error: 'invoice_no and amount required' });
    }

    const result = await mpesaQr.generateMpesaQR({
      merchantName: 'EVOPAY CAR WASH',
      refNo: invoice_no,
      amount,
      size: '300',
    });

    await db.runAsync(
      `UPDATE payment_sessions SET qr_code = ?, updated_at = datetime('now')
       WHERE invoice_no = ?`,
      [`MPESA_QR:${(result.QRCode || '').slice(0, 80)}`, invoice_no]
    ).catch(() => {});

    console.log(`[MPESA-QR] ✓ done in ${Date.now() - start}ms | requestId=${result.RequestID}`);

    res.json({
      success: true,
      mode: 'mpesa',
      qr_base64: result.QRCode,
      response_code: result.ResponseCode,
      request_id: result.RequestID,
      ms: Date.now() - start,
    });
  } catch (err) {
    console.error(`[MPESA-QR] ✗ error (${Date.now() - start}ms):`, err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to generate M-Pesa QR',
      details: err.response?.data || err.message,
    });
  }
});

// ==================== CUSTOM QR ====================
router.get('/qr/custom/:invoice_no', async (req, res) => {
  const { invoice_no } = req.params;
  try {
    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) {
      console.warn(`[CUSTOM-QR] no session for ${invoice_no}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.qr_code && session.qr_code.startsWith('CUSTOM_QR:')) {
      console.log(`[CUSTOM-QR] returning cached for ${invoice_no}`);
      return res.json({
        success: true,
        mode: 'custom',
        qr_data_url: session.qr_code.slice('CUSTOM_QR:'.length),
        qr_payload: `${PAYMENT_BASE_URL}/pay/${invoice_no}`,
        cached: true,
      });
    }

    const url = `${PAYMENT_BASE_URL || ''}/pay/${invoice_no}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'M' });

    await db.runAsync(
      `UPDATE payment_sessions SET qr_code = ?, updated_at = datetime('now') WHERE invoice_no = ?`,
      [`CUSTOM_QR:${dataUrl}`, invoice_no]
    );

    console.log(`[CUSTOM-QR] generated fresh for ${invoice_no}`);
    res.json({
      success: true,
      mode: 'custom',
      qr_data_url: dataUrl,
      qr_payload: url,
      cached: false,
    });
  } catch (err) {
    console.error(`[CUSTOM-QR] error for ${invoice_no}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== GET SESSION ====================
router.get('/qr/:invoice_no', async (req, res) => {
  try {
    const session = await db.getAsync(
      `SELECT invoice_no, amount, status, expires_at FROM payment_sessions WHERE invoice_no = ?`,
      [req.params.invoice_no]
    );
    if (!session) return res.status(404).json({ error: 'Not found' });
    console.log(`[GET-SESSION] ${req.params.invoice_no} → status=${session.status}`);
    res.json(session);
  } catch (err) {
    console.error(`[GET-SESSION] error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== POLL STATUS ====================
router.get('/payment-status/:invoice_no', async (req, res) => {
  try {
    const session = await db.getAsync(
      `SELECT status, transaction_id, payment_method FROM payment_sessions WHERE invoice_no = ?`,
      [req.params.invoice_no]
    );
    if (!session) {
      console.warn(`[POLL] no session for ${req.params.invoice_no}`);
      return res.status(404).json({ error: 'Not found' });
    }
    console.log(`[POLL] ${req.params.invoice_no} → status=${session.status} txn=${session.transaction_id || '-'}`);
    res.json(session);
  } catch (err) {
    console.error(`[POLL] error:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== STK PUSH ====================
router.post('/stk-push', async (req, res) => {
  const t0 = Date.now();
  const { invoice_no, phone } = req.body || {};
  console.log(`[STK] start invoice=${invoice_no} phone=${phone}`);

  try {
    if (!invoice_no || !phone) {
      console.warn('[STK] missing invoice_no or phone');
      return res.status(400).json({ error: 'invoice_no and phone required' });
    }
    if (!CALLBACK_URL) {
      console.error('[STK] MPESA_CALLBACK_URL not configured');
      return res.status(500).json({ error: 'MPESA_CALLBACK_URL not configured' });
    }

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) {
      console.warn(`[STK] no session for ${invoice_no}`);
      return res.status(404).json({ error: 'Session not found' });
    }
    if (session.status === 'completed') {
      console.warn(`[STK] already paid: ${invoice_no}`);
      return res.status(400).json({ error: 'Already paid' });
    }

    const formattedPhone = formatPhone(phone);
    const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString('base64');
    const token = await getMpesaAccessToken();

    const payload = {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.round(session.amount),
      PartyA: formattedPhone,
      PartyB: SHORTCODE,
      PhoneNumber: formattedPhone,
      CallBackURL: CALLBACK_URL,
      AccountReference: invoice_no.substring(0, 12),
      TransactionDesc: `Car Wash ${invoice_no.substring(0, 10)}`,
    };

    console.log(`[STK] → sending to Safaricom: amount=${payload.Amount} partyA=${formattedPhone} ref=${payload.AccountReference}`);

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );

    console.log(`[STK] ← Safaricom response: code=${response.data?.ResponseCode} desc=${response.data?.ResponseDescription} checkoutId=${response.data?.CheckoutRequestID}`);

    if (response.data?.ResponseCode !== '0') {
      throw new Error(response.data?.ResponseDescription || 'STK rejected');
    }

    await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'processing', payment_method = 'mpesa',
           customer_phone = ?, mpesa_checkout_id = ?, updated_at = datetime('now')
       WHERE invoice_no = ?`,
      [formattedPhone, response.data.CheckoutRequestID, invoice_no]
    );

    console.log(`[STK] ✓ done in ${Date.now() - t0}ms | checkoutId=${response.data.CheckoutRequestID}`);
    res.json({
      success: true,
      checkout_request_id: response.data.CheckoutRequestID,
      message: response.data.CustomerMessage,
    });
  } catch (err) {
    console.error(`[STK] ✗ failed (${Date.now() - t0}ms):`, err.response?.data || err.message);
    await db.runAsync(
      `UPDATE payment_sessions SET status = 'failed', updated_at = datetime('now') WHERE invoice_no = ?`,
      [invoice_no]
    ).catch(() => {});
    res.status(500).json({ error: err.response?.data?.errorMessage || err.message });
  }
});

// ==================== M-PESA STK CALLBACK ====================
router.post('/mpesa-callback', async (req, res) => {
  console.log('════════════════════════════════════════════');
  console.log('[CALLBACK] ⬅ Received from Safaricom');
  console.log('[CALLBACK] body:', JSON.stringify(req.body).slice(0, 800));
  console.log('════════════════════════════════════════════');

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb) {
      console.warn('[CALLBACK] no stkCallback in body');
      return;
    }

    const checkoutId = cb.CheckoutRequestID;
    const resultCode = cb.ResultCode;

    console.log(`[CALLBACK] checkoutId=${checkoutId} resultCd=${resultCode} resultDesc=${cb.ResultDesc}`);

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE mpesa_checkout_id = ?`,
      [checkoutId]
    );
    if (!session) {
      console.warn(`[CALLBACK] no session for checkoutId=${checkoutId}`);
      return;
    }
    console.log(`[CALLBACK] matched session invoice=${session.invoice_no}`);

    if (resultCode === 0) {
      const items = cb.CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null;
      const phone = items.find(i => i.Name === 'PhoneNumber')?.Value || null;
      const amount = items.find(i => i.Name === 'Amount')?.Value || null;

      console.log(`[CALLBACK] ✓ SUCCESS receipt=${receipt} amount=${amount} phone=${phone}`);

      await db.runAsync(
        `UPDATE payment_sessions
         SET status = 'completed', transaction_id = ?, customer_phone = COALESCE(?, customer_phone),
             updated_at = datetime('now')
         WHERE id = ?`,
        [receipt, phone, session.id]
      );

      try {
        const result = await materializeSale({ ...session, transaction_id: receipt });
        console.log(`[CALLBACK] materialized saleId=${result.saleId} synced=${result.synced} queued=${result.queued}`);
      } catch (e) {
        console.error(`[CALLBACK] materializeSale failed:`, e.message);
      }
    } else {
      const status = resultCode === 1032 ? 'cancelled' : 'failed';
      console.log(`[CALLBACK] ✗ FAILED code=${resultCode} desc=${cb.ResultDesc} → status=${status}`);
      await db.runAsync(
        `UPDATE payment_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [status, session.id]
      );
    }
  } catch (err) {
    console.error('[CALLBACK] exception:', err.message, err.stack);
  }
});

// ==================== C2B CALLBACK ====================
router.post('/c2b-callback', async (req, res) => {
  console.log('════════════════════════════════════════════');
  console.log('[C2B] ⬅ Received from Safaricom');
  console.log('[C2B] body:', JSON.stringify(req.body).slice(0, 800));
  console.log('════════════════════════════════════════════');

  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const { TransID, BillRefNumber, MSISDN, TransAmount, FirstName } = req.body || {};
    console.log(`[C2B] txn=${TransID} ref=${BillRefNumber} amount=${TransAmount} from=${MSISDN} (${FirstName})`);
    if (!BillRefNumber) {
      console.warn('[C2B] no BillRefNumber');
      return;
    }

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [BillRefNumber]
    );
    if (!session) {
      console.warn(`[C2B] no session for invoice ${BillRefNumber}`);
      return;
    }
    if (session.status === 'completed') {
      console.log(`[C2B] session already completed for ${BillRefNumber}`);
      return;
    }

    await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'completed', transaction_id = ?, customer_phone = COALESCE(?, customer_phone),
           payment_method = 'mpesa', updated_at = datetime('now')
       WHERE id = ?`,
      [TransID, MSISDN, session.id]
    );

    try {
      const result = await materializeSale({ ...session, transaction_id: TransID });
      console.log(`[C2B] materialized saleId=${result.saleId} synced=${result.synced}`);
    } catch (e) {
      console.error(`[C2B] materializeSale failed:`, e.message);
    }

    console.log(`[C2B] ✓ confirmed ${BillRefNumber} → ${TransID}`);
  } catch (err) {
    console.error('[C2B] exception:', err.message);
  }
});

// ==================== C2B VALIDATION ====================
router.post('/c2b-validation', async (req, res) => {
  const { BillRefNumber } = req.body || {};
  console.log(`[C2B-VALIDATE] invoice=${BillRefNumber}`);
  try {
    if (!BillRefNumber) {
      console.warn('[C2B-VALIDATE] no BillRefNumber');
      return res.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account' });
    }
    const session = await db.getAsync(
      `SELECT status FROM payment_sessions WHERE invoice_no = ?`,
      [BillRefNumber]
    );
    if (!session) {
      console.warn(`[C2B-VALIDATE] unknown invoice ${BillRefNumber}`);
      return res.json({ ResultCode: 'C2B00012', ResultDesc: 'Unknown invoice' });
    }
    if (session.status === 'completed') {
      console.warn(`[C2B-VALIDATE] already paid ${BillRefNumber}`);
      return res.json({ ResultCode: 'C2B00011', ResultDesc: 'Already paid' });
    }
    console.log(`[C2B-VALIDATE] ✓ accepted ${BillRefNumber}`);
    res.json({ ResultCode: '0', ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[C2B-VALIDATE] error:', err.message);
    res.json({ ResultCode: 'C2B00013', ResultDesc: 'Server error' });
  }
});

// ==================== CASHIER MANUAL CONFIRM ====================
router.post('/payment-confirm', async (req, res) => {
  const { invoice_no, payment_method = 'cash' } = req.body || {};
  console.log(`[CONFIRM] invoice=${invoice_no} method=${payment_method}`);

  try {
    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) {
      console.warn(`[CONFIRM] no session for ${invoice_no}`);
      return res.status(404).json({ error: 'Session not found' });
    }

    await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'completed', payment_method = ?, updated_at = datetime('now')
       WHERE invoice_no = ?`,
      [payment_method, invoice_no]
    );

    let saleResult = null;
    try {
      saleResult = await materializeSale({
        ...session,
        payment_method: payment_method === 'cash' ? '01' : '03',
        transaction_id: null,
      });
      console.log(`[CONFIRM] ✓ materialized saleId=${saleResult.saleId}`);
    } catch (e) {
      console.error(`[CONFIRM] materializeSale failed:`, e.message);
    }

    res.json({ success: true, sale: saleResult });
  } catch (err) {
    console.error('[CONFIRM] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CANCEL SESSION ====================
router.post('/cancel/:invoice_no', async (req, res) => {
  const { invoice_no } = req.params;
  console.log(`[CANCEL] invoice=${invoice_no}`);
  try {
    const result = await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'cancelled', updated_at = datetime('now')
       WHERE invoice_no = ? AND status IN ('pending', 'processing')`,
      [invoice_no]
    );
    console.log(`[CANCEL] ✓ rows affected=${result.changes || 0}`);
    res.json({ success: true });
  } catch (err) {
    console.error('[CANCEL] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== CONFIG CHECK ====================
router.get('/mpesa/status', (req, res) => {
  const configured = !!(CONSUMER_KEY && CONSUMER_SECRET && PASSKEY && SHORTCODE && CALLBACK_URL);
  console.log(`[STATUS] config check → configured=${configured}`);
  res.json({
    configured,
    env: process.env.MPESA_ENV || 'sandbox',
    shortcode: SHORTCODE || null,
    callback: CALLBACK_URL || null,
    paymentBase: PAYMENT_BASE_URL || null,
  });
});

// ==================== PUBLIC PAYMENT PAGE DATA ====================
router.get('/:invoice_no', async (req, res) => {
  const { invoice_no } = req.params;
  try {
    const session = await db.getAsync(
      `SELECT invoice_no, amount, status, expires_at FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) {
      console.warn(`[PUBLIC] no session for ${invoice_no}`);
      return res.status(404).json({ error: 'Payment not found' });
    }

    const expired = new Date(session.expires_at) < new Date();
    if (expired && session.status === 'pending') {
      console.log(`[PUBLIC] session expired, marking expired: ${invoice_no}`);
      await db.runAsync(
        `UPDATE payment_sessions SET status = 'expired' WHERE invoice_no = ?`,
        [session.invoice_no]
      );
      session.status = 'expired';
    }

    console.log(`[PUBLIC] ${invoice_no} → status=${session.status}`);
    res.json(session);
  } catch (err) {
    console.error(`[PUBLIC] error for ${invoice_no}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;