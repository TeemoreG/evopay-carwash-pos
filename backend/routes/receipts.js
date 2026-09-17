const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendSms, buildReceiptMessage } = require('../services/smsService');
const { streamReceiptPdf } = require('../services/pdfReceipt');

const PUBLIC_BASE_URL = (process.env.VITE_PAYMENT_BASE_URL || 'https://evopay-carwash-pos.onrender.com')
  .trim()
  .replace(/\s+/g, '');

// ==================== DIRECT PDF STREAM ====================
// SMS links here. Server generates the PDF and streams it directly.
// Browser opens PDF inline — no HTML page, no redirect.
// IMPORTANT: must be declared BEFORE /:invoice_no.
router.get('/:invoice_no/pdf', async (req, res) => {
  const { invoice_no } = req.params;
  console.log(`[RECEIPT][PDF] stream ${invoice_no}`);

  try {
    const sale = await db.getAsync(
      `SELECT * FROM sales WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!sale) {
      console.warn(`[RECEIPT][PDF] not found: ${invoice_no}`);
      return res.status(404).send('Receipt not found');
    }

    const items = await db.allAsync(
      `SELECT * FROM sales_items WHERE sale_id = ? ORDER BY item_seq ASC`,
      [sale.id]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${invoice_no}.pdf"`);
    res.setHeader('Cache-Control', 'public, max-age=300');

    await streamReceiptPdf({ ...sale, items }, PUBLIC_BASE_URL, res);
  } catch (err) {
    console.error('[RECEIPT][PDF] error:', err.message);
    if (!res.headersSent) res.status(500).send('Error generating receipt');
  }
});

// ==================== GET RECEIPT DATA (for HTML preview page, if used) ====================
router.get('/:invoice_no', async (req, res) => {
  const { invoice_no } = req.params;
  console.log(`[RECEIPT] lookup ${invoice_no}`);

  try {
    const sale = await db.getAsync(
      `SELECT * FROM sales WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!sale) {
      console.warn(`[RECEIPT] not found: ${invoice_no}`);
      return res.status(404).json({ error: 'Receipt not found' });
    }

    const items = await db.allAsync(
      `SELECT * FROM sales_items WHERE sale_id = ? ORDER BY item_seq ASC`,
      [sale.id]
    );

    res.json({
      ...sale,
      items,
      receipt_url: `${PUBLIC_BASE_URL}/receipt/${invoice_no}`,
      pdf_url: `${PUBLIC_BASE_URL}/api/receipts/${invoice_no}/pdf`,
    });
  } catch (err) {
    console.error('[RECEIPT] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ==================== RESEND SMS ====================
router.post('/:invoice_no/send-sms', async (req, res) => {
  const { invoice_no } = req.params;
  const { phone } = req.body || {};

  console.log(`[RECEIPT][SMS] requested invoice=${invoice_no} phone=${phone}`);

  try {
    if (!phone) return res.status(400).json({ error: 'phone required' });

    const sale = await db.getAsync(
      `SELECT * FROM sales WHERE invoice_no = ?`,
      [invoice_no]
    );
    if (!sale) {
      console.warn(`[RECEIPT][SMS] sale not found: ${invoice_no}`);
      return res.status(404).json({ error: 'Sale not found' });
    }

    // Point SMS at the PDF endpoint — customer lands on PDF directly
    const receiptUrl = `${PUBLIC_BASE_URL}/api/receipts/${invoice_no}/pdf`;
    const message = buildReceiptMessage({
      invoiceNo: invoice_no,
      amount: sale.total,
      receiptUrl,
    });

    const result = await sendSms({
      to: phone,
      message,
      refId: `receipt-${invoice_no}`,
    });

    if (result.success) {
      console.log(`[RECEIPT][SMS] sent to ${phone} for ${invoice_no}`);
      res.json({ success: true, msgId: result.msgId });
    } else {
      console.warn(`[RECEIPT][SMS] failed: ${result.error}`);
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (err) {
    console.error('[RECEIPT][SMS] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;