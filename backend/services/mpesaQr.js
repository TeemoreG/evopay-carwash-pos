const axios = require('axios');

const CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const SHORTCODE = process.env.MPESA_SHORTCODE;
const BASE_URL = process.env.MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

if (!CONSUMER_KEY || !CONSUMER_SECRET) {
  console.warn('WARN: M-Pesa consumer credentials not set — QR will fail');
}
if (!SHORTCODE) {
  console.warn('WARN: MPESA_SHORTCODE not set — QR will fail');
}

let token = null;
let expires = 0;

async function getToken() {
  if (token && Date.now() < expires - 60000) return token;
  const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');
  const r = await axios.get(
    `${BASE_URL}/oauth/v2/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` }, timeout: 10000 }
  );
  if (!r.data?.access_token) throw new Error('No access token from M-PESA');
  token = r.data.access_token;
  expires = Date.now() + r.data.expires_in * 1000;
  return token;
}

async function generateMpesaQR({ merchantName, refNo, amount, size = '300' }) {
  if (!SHORTCODE) throw new Error('MPESA_SHORTCODE is not configured');

  const t = await getToken();

  const payload = {
    MerchantName: String(merchantName || 'EVOPAY CAR WASH').slice(0, 30),
    RefNo: String(refNo).slice(0, 12),
    Amount: Number(amount),
    TrxCode: 'PB',
    CPI: SHORTCODE,
    Size: String(size)
  };

  const r = await axios.post(
    `${BASE_URL}/mpesa/qrcode/v2/generate`,
    payload,
    { headers: { Authorization: `Bearer ${t}` }, timeout: 15000 }
  );

  return r.data;
}

module.exports = { generateMpesaQR };