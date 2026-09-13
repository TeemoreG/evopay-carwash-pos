// backend/routes/stock.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const vscuClient = require('../services/vscuClient');
const axios = require('axios');
const round2 = (num) => Math.round((num || 0) * 100) / 100;

// ============================================
// 1. GET STOCK FROM VSCU
// ============================================
router.post('/selectStockItems', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.tin) payload.tin = process.env.TIN;
    if (!payload.bhfId) payload.bhfId = process.env.BHF_ID;
    if (!payload.lastReqDt) payload.lastReqDt = '20200101000000';

    const headers = {
      tin: payload.tin,
      bhfId: payload.bhfId,
      cmckey: process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/stock/selectStockItems`,
      { tin: payload.tin, bhfId: payload.bhfId, lastReqDt: payload.lastReqDt },
      { headers, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('selectStockItems error:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { resultCd: '999', resultMsg: error.message }
    );
  }
});

// ============================================
// 2. SEND STOCK I/O TO VSCU
// ============================================
router.post('/saveStockItems', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.tin) payload.tin = process.env.TIN;
    if (!payload.bhfId) payload.bhfId = process.env.BHF_ID;

    const required = ['tin', 'bhfId', 'sarNo', 'sarTyCd', 'ocrnDt', 'totItemCnt', 'itemList'];
    const missing = required.filter(f => {
      if (f === 'itemList') return !payload[f] || !Array.isArray(payload[f]) || payload[f].length === 0;
      return payload[f] === undefined || payload[f] === null || payload[f] === '';
    });
    if (missing.length) {
      return res.status(400).json({ resultCd: '999', resultMsg: `Missing: ${missing.join(', ')}` });
    }

    const itemRequired = ['itemCd', 'itemClsCd', 'itemNm', 'qty', 'prc'];
    for (let i = 0; i < payload.itemList.length; i++) {
      const item = payload.itemList[i];
      const miss = itemRequired.filter(f => item[f] === undefined || item[f] === null || item[f] === '');
      if (miss.length) {
        return res.status(400).json({ resultCd: '999', resultMsg: `Item ${i + 1} missing: ${miss.join(', ')}` });
      }
    }

    if (!payload.orgSarNo) payload.orgSarNo = 0;
    if (!payload.regTyCd) payload.regTyCd = 'M';
    if (payload.custTin === undefined) payload.custTin = null;
    if (payload.custNm === undefined) payload.custNm = null;
    if (payload.custBhfId === undefined) payload.custBhfId = null;
    if (!payload.remark) payload.remark = null;
    if (!payload.regrId) payload.regrId = 'Admin';
    if (!payload.regrNm) payload.regrNm = 'Admin';
    if (!payload.modrNm) payload.modrNm = 'Admin';
    if (!payload.modrId) payload.modrId = 'Admin';

    for (const item of payload.itemList) {
      if (!item.bcd) item.bcd = null;
      if (!item.pkgUnitCd) item.pkgUnitCd = 'NT';
      if (!item.pkg) item.pkg = 1;
      if (!item.qtyUnitCd) item.qtyUnitCd = 'U';
      if (item.itemExprDt === undefined) item.itemExprDt = null;
      if (!item.totDcAmt) item.totDcAmt = 0;
      if (!item.taxTyCd) item.taxTyCd = 'B';
      if (item.taxAmt === undefined) item.taxAmt = 0;
    }

    const headers = {
      tin: payload.tin,
      bhfId: payload.bhfId,
      cmckey: process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/stock/saveStockItems`,
      payload,
      { headers, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('saveStockItems error:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { resultCd: '999', resultMsg: error.message }
    );
  }
});

// ============================================
// 3. SAVE STOCK MASTER
// ============================================
router.post('/stockMaster/saveStockMaster', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload.tin) payload.tin = process.env.TIN;
    if (!payload.bhfId) payload.bhfId = process.env.BHF_ID;

    if (!payload.itemCd) return res.status(400).json({ resultCd: '999', resultMsg: 'Missing itemCd' });
    if (payload.rsdQty === undefined || payload.rsdQty === null) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing rsdQty' });
    }

    if (!payload.regrId) payload.regrId = 'Admin';
    if (!payload.regrNm) payload.regrNm = 'Admin';
    if (!payload.modrNm) payload.modrNm = 'Admin';
    if (!payload.modrId) payload.modrId = 'Admin';

    const headers = {
      tin: payload.tin,
      bhfId: payload.bhfId,
      cmckey: process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/stockMaster/saveStockMaster`,
      {
        tin: payload.tin,
        bhfId: payload.bhfId,
        itemCd: payload.itemCd,
        rsdQty: payload.rsdQty,
        regrId: payload.regrId,
        regrNm: payload.regrNm,
        modrNm: payload.modrNm,
        modrId: payload.modrId
      },
      { headers, timeout: 30000 }
    );
    res.json(response.data);
  } catch (error) {
    console.error('saveStockMaster error:', error.message);
    res.status(error.response?.status || 500).json(
      error.response?.data || { resultCd: '999', resultMsg: error.message }
    );
  }
});

// ============================================
// 4. BULK SAVE (from VSCU to local DB)
// ============================================
router.post('/bulk', async (req, res) => {
  try {
    const stockList = req.body;
    if (!Array.isArray(stockList) || stockList.length === 0) {
      return res.status(400).json({ error: 'Stock array required' });
    }

    const now = new Date().toISOString();
    let saved = 0;

    for (const stock of stockList) {
      const itemCd = stock.itemCd || stock.item_cd;

      // Preserve existing image_url
      const existing = await db.getAsync(
        `SELECT image_url FROM items WHERE item_cd = ?`,
        [itemCd]
      );

      await db.runAsync(
        `INSERT OR REPLACE INTO items (
          item_cd, item_name, item_std_nm, item_cls_cd, item_ty_cd,
          price, tax_type, stock, sfty_qty, orgn_nat_cd, pkg_unit_cd, qty_unit_cd,
          use_yn, isrc_aplcb_yn, bcd, add_info, image_url, item_type, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'product', ?)`,
        [
          itemCd,
          stock.itemNm || stock.item_name || 'Unknown',
          stock.itemStdNm || stock.item_std_nm || null,
          stock.itemClsCd || stock.item_cls_cd || '50101010',
          stock.itemTyCd || stock.item_ty_cd || '1',
          stock.dftPrc || stock.price || 0,
          stock.taxTyCd || stock.tax_type || 'B',
          stock.stock || 0,
          stock.sftyQty || stock.sfty_qty || 5,
          stock.orgnNatCd || stock.orgn_nat_cd || 'KE',
          stock.pkgUnitCd || stock.pkg_unit_cd || 'NT',
          stock.qtyUnitCd || stock.qty_unit_cd || 'U',
          stock.useYn || stock.use_yn || 'Y',
          stock.isrcAplcbYn || stock.isrc_aplcb_yn || 'N',
          stock.bcd || null,
          stock.addInfo || stock.add_info || null,
          stock.image_url || existing?.image_url || null,
          now
        ]
      );
      saved++;
    }
    res.json({ success: true, saved });
  } catch (error) {
    console.error('bulk stock error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 5. GET ALL PRODUCTS (for Products page + POS)
// ============================================
router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM items 
       WHERE use_yn = 'Y' 
         AND (item_type = 'product' OR item_ty_cd = '1')
       ORDER BY item_name`
    );
    res.json(rows);
  } catch (error) {
    console.error('GET products error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 6. GET SINGLE PRODUCT
// ============================================
router.get('/:itemCd', async (req, res) => {
  try {
    const item = await db.getAsync(
      `SELECT * FROM items WHERE item_cd = ?`,
      [req.params.itemCd]
    );
    if (!item) return res.status(404).json({ error: 'Product not found' });
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 7. STOCK MOVEMENT (IN/OUT)
// ============================================
router.post('/movement', async (req, res) => {
  try {
    const { itemCd, qty, type, reason, reference, cashier } = req.body;
    const now = new Date().toISOString();

    if (!itemCd || !qty || !type) {
      return res.status(400).json({ error: 'itemCd, qty, and type required' });
    }
    if (!['IN', 'OUT'].includes(type)) {
      return res.status(400).json({ error: 'type must be IN or OUT' });
    }

    const item = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [itemCd]);
    if (!item) return res.status(404).json({ error: 'Product not found' });

    if (type === 'OUT' && item.stock < qty) {
      return res.status(400).json({
        error: `Not enough stock. Available: ${item.stock}, Requested: ${qty}`
      });
    }

    const delta = type === 'IN' ? qty : -qty;
    const newStock = item.stock + delta;
    const qtyAbs = Math.abs(qty);

    const stockPayload = {
      tin: process.env.TIN,
      bhfId: process.env.BHF_ID,
      sarNo: Math.floor(Date.now() / 1000),
      orgSarNo: 0,
      regTyCd: 'M',
      custTin: null,
      custNm: null,
      custBhfId: null,
      sarTyCd: type === 'IN' ? '01' : '02',
      ocrnDt: now.replace(/[-:T.]/g, '').slice(0, 8),
      totItemCnt: 1,
      totTaxblAmt: round2(qtyAbs * (item.price || 0)),
      totTaxAmt: 0,
      totAmt: round2(qtyAbs * (item.price || 0)),
      remark: reason || null,
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
        qty: qtyAbs,
        itemExprDt: null,
        prc: round2(item.price || 0),
        splyAmt: round2(qtyAbs * (item.price || 0)),
        totDcAmt: 0,
        taxblAmt: round2(qtyAbs * (item.price || 0)),
        taxTyCd: item.tax_type || 'B',
        taxAmt: 0,
        totAmt: round2(qtyAbs * (item.price || 0))
      }]
    };

    await db.runAsync(
      `UPDATE items SET stock = ?, updated_at = ? WHERE item_cd = ?`,
      [newStock, now, itemCd]
    );

    await db.runAsync(
      `INSERT INTO stock_movements (item_cd, quantity, type, reference, note, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemCd, qtyAbs, type, reference || null, reason || null, now.slice(0, 10), now]
    );

    let synced = false;
    let queued = false;
    let vscuResponse = null;

    try {
      const status = await vscuClient.checkStatus();
      if (status.connected) {
        vscuResponse = await vscuClient.saveStock(stockPayload);
        if (vscuResponse && (vscuResponse.resultCd === '000' || vscuResponse.resultCd === '00')) {
          synced = true;
        } else {
          await db.runAsync(
            `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
            ['/stock/saveStockItems', JSON.stringify(stockPayload),
              `VSCU: ${vscuResponse?.resultMsg || 'error'}`, now]
          );
          queued = true;
        }
      } else {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/stock/saveStockItems', JSON.stringify(stockPayload), 'VSCU offline', now]
        );
        queued = true;
      }
    } catch (vscuError) {
      await db.runAsync(
        `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
        ['/stock/saveStockItems', JSON.stringify(stockPayload), vscuError.message, now]
      );
      queued = true;
    }

    const updated = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [itemCd]);

    res.json({
      success: true,
      synced,
      queued,
      itemCd,
      oldStock: item.stock,
      newStock,
      item: updated
    });
  } catch (error) {
    console.error('movement error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 8. SYNC ALL PRODUCTS TO VSCU
// ============================================
router.post('/sync', async (req, res) => {
  try {
    const items = await db.allAsync(
      `SELECT * FROM items 
       WHERE use_yn = 'Y' 
         AND (item_type = 'product' OR item_ty_cd = '1')`
    );

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const item of items) {
      try {
        const status = await vscuClient.checkStatus();
        if (!status.connected) {
          return res.json({
            success: false,
            message: 'VSCU offline',
            synced: 0,
            failed: items.length
          });
        }

        const response = await vscuClient.saveStockMaster({
          tin: process.env.TIN,
          bhfId: process.env.BHF_ID,
          itemCd: item.item_cd,
          rsdQty: item.stock || 0,
          regrId: 'Admin',
          regrNm: 'Admin',
          modrNm: 'Admin',
          modrId: 'Admin'
        });

        if (response && (response.resultCd === '000' || response.resultCd === '00')) {
          synced++;
        } else {
          failed++;
          errors.push({ itemCd: item.item_cd, error: response?.resultMsg || 'error' });
        }
      } catch (e) {
        failed++;
        errors.push({ itemCd: item.item_cd, error: e.message });
      }
    }

    res.json({
      success: true,
      synced,
      failed,
      errors: errors.length ? errors : undefined,
      message: `Synced ${synced}, failed ${failed}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 9. STOCK MOVEMENTS FOR A PRODUCT
// ============================================
router.get('/:itemCd/movements', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM stock_movements WHERE item_cd = ? ORDER BY created_at DESC`,
      [req.params.itemCd]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// 10. LOW STOCK ALERTS (products only)
// ============================================
router.get('/alerts/low', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM items 
       WHERE use_yn = 'Y' 
         AND (item_type = 'product' OR item_ty_cd = '1')
         AND stock <= sfty_qty 
       ORDER BY stock ASC`
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;