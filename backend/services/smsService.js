// backend/services/smsService.js
// Sends SMS via Tiara Connect gateway.
// Fails silently — SMS failures must never block a sale.

const axios = require('axios');

const TIARA_API_KEY = process.env.TIARA_API_KEY;
const TIARA_SENDER_ID = process.env.TIARA_SENDER_ID || 'TIARA';
const TIARA_ENDPOINT = process.env.TIARA_ENDPOINT || 'https://api2.tiaraconnect.io/api/messaging/sendsms';

if (!TIARA_API_KEY) {
  console.warn('[SMS] WARN: TIARA_API_KEY not set — SMS sending disabled');
}

/**
 * Normalize a Kenyan phone number to 2547XXXXXXXX / 2541XXXXXXXX.
 *
 * Accepted inputs:
 *   07XXXXXXXX   (10 digits starting 07)
 *   01XXXXXXXX   (10 digits starting 01)
 *   7XXXXXXXX    (9 digits starting 7)
 *   1XXXXXXXX    (9 digits starting 1)
 *   2547XXXXXXXX (12 digits starting 2547)
 *   2541XXXXXXXX (12 digits starting 2541)
 *   +2547XXXXXXXX / +2541XXXXXXXX (+ prefix, stripped)
 *
 * Returns the normalized 12-digit string, or null if invalid.
 */
function normalizePhone(phone) {
  if (phone === null || phone === undefined) return null;

  const raw = String(phone).trim();

  // Reject anything containing non-formatting characters
  // Allow digits, spaces, dashes, parentheses, and a leading +
  if (!/^[+\d\s\-()]+$/.test(raw)) {
    return null;
  }

  // Strip formatting
  let cleaned = raw.replace(/[^\d]/g, '');

  // Strip a leading +254 or 254 down to 9 digits for uniform handling
  if (cleaned.startsWith('254')) {
    cleaned = cleaned.slice(3);
  }

  // Now `cleaned` should be 9 or 10 digits
  if (cleaned.length === 10) {
    // 07XXXXXXXX or 01XXXXXXXX
    if (!/^0[17]\d{8}$/.test(cleaned)) return null;
    cleaned = cleaned.slice(1); // drop leading 0
  } else if (cleaned.length !== 9) {
    return null;
  }

  // Now `cleaned` is 9 digits — must start with 7 or 1
  if (!/^[17]\d{8}$/.test(cleaned)) return null;

  return '254' + cleaned;
}

/**
 * Send a single SMS.
 * Returns { success: boolean, msgId?, error? }
 * Never throws — callers can fire-and-forget.
 */
async function sendSms({ to, message, refId }) {
  if (!TIARA_API_KEY) {
    return { success: false, error: 'TIARA_API_KEY not configured' };
  }

  const phone = normalizePhone(to);
  if (!phone) {
    console.warn(`[SMS] invalid phone: ${to}`);
    return { success: false, error: `Invalid phone: ${to}` };
  }

  const payload = {
    from: TIARA_SENDER_ID,
    to: phone,
    message,
    refId: refId || undefined,
  };

  try {
    console.log(`[SMS] send -> to=${phone} ref=${refId || '-'}`);
    const res = await axios.post(TIARA_ENDPOINT, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TIARA_API_KEY}`,
      },
      timeout: 15000,
    });

    const data = res.data || {};
    if (data.status === 'SUCCESS' || data.statusCode === '0') {
      console.log(`[SMS] sent to ${phone} msgId=${data.msgId} cost=${data.cost} balance=${data.balance}`);
      return { success: true, msgId: data.msgId, cost: data.cost, balance: data.balance };
    }

    console.warn(`[SMS] failed to ${phone}:`, data.desc || data.message || 'unknown');
    return { success: false, error: data.desc || data.message || 'Tiara rejected' };
  } catch (err) {
    const details = err.response?.data || err.message;
    console.error(`[SMS] exception sending to ${phone}:`, details);
    return { success: false, error: details };
  }
}

/**
 * Build receipt SMS message.
 */
function buildReceiptMessage({ invoiceNo, amount, receiptUrl, businessName = 'Evopay Car Wash' }) {
  const amt = Number(amount || 0).toLocaleString();
  return `${businessName}: Receipt ${invoiceNo} for KES ${amt}. View: ${receiptUrl}`;
}

module.exports = { sendSms, normalizePhone, buildReceiptMessage };