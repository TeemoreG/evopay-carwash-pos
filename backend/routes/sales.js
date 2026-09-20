// backend/routes/sales.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const vscuClient = require('../services/vscuClient');
const axios = require('axios');
const round2 = (num) => Math.round((num || 0) * 100) / 100;

const extractNumericInvoice = (invoiceNo) => {
  if (!invoiceNo) return 0;
  const match = String(invoiceNo).match(/^CW-(\d{8})-(\d+)$/);
  if (!match) {
    const digits = String(invoiceNo).replace(/[^0-9]/g, '');
    return parseInt(digits.slice(-10), 10) || 0;
  }
  const [, date, seq] = match;
  const shortDate = date.slice(-5);
  const shortSeq = seq.padStart(4, '0').slice(-4);
  return parseInt(`${shortDate}${shortSeq}`, 10);
};

// ============================================
// VSCU PROXY
// ============================================
router.post('/saveSales', async (req, res) => {
  const t0 = Date.now();
  try {
    const payload = req.body;
    if (!payload.tin) payload.tin = process.env.TIN;
    if (!payload.bhfId) payload.bhfId = process.env.BHF_ID;

    console.log(`[SALE][VSCU-PROXY] invcNo=${payload.invcNo} totAmt=${payload.totAmt}`);

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
    console.log(`[SALE][VSCU-PROXY] ✓ resultCd=${response.data?.resultCd} (${Date.now() - t0}ms)`);
    res.json(response.data);
  } catch (error) {
    console.error(`[SALE][VSCU-PROXY] ✗ (${Date.now() - t0}ms):`, error.message);
    res.status(500).json({
      resultCd: '999',
      resultMsg: error.message,
      error: error.message
    });
  }
});

// ============================================
// CREATE SALE (cash + direct sale, not QR)
// ============================================
router.post('/', async (req, res) => {
  const t0 = Date.now();
  const {
    invoice_no, customer, cashier, items,
    subtotal, tax, total, payment_method, date
  } = req.body;

  console.log(`[SALE] start invoice=${invoice_no} method=${payment_method} items=${items?.length} total=${total}`);

  try {
    const invoiceNo = invoice_no && String(invoice_no).trim()
      ? String(invoice_no).trim()
      : `INV-${Date.now().toString().slice(-6)}`;

    const now = new Date().toISOString();

    if (!items || items.length === 0) {
      console.warn('[SALE] rejected: no items');
      return res.status(400).json({ error: 'At least one item is required' });
    }

    let finalPaymentMethod = '01';
    if (payment_method !== undefined && payment_method !== null && payment_method !== '') {
      let method = String(payment_method).trim();
      if (method.length === 1 && !isNaN(method)) method = '0' + method;
      if (['01', '02', '03'].includes(method)) finalPaymentMethod = method;
    }

    const initialPaymentStatus = finalPaymentMethod === '01' ? 'completed' : 'pending';

    // ---- Stock validation ----
    for (const item of items) {
      const meta = await db.getAsync(
        `SELECT stock, item_name, item_type, item_ty_cd FROM items WHERE item_cd = ?`,
        [item.item_cd]
      );
      if (!meta) {
        console.warn(`[SALE] rejected: item not found ${item.item_cd}`);
        return res.status(400).json({ error: `Item ${item.item_cd} not found` });
      }
      const isProduct = meta.item_type === 'product' || meta.item_ty_cd === '1';
      if (isProduct && meta.stock < item.quantity) {
        console.warn(`[SALE] rejected: insufficient stock for ${meta.item_name}`);
        return res.status(400).json({
          error: `Insufficient stock for ${meta.item_name}! Available: ${meta.stock}, Requested: ${item.quantity}`
        });
      }
    }

    // ---- Build VSCU payload ----
    let rcptTyCd = 'S';
    const { receipt_type, sales_type, org_invoice_no, discount_type, discount_value, remarks, customer_pin, receipt } = req.body;
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
      cnclReqDt: '',
      cnclDt: '',
      rfdDt: '',
      rfdRsnCd: '',
      totItemCnt: Number(items.length),
      taxblAmtA: 0,
      taxblAmtB: round2(Number(subtotal || 0)),
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
      remark: remarks || '',
      regrId: cashier || '11999',
      regrNm: cashier || 'TestVSCU',
      modrId: cashier || '45678',
      modrNm: cashier || 'TestVSCU',
      receipt: {
        custTin: customer_pin || '',
        custMblNo: '',
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
        bcd: '',
        pkgUnitCd: 'NT',
        pkg: 1,
        qtyUnitCd: 'U',
        qty: Number(item.quantity || 0),
        prc: round2(Number(item.price || 0)),
        splyAmt: round2((item.quantity || 0) * (item.price || 0)),
        dcRt: 0,
        dcAmt: 0,
        isrccCd: '',
        isrccNm: '',
        isrcRt: '',
        isrcAmt: '',
        taxTyCd: item.tax_type || 'B',
        taxblAmt: round2(Number(item.total || 0)),
        taxAmt: round2(Number(item.tax_amount || 0)),
        totAmt: round2(Number(item.total || 0))
      }))
    };

    // ---- Insert sale ----
    const result = await db.runAsync(
      `INSERT INTO sales 
       (invoice_no, customer, customer_pin, cashier, subtotal, tax, total, payment_method, 
        sales_type, receipt_type, org_invoice_no, discount_type, discount_value, remarks,
        status, synced, vscu_signature, receipt_no, date, created_at, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        now,
        initialPaymentStatus
      ]
    );

    const saleId = result.lastID;
    console.log(`[SALE] DB inserted saleId=${saleId} payment_status=${initialPaymentStatus}`);

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

    // ---- Stock deduct ----
    let stockAdjusted = 0;
    for (const item of items) {
      try {
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
        stockAdjusted++;
      } catch (stockErr) {
        console.error(`[SALE] stock deduct failed for ${item.item_cd}:`, stockErr.message);
      }
    }
    if (stockAdjusted) console.log(`[SALE] stock adjusted for ${stockAdjusted} product(s)`);

    // ---- VSCU sync ----
    let synced = false;
    let queued = false;
    let vscuResponse = null;
    let signature = null;
    let receiptNo = null;

    const vscuStart = Date.now();
    try {
      const status = await vscuClient.checkStatus();
      console.log(`[SALE][VSCU] status: connected=${status.connected} online=${status.online}`);

      if (status.connected) {
        vscuResponse = await vscuClient.sendSale(vscuPayload);
        console.log(`[SALE][VSCU] ← resultCd=${vscuResponse?.resultCd} resultMsg=${vscuResponse?.resultMsg || '-'}`);

        if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
          synced = true;
          signature = vscuResponse.data?.rcptSign || '';
          receiptNo = vscuResponse.data?.rcptNo || vscuResponse.data?.rcptInvcNo || '';
          console.log(`[SALE][VSCU] ✓ synced in ${Date.now() - vscuStart}ms | rcptNo=${receiptNo}`);

          // Push stock movements to VSCU (best-effort)
          let stockPushed = 0;
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
              stockPushed++;
            }
            if (stockPushed) console.log(`[SALE][VSCU] stock pushed for ${stockPushed} item(s)`);
          } catch (stockError) {
            console.error('[SALE][VSCU] stock push error:', stockError.message);
          }

        } else {
          const errorMsg = vscuResponse?.resultMsg || vscuResponse?.message || 'VSCU error';
          await db.runAsync(
            `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
            ['/trnsSales/saveSales', JSON.stringify(vscuPayload), `VSCU: ${errorMsg}`, now]
          );
          queued = true;
          console.warn(`[SALE][VSCU] VSCU rejected → queued. reason=${errorMsg}`);
        }
      } else {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/trnsSales/saveSales', JSON.stringify(vscuPayload), 'VSCU offline', now]
        );
        queued = true;
        console.warn('[SALE][VSCU] VSCU offline → queued');
      }
    } catch (vscuError) {
      await db.runAsync(
        `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
        ['/trnsSales/saveSales', JSON.stringify(vscuPayload), vscuError.message || 'Network error', now]
      );
      queued = true;
      console.error('[SALE][VSCU] exception → queued:', vscuError.message);
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

    console.log(`[SALE] ✓ done saleId=${saleId} synced=${synced} queued=${queued} (${Date.now() - t0}ms)`);

    res.json({
      success: true,
      synced,
      queued,
      saleId,
      invoiceNo,
      paymentMethod: finalPaymentMethod,
      paymentStatus: initialPaymentStatus,
      vscuResponse,
      signature,
      receipt: { number: receiptNo, signature, status: finalStatus },
      message: synced ? 'Sale synced to KRA' : queued ? 'Sale saved and queued for sync' : 'Sale saved locally',
      sale: updatedSale
    });

  } catch (error) {
    console.error(`[SALE] ✗ failed (${Date.now() - t0}ms):`, error.message);
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
    const { start, end, status, include_pending } = req.query;
    let sql = `SELECT * FROM sales WHERE 1=1`;
    const params = [];

    if (start) { sql += ` AND date >= ?`; params.push(start); }
    if (end) { sql += ` AND date <= ?`; params.push(end); }
    if (status) { sql += ` AND status = ?`; params.push(status); }

    if (include_pending !== '1') {
      sql += ` AND payment_status = 'completed'`;
    }

    sql += ` ORDER BY date DESC, id DESC`;

    const rows = await db.allAsync(sql, params);
    for (const sale of rows) {
      const items = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [sale.id]);
      sale.items = items;
      sale.totItemCnt = items.length;
    }
    console.log(`[SALE][LIST] returned ${rows.length} sale(s) (include_pending=${include_pending === '1'})`);
    res.json(rows);
  } catch (error) {
    console.error('[SALE][LIST] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// GET SINGLE SALE (by invoice)
// ============================================
router.get('/by-invoice/:invoice_no', async (req, res) => {
  try {
    const sale = await db.getAsync(
      `SELECT * FROM sales WHERE invoice_no = ?`,
      [req.params.invoice_no]
    );
    if (!sale) {
      console.warn(`[SALE][BY-INVOICE] not found: ${req.params.invoice_no}`);
      return res.status(404).json({ error: 'Sale not found' });
    }
    const items = await db.allAsync(
      `SELECT * FROM sales_items WHERE sale_id = ?`,
      [sale.id]
    );
    console.log(`[SALE][BY-INVOICE] ${req.params.invoice_no} → saleId=${sale.id} items=${items.length} synced=${sale.synced}`);
    res.json({ ...sale, items });
  } catch (err) {
    console.error('[SALE][BY-INVOICE] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const sale = await db.getAsync(`SELECT * FROM sales WHERE id = ?`, [req.params.id]);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    const items = await db.allAsync(`SELECT * FROM sales_items WHERE sale_id = ?`, [req.params.id]);
    res.json({ ...sale, items });
  } catch (error) {
    console.error('[SALE][BY-ID] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// RETRY FAILED SYNC
// ============================================
router.post('/:id/retry', async (req, res) => {
  const t0 = Date.now();
  console.log(`[SALE][RETRY] saleId=${req.params.id}`);
  try {
    const sale = await db.getAsync(`SELECT * FROM sales WHERE id = ? AND synced = 0`, [req.params.id]);
    if (!sale) {
      console.warn(`[SALE][RETRY] not found or already synced: ${req.params.id}`);
      return res.status(404).json({ error: 'Sale not found or already synced' });
    }

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
      cnclReqDt: '',
      cnclDt: '',
      rfdDt: '',
      rfdRsnCd: '',
      totItemCnt: items.length,
      taxblAmtA: 0,
      taxblAmtB: round2(Number(sale.subtotal || 0)),
      taxblAmtC: 0,
      taxblAmtD: 0,
      taxblAmtE: 0,
      taxRtA: 0,
      taxRtB: 16,
      taxRtC: 0,
      taxRtD: 0,
      taxRtE: 0,
      taxAmtA: 0,
      taxAmtB: round2(Number(sale.tax || 0)),
      taxAmtC: 0,
      taxAmtD: 0,
      taxAmtE: 0,
      totTaxblAmt: round2(Number(sale.subtotal || 0)),
      totTaxAmt: round2(Number(sale.tax || 0)),
      totAmt: round2(Number(sale.total || 0)),
      prchrAcptcYn: 'N',
      remark: sale.remarks || '',
      regrId: sale.cashier || '11999',
      regrNm: sale.cashier || 'TestVSCU',
      modrId: sale.cashier || '45678',
      modrNm: sale.cashier || 'TestVSCU',
      receipt: {
        custTin: sale.customer_pin || '',
        custMblNo: '',
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
        bcd: '',
        pkgUnitCd: 'NT',
        pkg: 1,
        qtyUnitCd: 'U',
        qty: item.quantity || 0,
        prc: round2(Number(item.price || 0)),
        splyAmt: round2((item.quantity || 0) * (item.price || 0)),
        dcRt: 0,
        dcAmt: 0,
        isrccCd: '',
        isrccNm: '',
        isrcRt: '',
        isrcAmt: '',
        taxTyCd: item.tax_type || 'B',
        taxblAmt: round2(Number(item.total || 0)),
        taxAmt: round2(Number(item.tax_amount || 0)),
        totAmt: round2(Number(item.total || 0))
      }))
    };

    const vscuResponse = await vscuClient.sendSale(vscuPayload);
    console.log(`[SALE][RETRY] ← resultCd=${vscuResponse?.resultCd} (${Date.now() - t0}ms)`);

    if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
      await db.runAsync(
        `UPDATE sales SET status = 'Completed', synced = 1, synced_at = ?, 
         vscu_signature = ?, receipt_no = ? WHERE id = ?`,
        [now, vscuResponse.data?.rcptSign || '',
          vscuResponse.data?.rcptNo || vscuResponse.data?.rcptInvcNo || '', req.params.id]
      );
      console.log(`[SALE][RETRY] ✓ synced saleId=${req.params.id}`);
      res.json({ success: true, synced: true, vscuResponse });
    } else {
      console.warn(`[SALE][RETRY] still failing for saleId=${req.params.id}`);
      res.json({ success: false, synced: false, vscuResponse });
    }
  } catch (error) {
    console.error(`[SALE][RETRY] ✗ (${Date.now() - t0}ms):`, error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// SALES SUMMARY
// ============================================
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await db.getAsync(
      `SELECT COUNT(*) as count FROM sales WHERE payment_status = 'completed'`
    );
    const completed = await db.getAsync(
      `SELECT COUNT(*) as count, SUM(total) as revenue FROM sales WHERE status = 'Completed' AND payment_status = 'completed'`
    );
    const pendingSync = await db.getAsync(
      `SELECT COUNT(*) as count FROM sales WHERE status = 'Pending' AND payment_status = 'completed'`
    );
    const awaitingPayment = await db.getAsync(
      `SELECT COUNT(*) as count FROM sales WHERE payment_status = 'pending'`
    );
    const taxTotal = await db.getAsync(
      `SELECT SUM(tax) as tax FROM sales WHERE status = 'Completed' AND payment_status = 'completed'`
    );

    const summary = {
      total: total?.count || 0,
      completed: completed?.count || 0,
      pending: pendingSync?.count || 0,
      awaitingPayment: awaitingPayment?.count || 0,
      revenue: completed?.revenue || 0,
      tax: taxTotal?.tax || 0,
    };
    console.log('[SALE][STATS]', JSON.stringify(summary));
    res.json(summary);
  } catch (error) {
    console.error('[SALE][STATS] error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;