const axios = require('axios');

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE = process.env.MPESA_SHORTCODE || '174379';
const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

let token = null;
let expires = 0;

async function getToken() {
  if (token && Date.now() < expires - 60000) return token;
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const r = await axios.get(
    `${BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  );
  token = r.data.access_token;
  expires = Date.now() + r.data.expires_in * 1000;
  return token;
}

async function generateMpesaQR({ merchantName, refNo, amount, size = '300' }) {
  const t = await getToken();
  const payload = {
    MerchantName: String(merchantName || 'Evopay Car Wash').slice(0, 30),
    RefNo: String(refNo).slice(0, 12),
    Amount: Number(amount),
    TrxCode: 'BG',
    CPI: SHORTCODE,
    Size: String(size)
  };
  const r = await axios.post(
    `${BASE_URL}/mpesa/qrcode/v1/generate`,
    payload,
    { headers: { Authorization: `Bearer ${t}` }, timeout: 15000 }
  );
  return r.data; // { ResponseCode, RequestID, ResponseDescription, QRCode }
}

module.exports = { generateMpesaQR };