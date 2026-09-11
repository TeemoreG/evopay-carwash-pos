// backend/routes/sales.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const vscuClient = require('../services/vscuClient');
const axios = require('axios');
const round2 = (num) => Math.round((num || 0) * 100) / 100;

const extractNumericInvoice = (invoiceNo) => {
  if (!invoiceNo) return 0;
  const digits = String(invoiceNo).replace(/[^0-9]/g, '');
  if (!digits) return 0;
  return parseInt(digits.slice(-11), 10) || 0;
};

// ============================================
// VSCU PROXY
// ============================================
router.post('/saveSales', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.tin) payload.tin = process.env.TIN;
    if (!payload.bhfId) payload.bhfId = process.env.BHF_ID;

    const headers = {
      tin: payload.tin,
      bhfId: payload.bhfId,
      cmckey: process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/trnsSales/saveSales`,
      payload,
      { headers, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      resultCd: '999',
      resultMsg: error.message,
      error: error.message
    });
  }
});

// ============================================
// CREATE SALE
// ============================================
router.post('/', async (req, res) => {
  try {
    const {
      invoice_no, customer, customer_pin, cashier, items,
      subtotal, tax, total, payment_method, date, receipt,
      sales_type, receipt_type, org_invoice_no,
      discount_type, discount_value, remarks
    } = req.body;

    const invoiceNo = invoice_no && String(invoice_no).trim()
      ? String(invoice_no).trim()
      : `INV-${Date.now().toString().slice(-6)}`;

    const now = new Date().toISOString();

    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    let finalPaymentMethod = '01';
    if (payment_method !== undefined && payment_method !== null && payment_method !== '') {
      let method = String(payment_method).trim();
      if (method.length === 1 && !isNaN(method)) method = '0' + method;
      if (['01', '02', '03'].includes(method)) finalPaymentMethod = method;
    }

    // ============================================
    // VALIDATE STOCK — products only
    // ============================================
    for (const item of items) {
      const meta = await db.getAsync(
        `SELECT stock, item_name, item_type, item_ty_cd FROM items WHERE item_cd = ?`,
        [item.item_cd]
      );
      if (!meta) {
        return res.status(400).json({ error: `Item ${item.item_cd} not found` });
      }
      const isProduct = meta.item_type === 'product' || meta.item_ty_cd === '1';
      if (isProduct && meta.stock < item.quantity) {
        return res.status(400).json({
          error: `Insufficient stock for ${meta.item_name}! Available: ${meta.stock}, Requested: ${item.quantity}`
        });
      }
    }

    // ============================================
    // BUILD VSCU PAYLOAD
    // ============================================
    let rcptTyCd = 'S';
    if (receipt_type === 'NC') rcptTyCd = 'C';
    else if (receipt_type === 'CS') rcptTyCd = 'C';
    else if (receipt_type === 'PS') rcptTyCd = 'P';

    const vscuPayload = {
      tin: process.env.TIN,
      bhfId: process.env.BHF_ID,
      invcNo: extractNumericInvoice(invoiceNo),
      orgInvcNo: org_invoice_no ? extractNumericInvoice(org_invoice_no) : 0,
      custTin: customer_pin || '',
      custNm: customer || 'Walk-in Customer',
      salesTyCd: sales_type || 'N',
      rcptTyCd,
      pmtTyCd: finalPaymentMethod,
      salesSttsCd: '02',
      cfmDt: now.replace(/[-:T.]/g, '').slice(0, 14),
      salesDt: (date || now.slice(0, 10)).replace(/-/g, ''),
      stockRlsDt: now.replace(/[-:T.]/g, '').slice(0, 14),
      cnclReqDt: null,
      cnclDt: null,
      rfdDt: null,
      rfdRsnCd: null,
      totItemCnt: Number(items.length),
      taxblAmtA: 0,
      taxblAmtB: round2(Number(tax || 0)),
      taxblAmtC: 0,
      taxblAmtD: 0,
      taxblAmtE: 0,
      taxRtA: 0,
      taxRtB: 16,
      taxRtC: 0,
      taxRtD: 0,
      taxRtE: 0,
      taxAmtA: 0,
      taxAmtB: round2(Number(tax || 0)),
      taxAmtC: 0,
      taxAmtD: 0,
      taxAmtE: 0,
      totTaxblAmt: round2(Number(subtotal || 0)),
      totTaxAmt: round2(Number(tax || 0)),
      totAmt: round2(Number(total || 0)),
      prchrAcptcYn: 'N',
      remark: remarks || null,
      regrId: cashier || '11999',
      regrNm: cashier || 'TestVSCU',
      modrId: cashier || '45678',
      modrNm: cashier || 'TestVSCU',
      receipt: {
        custTin: customer_pin || '',
        custMblNo: null,
        rptNo: 1,
        trdeNm: 'Evopay',
        adrs: '',
        topMsg: receipt?.topMsg || 'Thank you for your business!',
        btmMsg: receipt?.btmMsg || 'KRA eTIMS VSCU v2.0.21',
        prchrAcptcYn: 'N'
      },
      itemList: items.map((item, idx) => ({
        itemSeq: idx + 1,
        itemCd: item.item_cd,
        itemClsCd: item.item_cls_cd || '50101010',
        itemNm: item.item_name,
        bcd: null,
        pkgUnitCd: 'NT',
        pkg: 1,
        qtyUnitCd: 'U',
        qty: Number(item.quantity || 0),
        prc: round2(Number(item.price || 0)),
        splyAmt: round2((item.quantity || 0) * (item.price || 0)),
        dcRt: 0,
        dcAmt: 0,
        isrccCd: null,
        isrccNm: null,
        isrcRt: null,
        isrcAmt: null,
        taxTyCd: item.tax_type || 'B',
        taxblAmt: round2(Number(item.total || 0)),
        taxAmt: round2(Number(item.tax_amount || 0)),
        totAmt: round2(Number(item.total || 0))
      }))
    };

    // ============================================
    // SAVE TO DB
    // ============================================
    const result = await db.runAsync(
      `INSERT INTO sales 
       (invoice_no, customer, customer_pin, cashier, subtotal, tax, total, payment_method, 
        sales_type, receipt_type, org_invoice_no, discount_type, discount_value, remarks,
        status, synced, vscu_signature, receipt_no, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNo,
        customer || 'Walk-in Customer',
        customer_pin || '',
        cashier || 'Unknown',
        subtotal || 0,
        tax || 0,
        total || 0,
        finalPaymentMethod,
        sales_type || 'N',
        receipt_type || 'NS',
        org_invoice_no || null,
        discount_type || null,
        discount_value || null,
        remarks || null,
        'Pending',
        0,
        null,
        null,
        date || now.slice(0, 10),
        now
      ]
    );

    const saleId = result.lastID;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await db.runAsync(
        `INSERT INTO sales_items 
         (sale_id, item_seq, item_cd, item_name, item_cls_cd, quantity, price, tax_type, tax_amount, total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId, i + 1, item.item_cd, item.item_name,
          item.item_cls_cd || '50101010',
          item.quantity || 0, item.price || 0,
          item.tax_type || 'B', item.tax_amount || 0, item.total || 0
        ]
      );
    }

    // ============================================
    // SYNC TO VSCU
    // ============================================
    let synced = false;
    let queued = false;
    let vscuResponse = null;
    let signature = null;
    let receiptNo = null;

    try {
      const status = await vscuClient.checkStatus();

      if (status.connected) {
        vscuResponse = await vscuClient.sendSale(vscuPayload);

        if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
          synced = true;
          signature = vscuResponse.data?.rcptSign || '';
          receiptNo = vscuResponse.data?.rcptNo || vscuResponse.data?.rcptInvcNo || '';

          // Deduct stock — products only
          for (const item of items) {
            const meta = await db.getAsync(
              `SELECT item_type, item_ty_cd FROM items WHERE item_cd = ?`,
              [item.item_cd]
            );
            const isProduct = meta?.item_type === 'product' || meta?.item_ty_cd === '1';
            if (!isProduct) continue;

            await db.runAsync(
              `UPDATE items SET stock = stock - ? WHERE item_cd = ?`,
              [item.quantity, item.item_cd]
            );
            await db.runAsync(
              `INSERT INTO stock_movements (item_cd, quantity, type, reference, date, created_at)
               VALUES (?, ?, 'OUT', ?, ?, ?)`,
              [item.item_cd, item.quantity, invoiceNo, date || now.slice(0, 10), now]
            );
          }

          // Push stock to VSCU — products only
          try {
            for (const item of items) {
              const meta = await db.getAsync(
                `SELECT item_type, item_ty_cd FROM items WHERE item_cd = ?`,
                [item.item_cd]
              );
              const isProduct = meta?.item_type === 'product' || meta?.item_ty_cd === '1';
              if (!isProduct) continue;

              const stockPayload = {
                tin: process.env.TIN,
                bhfId: process.env.BHF_ID,
                sarNo: extractNumericInvoice(invoiceNo),
                orgSarNo: 0,
                regTyCd: 'M',
                custTin: customer_pin || null,
                custNm: customer || null,
                custBhfId: null,
                sarTyCd: '02',
                ocrnDt: (date || now.slice(0, 10)).replace(/-/g, ''),
                totItemCnt: 1,
                totTaxblAmt: round2(Number(item.total || 0)),
                totTaxAmt: round2(Number(item.tax_amount || 0)),
                totAmt: round2(Number(item.total || 0)),
                remark: null,
                regrId: cashier || 'Admin',
                regrNm: cashier || 'Admin',
                modrNm: cashier || 'Admin',
                modrId: cashier || 'Admin',
                itemList: [{
                  itemSeq: 1,
                  itemCd: item.item_cd,
                  itemClsCd: item.item_cls_cd || '50101010',
                  itemNm: item.item_name,
                  bcd: null,
                  pkgUnitCd: 'NT',
                  pkg: 1,
                  qtyUnitCd: 'U',
                  qty: item.quantity || 0,
                  itemExprDt: null,
                  prc: round2(Number(item.price || 0)),
                  splyAmt: round2((item.quantity || 0) * (item.price || 0)),
                  totDcAmt: 0,
                  taxblAmt: round2(Number(item.total || 0)),
                  taxTyCd: item.tax_type || 'B',
                  taxAmt: round2(Number(item.tax_amount || 0)),
                  totAmt: round2(Number(item.total || 0))
                }]
              };
              await vscuClient.saveStock(stockPayload);
            }
          } catch (stockError) {
            console.error('Stock sync error:', stockError.message);
          }

        } else {
          const errorMsg = vscuResponse?.resultMsg || vscuResponse?.message || 'VSCU error';
          await db.runAsync(
            `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
            ['/trnsSales/saveSales', JSON.stringify(vscuPayload), `VSCU: ${errorMsg}`, now]
          );
          queued = true;
        }
      } else {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/trnsSales/saveSales', JSON.stringify(vscuPayload), 'VSCU offline', now]
        );
        queued = true;
      }
    } catch (vscuError) {
      await db.runAsync(
        `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
        ['/trnsSales/saveSales', JSON.stringify(vscuPayload), vscuError.message || 'Network error', now]
      );
      queued = true;
    }

    const finalStatus = synced ? 'Completed' : 'Pending';
    const syncedFlag = synced ? 1 : 0;

    await db.runAsync(
      `UPDATE sales SET status = ?, synced = ?, vscu_signature = ?, receipt_no = ? WHERE id = ?`,
      [finalStatus, syncedFlag, signature || null, receiptNo || null, saleId]
    );

    const updatedSale = await db.getAsync(`SELECT * FROM sales WHERE id = ?`, [saleId]);
    const updatedItems = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [saleId]);
    updatedSale.items = updatedItems;

    res.json({
      success: true,
      synced,
      queued,
      saleId,
      invoiceNo,
      paymentMethod: finalPaymentMethod,
      vscuResponse,
      signature,
      receipt: { number: receiptNo, signature, status: finalStatus },
      message: synced ? 'Sale synced to KRA' : queued ? 'Sale saved and queued for sync' : 'Sale saved locally',
      sale: updatedSale
    });

  } catch (error) {
    console.error('Sale error:', error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// ============================================
// GET ALL SALES
// ============================================
router.get('/', async (req, res) => {
  try {
    const { start, end, status } = req.query;
    let sql = `SELECT * FROM sales WHERE 1=1`;
    const params = [];

    if (start) { sql += ` AND date >= ?`; params.push(start); }
    if (end) { sql += ` AND date <= ?`; params.push(end); }
    if (status) { sql += ` AND status = ?`; params.push(status); }
    sql += ` ORDER BY date DESC, id DESC`;

    const rows = await db.allAsync(sql, params);
    for (const sale of rows) {
      const items = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [sale.id]);
      sale.items = items;
      sale.totItemCnt = items.length;
    }
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET SINGLE SALE
// ============================================
router.get('/:id', async (req, res) => {
  try {
    const sale = await db.getAsync(`SELECT * FROM sales WHERE id = ?`, [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [req.params.id]);
    res.json({ ...sale, items });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RETRY FAILED SYNC
// ============================================
router.post('/:id/retry', async (req, res) => {
  try {
    const sale = await db.getAsync(`SELECT * FROM sales WHERE id = ? AND synced = 0`, [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found or already synced' });

    const items = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [req.params.id]);
    const now = new Date().toISOString();

    let rcptTyCd = 'S';
    if (sale.receipt_type === 'NC') rcptTyCd = 'C';
    else if (sale.receipt_type === 'CS') rcptTyCd = 'C';
    else if (sale.receipt_type === 'PS') rcptTyCd = 'P';

    const vscuPayload = {
      tin: process.env.TIN,
      bhfId: process.env.BHF_ID,
      invcNo: extractNumericInvoice(sale.invoice_no),
      orgInvcNo: sale.org_invoice_no ? extractNumericInvoice(sale.org_invoice_no) : 0,
      custTin: sale.customer_pin || '',
      custNm: sale.customer || 'Walk-in Customer',
      salesTyCd: sale.sales_type || 'N',
      rcptTyCd,
      pmtTyCd: sale.payment_method || '01',
      salesSttsCd: '02',
      cfmDt: now.replace(/[-:T.]/g, '').slice(0, 14),
      salesDt: sale.date ? sale.date.replace(/-/g, '') : now.replace(/[-:T.]/g, '').slice(0, 8),
      stockRlsDt: now.replace(/[-:T.]/g, '').slice(0, 14),
      cnclReqDt: null, cnclDt: null, rfdDt: null, rfdRsnCd: null,
      totItemCnt: items.length,
      taxblAmtA: 0,
      taxblAmtB: round2(Number(sale.tax || 0)),
      taxblAmtC: 0, taxblAmtD: 0, taxblAmtE: 0,
      taxRtA: 0, taxRtB: 16, taxRtC: 0, taxRtD: 0, taxRtE: 0,
      taxAmtA: 0,
      taxAmtB: round2(Number(sale.tax || 0)),
      taxAmtC: 0, taxAmtD: 0, taxAmtE: 0,
      totTaxblAmt: round2(Number(sale.subtotal || 0)),
      totTaxAmt: round2(Number(sale.tax || 0)),
      totAmt: round2(Number(sale.total || 0)),
      prchrAcptcYn: 'N',
      remark: sale.remarks || null,
      regrId: sale.cashier || '11999',
      regrNm: sale.cashier || 'TestVSCU',
      modrId: sale.cashier || '45678',
      modrNm: sale.cashier || 'TestVSCU',
      receipt: {
        custTin: sale.customer_pin || '',
        custMblNo: null,
        rptNo: 1,
        trdeNm: 'Evopay',
        adrs: '',
        topMsg: 'Thank you for your business!',
        btmMsg: 'KRA eTIMS VSCU v2.0.21',
        prchrAcptcYn: 'N'
      },
      itemList: items.map((item, idx) => ({
        itemSeq: idx + 1,
        itemCd: item.item_cd,
        itemClsCd: item.item_cls_cd || '50101010',
        itemNm: item.item_name,
        bcd: null,
        pkgUnitCd: 'NT',
        pkg: 1,
        qtyUnitCd: 'U',
        qty: item.quantity || 0,
        prc: round2(Number(item.price || 0)),
        splyAmt: round2((item.quantity || 0) * (item.price || 0)),
        dcRt: 0, dcAmt: 0,
        isrccCd: null, isrccNm: null, isrcRt: null, isrcAmt: null,
        taxTyCd: item.tax_type || 'B',
        taxblAmt: round2(Number(item.total || 0)),
        taxAmt: round2(Number(item.tax_amount || 0)),
        totAmt: round2(Number(item.total || 0))
      }))
    };

    const vscuResponse = await vscuClient.sendSale(vscuPayload);

    if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
      await db.runAsync(
        `UPDATE sales SET status = 'Completed', synced = 1, synced_at = ?, 
         vscu_signature = ?, receipt_no = ? WHERE id = ?`,
        [now, vscuResponse.data?.rcptSign || '',
          vscuResponse.data?.rcptNo || vscuResponse.data?.rcptInvcNo || '', req.params.id]
      );
      res.json({ success: true, synced: true, vscuResponse });
    } else {
      res.json({ success: false, synced: false, vscuResponse });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SALES SUMMARY
// ============================================
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await db.getAsync(`SELECT COUNT(*) as count FROM sales`);
    const completed = await db.getAsync(`SELECT COUNT(*) as count, SUM(total) as revenue FROM sales WHERE status = 'Completed'`);
    const pending = await db.getAsync(`SELECT COUNT(*) as count FROM sales WHERE status = 'Pending'`);
    const taxTotal = await db.getAsync(`SELECT SUM(tax) as tax FROM sales WHERE status = 'Completed'`);

    res.json({
      total: total?.count || 0,
      completed: completed?.count || 0,
      pending: pending?.count || 0,
      revenue: completed?.revenue || 0,
      tax: taxTotal?.tax || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;