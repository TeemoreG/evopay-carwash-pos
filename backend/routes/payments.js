const express = require('express');
const axios = require('axios');
const QRCode = require('qrcode');
const db = require('../db');
const mpesaQr = require('../services/mpesaQr');

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
if (!PAYMENT_BASE_URL) console.warn('WARN: VITE_PAYMENT_BASE_URL not set — QR falls back to relative');

let mpesaAccessToken = null;
let mpesaTokenExpiry = 0;

async function getMpesaAccessToken() {
  if (mpesaAccessToken && Date.now() < mpesaTokenExpiry - 60000) {
    return mpesaAccessToken;
  }
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const res = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  );
  if (!res.data?.access_token) throw new Error('No access token from M-PESA');
  mpesaAccessToken = res.data.access_token;
  mpesaTokenExpiry = Date.now() + res.data.expires_in * 1000;
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
    res.json({ invoice_no: `CW-${today}-${next}` });
  } catch (err) {
    console.error('next-invoice error:', err.message);
    res.status(500).json({ error: 'Failed to generate invoice number', details: err.message });
  }
});

// ==================== CREATE PAYMENT SESSION ====================
// Called once per sale. Idempotent — safe to retry.
router.post('/qr/generate', async (req, res) => {
  try {
    const { invoice_no, amount, sale_id } = req.body;
    if (!invoice_no || !amount || !sale_id) {
      return res.status(400).json({ error: 'invoice_no, amount, sale_id required' });
    }

    // Idempotent — return existing
    const existing = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const qrPayload = PAYMENT_BASE_URL
      ? `${PAYMENT_BASE_URL}/pay/${invoice_no}`
      : `/pay/${invoice_no}`;

    if (!existing) {
      await db.runAsync(
        `INSERT INTO payment_sessions
         (invoice_no, sale_id, amount, merchant_id, status, expires_at, created_at)
         VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'))`,
        [invoice_no, sale_id, amount, SHORTCODE, expiresAt]
      );
    }

    await db.runAsync(
      `UPDATE sales SET qr_code = ?, payment_status = 'pending' WHERE invoice_no = ?`,
      [qrPayload, invoice_no]
    ).catch(() => {});

    res.json({
      success: true,
      invoice_no,
      amount,
      qr_payload: qrPayload,
      expires_at: expiresAt,
      existing: !!existing,
    });
  } catch (err) {
    console.error('qr/generate error:', err.message);
    res.status(500).json({ error: 'Failed to create session', details: err.message });
  }
});

// ==================== M-PESA DYNAMIC QR (fast) ====================
// Called on modal mount. Safaricom endpoint is slow (2-5s) — unavoidable.
router.post('/qr/mpesa', async (req, res) => {
  const start = Date.now();
  try {
    const { invoice_no, amount } = req.body;
    if (!invoice_no || !amount) {
      return res.status(400).json({ error: 'invoice_no and amount required' });
    }

    const result = await mpesaQr.generateMpesaQR({
      merchantName: 'EVOPAY CAR WASH',
      refNo: invoice_no,
      amount,
      size: '300',
    });

    // Store a small slice for audit
    await db.runAsync(
      `UPDATE payment_sessions SET qr_code = ?, updated_at = datetime('now')
       WHERE invoice_no = ?`,
      [`MPESA_QR:${(result.QRCode || '').slice(0, 80)}`, invoice_no]
    ).catch(() => {});

    console.log(`mpesa QR generated in ${Date.now() - start}ms for ${invoice_no}`);

    res.json({
      success: true,
      mode: 'mpesa',
      qr_base64: result.QRCode,
      response_code: result.ResponseCode,
      request_id: result.RequestID,
      ms: Date.now() - start,
    });
  } catch (err) {
    console.error('mpesa qr error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to generate M-Pesa QR',
      details: err.response?.data || err.message,
    });
  }
});

// ==================== CUSTOM QR (cached, generated once) ====================
// GET → returns cached data-url if exists, else generates once and stores.
router.get('/qr/custom/:invoice_no', async (req, res) => {
  try {
    const { invoice_no } = req.params;

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Return cached if exists
    if (session.qr_code && session.qr_code.startsWith('CUSTOM_QR:')) {
      return res.json({
        success: true,
        mode: 'custom',
        qr_data_url: session.qr_code.slice('CUSTOM_QR:'.length),
        qr_payload: `${PAYMENT_BASE_URL}/pay/${invoice_no}`,
        cached: true,
      });
    }

    // Generate once
    const url = `${PAYMENT_BASE_URL || ''}/pay/${invoice_no}`;
    const dataUrl = await QRCode.toDataURL(url, { width: 300, margin: 2, errorCorrectionLevel: 'M' });

    await db.runAsync(
      `UPDATE payment_sessions SET qr_code = ?, updated_at = datetime('now') WHERE invoice_no = ?`,
      [`CUSTOM_QR:${dataUrl}`, invoice_no]
    );

    res.json({
      success: true,
      mode: 'custom',
      qr_data_url: dataUrl,
      qr_payload: url,
      cached: false,
    });
  } catch (err) {
    console.error('custom qr error:', err.message);
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
    res.json(session);
  } catch (err) {
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
    if (!session) return res.status(404).json({ error: 'Not found' });
    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== STK PUSH ====================
router.post('/stk-push', async (req, res) => {
  const { invoice_no, phone } = req.body;
  try {
    if (!invoice_no || !phone) {
      return res.status(400).json({ error: 'invoice_no and phone required' });
    }
    if (!CALLBACK_URL) {
      return res.status(500).json({ error: 'MPESA_CALLBACK_URL not configured' });
    }

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status === 'completed') {
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

    const response = await axios.post(
      `${BASE_URL}/mpesa/stkpush/v1/processrequest`,
      payload,
      { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
    );

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

    res.json({
      success: true,
      checkout_request_id: response.data.CheckoutRequestID,
      message: response.data.CustomerMessage,
    });
  } catch (err) {
    console.error('stk-push error:', err.response?.data || err.message);
    await db.runAsync(
      `UPDATE payment_sessions SET status = 'failed', updated_at = datetime('now') WHERE invoice_no = ?`,
      [invoice_no]
    ).catch(() => {});
    res.status(500).json({ error: err.response?.data?.errorMessage || err.message });
  }
});

// ==================== M-PESA STK CALLBACK ====================
router.post('/mpesa-callback', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb) return;

    const checkoutId = cb.CheckoutRequestID;
    const resultCode = cb.ResultCode;

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE mpesa_checkout_id = ?`,
      [checkoutId]
    );
    if (!session) return;

    if (resultCode === 0) {
      const items = cb.CallbackMetadata?.Item || [];
      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value || null;
      const phone = items.find(i => i.Name === 'PhoneNumber')?.Value || null;

      await db.runAsync(
        `UPDATE payment_sessions
         SET status = 'completed', transaction_id = ?, customer_phone = COALESCE(?, customer_phone),
             updated_at = datetime('now')
         WHERE id = ?`,
        [receipt, phone, session.id]
      );

      await db.runAsync(
        `UPDATE sales SET status = 'Completed', payment_method = '03',
                          payment_status = 'completed', mpesa_transaction_id = ?
         WHERE invoice_no = ?`,
        [receipt, session.invoice_no]
      ).catch(() => {});
    } else {
      const status = resultCode === 1032 ? 'cancelled' : 'failed';
      await db.runAsync(
        `UPDATE payment_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`,
        [status, session.id]
      );
    }
  } catch (err) {
    console.error('mpesa-callback error:', err.message);
  }
});

// ==================== C2B CALLBACK (for Dynamic QR scans) ====================
// Flat payload — no Body.stkCallback wrapper.
router.post('/c2b-callback', async (req, res) => {
  res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const {
      TransID, TransAmount, BillRefNumber, MSISDN, FirstName, TransTime,
    } = req.body || {};

    console.log('C2B callback received:', { TransID, TransAmount, BillRefNumber, MSISDN });

    if (!BillRefNumber) return;

    const session = await db.getAsync(
      `SELECT * FROM payment_sessions WHERE invoice_no = ?`,
      [BillRefNumber]
    );
    if (!session) {
      console.warn('C2B: no session for invoice', BillRefNumber);
      return;
    }
    if (session.status === 'completed') return;

    await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'completed', transaction_id = ?, customer_phone = COALESCE(?, customer_phone),
           payment_method = 'mpesa', updated_at = datetime('now')
       WHERE id = ?`,
      [TransID, MSISDN, session.id]
    );

    await db.runAsync(
      `UPDATE sales SET status = 'Completed', payment_method = '03',
                        payment_status = 'completed', mpesa_transaction_id = ?
       WHERE invoice_no = ?`,
      [TransID, BillRefNumber]
    ).catch(() => {});

    console.log(`C2B confirmed: ${BillRefNumber} → ${TransID}`);
  } catch (err) {
    console.error('c2b-callback error:', err.message);
  }
});

// ==================== C2B VALIDATION (Safaricom pre-check) ====================
// Safaricom calls this BEFORE processing. Must return 0 to allow.
router.post('/c2b-validation', async (req, res) => {
  try {
    const { BillRefNumber } = req.body || {};
    if (!BillRefNumber) {
      return res.json({ ResultCode: 'C2B00012', ResultDesc: 'Invalid account' });
    }
    const session = await db.getAsync(
      `SELECT status FROM payment_sessions WHERE invoice_no = ?`,
      [BillRefNumber]
    );
    if (!session) {
      return res.json({ ResultCode: 'C2B00012', ResultDesc: 'Unknown invoice' });
    }
    if (session.status === 'completed') {
      return res.json({ ResultCode: 'C2B00011', ResultDesc: 'Already paid' });
    }
    res.json({ ResultCode: '0', ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('c2b-validation error:', err.message);
    res.json({ ResultCode: 'C2B00013', ResultDesc: 'Server error' });
  }
});

// ==================== CASHIER MANUAL CONFIRM ====================
router.post('/payment-confirm', async (req, res) => {
  try {
    const { invoice_no, payment_method = 'cash' } = req.body;
    await db.runAsync(
      `UPDATE payment_sessions
       SET status = 'completed', payment_method = ?, updated_at = datetime('now')
       WHERE invoice_no = ?`,
      [payment_method, invoice_no]
    );
    await db.runAsync(
      `UPDATE sales SET status = 'Completed', payment_method = ?, payment_status = 'completed'
       WHERE invoice_no = ?`,
      [payment_method === 'cash' ? '01' : '03', invoice_no]
    ).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== PUBLIC PAYMENT PAGE DATA ====================
router.get('/pay/:invoice_no', async (req, res) => {
  try {
    const session = await db.getAsync(
      `SELECT invoice_no, amount, status, expires_at FROM payment_sessions WHERE invoice_no = ?`,
      [req.params.invoice_no]
    );
    if (!session) return res.status(404).json({ error: 'Payment not found' });

    const expired = new Date(session.expires_at) < new Date();
    if (expired && session.status === 'pending') {
      await db.runAsync(
        `UPDATE payment_sessions SET status = 'expired' WHERE invoice_no = ?`,
        [session.invoice_no]
      );
      session.status = 'expired';
    }

    res.json(session);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==================== CONFIG CHECK ====================
router.get('/mpesa/status', (req, res) => {
  const configured = !!(CONSUMER_KEY && CONSUMER_SECRET && PASSKEY && SHORTCODE && CALLBACK_URL);
  res.json({
    configured,
    env: process.env.MPESA_ENV || 'sandbox',
    shortcode: SHORTCODE || null,
    callback: CALLBACK_URL || null,
    paymentBase: PAYMENT_BASE_URL || null,
  });
});

module.exports = router;