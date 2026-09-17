const axios = require('axios');

const TIARA_API_KEY = process.env.TIARA_API_KEY;
const TIARA_SENDER_ID = process.env.TIARA_SENDER_ID || 'EVOPAY';
const TIARA_ENDPOINT = process.env.TIARA_ENDPOINT || 'https://api2.tiaraconnect.io/api/messaging/sendsms';

if (!TIARA_API_KEY) {
  console.warn('[SMS] WARN: TIARA_API_KEY not set — SMS sending disabled');
}

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
/**
 * Build receipt SMS message.
 * Includes customer name, amount, thank-you, and PDF link.
 * Kept concise to stay within 160-char SMS billing unit where possible.
 */
function buildReceiptMessage({ invoiceNo, amount, receiptUrl, customerName, businessName = 'Evopay Car Wash' }) {
  const amt = Number(amount || 0).toLocaleString();
  const cleanUrl = String(receiptUrl || '').trim().replace(/\s+/g, '');
  const name = String(customerName || '').trim();
  const greeting = name && name.toLowerCase() !== 'walk-in customer' && name.toLowerCase() !== 'walk-in'
    ? `Hi ${name}, `
    : 'Hi, ';
  return `${greeting}thank you for choosing ${businessName}. Your receipt for KES ${amt} (${invoiceNo}) is ready: ${cleanUrl}`;
}
module.exports = { sendSms, normalizePhone, buildReceiptMessage };