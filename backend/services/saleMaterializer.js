// backend/services/saleMaterializer.js
const db = require('../db');
const vscuClient = require('./vscuClient');

const round2 = (num) => Math.round((num || 0) * 100) / 100;

const extractNumericInvoice = (invoiceNo) => {
  if (!invoiceNo) return 0;
  const digits = String(invoiceNo).replace(/[^0-9]/g, '');
  if (!digits) return 0;
  return parseInt(digits.slice(-11), 10) || 0;
};

async function buildVscuPayload(sale, items) {
  const now = new Date().toISOString();
  const date = sale.date || now.slice(0, 10);

  return {
    tin: process.env.TIN,
    bhfId: process.env.BHF_ID,
    invcNo: extractNumericInvoice(sale.invoice_no),
    orgInvcNo: 0,
    custTin: sale.customer_pin || '',
    custNm: sale.customer || 'Walk-in Customer',
    salesTyCd: 'N',
    rcptTyCd: 'S',
    pmtTyCd: sale.payment_method || '03',
    salesSttsCd: '02',
    cfmDt: now.replace(/[-:T.]/g, '').slice(0, 14),
    salesDt: date.replace(/-/g, ''),
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
    regrNm: sale.cashier || 'Cashier',
    modrId: sale.cashier || '45678',
    modrNm: sale.cashier || 'Cashier',
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
      qty: Number(item.quantity || 0),
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
}

async function materializeSale(session) {
  const cart = JSON.parse(session.cart_payload);
  const items = cart.items || [];
  const now = new Date().toISOString();
  const invoiceNo = cart.invoice_no || session.invoice_no;
  const date = cart.date || now.slice(0, 10);

  const insertResult = await db.runAsync(
    `INSERT INTO sales 
     (invoice_no, customer, customer_pin, cashier, subtotal, tax, total, payment_method,
      sales_type, receipt_type, org_invoice_no, discount_type, discount_value, remarks,
      status, synced, vscu_signature, receipt_no, date, created_at, payment_status,
      mpesa_transaction_id, qr_code)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      invoiceNo,
      cart.customer || 'Walk-in Customer',
      cart.customer_pin || '',
      cart.cashier || 'Unknown',
      cart.subtotal || 0,
      cart.tax || 0,
      cart.total || 0,
      cart.payment_method || '03',
      cart.sales_type || 'N',
      cart.receipt_type || 'NS',
      null,
      cart.discount_type || null,
      cart.discount_value || null,
      cart.remarks || null,
      'Pending',
      0,
      null,
      null,
      date,
      now,
      'completed',
      session.transaction_id || null,
      null
    ]
  );

  const saleId = insertResult.lastID;

  // Link session → real sale_id now that it exists
  await db.runAsync(
    `UPDATE payment_sessions SET sale_id = ? WHERE invoice_no = ?`,
    [saleId, invoiceNo]
  ).catch(() => {});

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    await db.runAsync(
      `INSERT INTO sales_items
       (sale_id, item_seq, item_cd, item_name, item_cls_cd, quantity, price, tax_type, tax_amount, total)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        saleId, i + 1,
        item.item_cd, item.item_name,
        item.item_cls_cd || '50101010',
        item.quantity || 0, item.price || 0,
        item.tax_type || 'B',
        item.tax_amount || 0,
        item.total || 0
      ]
    );
  }

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
        [item.item_cd, item.quantity, invoiceNo, date, now]
      );
    } catch (stockErr) {
      console.error(`Stock deduct failed for ${item.item_cd}:`, stockErr.message);
    }
  }

  let synced = false;
  let queued = false;
  let signature = null;
  let receiptNo = null;
  let vscuResponse = null;

  const saleForVscu = {
    invoice_no: invoiceNo,
    customer: cart.customer,
    customer_pin: cart.customer_pin,
    cashier: cart.cashier,
    subtotal: cart.subtotal,
    tax: cart.tax,
    total: cart.total,
    payment_method: cart.payment_method || '03',
    date,
    remarks: cart.remarks,
  };

  const vscuPayload = await buildVscuPayload(saleForVscu, items);

  try {
    const status = await vscuClient.checkStatus();
    if (status.connected) {
      vscuResponse = await vscuClient.sendSale(vscuPayload);
      if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
        synced = true;
        signature = vscuResponse.data?.rcptSign || '';
        receiptNo = vscuResponse.data?.rcptNo || vscuResponse.data?.rcptInvcNo || '';

        for (const item of items) {
          try {
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
              custTin: cart.customer_pin || null,
              custNm: cart.customer || null,
              custBhfId: null,
              sarTyCd: '02',
              ocrnDt: date.replace(/-/g, ''),
              totItemCnt: 1,
              totTaxblAmt: round2(Number(item.total || 0)),
              totTaxAmt: round2(Number(item.tax_amount || 0)),
              totAmt: round2(Number(item.total || 0)),
              remark: null,
              regrId: cart.cashier || 'Admin',
              regrNm: cart.cashier || 'Admin',
              modrNm: cart.cashier || 'Admin',
              modrId: cart.cashier || 'Admin',
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
          } catch (stockSyncErr) {
            console.error('VSCU stock push failed:', stockSyncErr.message);
          }
        }
      } else {
        const errMsg = vscuResponse?.resultMsg || vscuResponse?.message || 'VSCU error';
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/trnsSales/saveSales', JSON.stringify(vscuPayload), `VSCU: ${errMsg}`, now]
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
  } catch (err) {
    await db.runAsync(
      `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
      ['/trnsSales/saveSales', JSON.stringify(vscuPayload), err.message || 'Network error', now]
    );
    queued = true;
  }

  const finalStatus = synced ? 'Completed' : 'Pending';
  const syncedFlag = synced ? 1 : 0;

  await db.runAsync(
    `UPDATE sales SET status = ?, synced = ?, vscu_signature = ?, receipt_no = ? WHERE id = ?`,
    [finalStatus, syncedFlag, signature, receiptNo, saleId]
  );

  return { saleId, invoiceNo, synced, queued, signature, receiptNo, vscuResponse };
}

module.exports = { materializeSale };