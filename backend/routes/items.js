const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const vscuClient = require('../services/vscuClient');

// ============================================
// VSCU PROXY - Get Items from VSCU (selectItems)
// ============================================
router.post('/selectItems', async (req, res) => {
  console.log('VSCU SELECT ITEMS PROXY');
  try {
    let { tin, bhfId, lastReqDt } = req.body;

    if (!tin) tin = process.env.TIN;
    if (!bhfId) bhfId = process.env.BHF_ID;
    if (!lastReqDt) lastReqDt = '20180523000000';

    if (!tin) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: tin' });
    }
    if (!bhfId) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: bhfId' });
    }

    const headers = {
      'tin': tin,
      'bhfId': bhfId,
      'cmckey': process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const payload = { tin, bhfId, lastReqDt };

    console.log('Target:', `${vscuClient.baseUrl}/items/selectItems`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/items/selectItems`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);

    if (response.data?.resultCd === '000' && response.data?.data?.itemList) {
      const items = response.data.data.itemList;
      let saved = 0;

      for (const item of items) {
        try {
          const existing = await db.getAsync(
            `SELECT category, image_url FROM items WHERE item_cd = ?`,
            [item.itemCd]
          );

          const category = existing?.category || deriveCategoryFromName(item.itemNm);
          const imageUrl = existing?.image_url || null;

          await db.runAsync(
            `INSERT OR REPLACE INTO items 
             (item_cd, item_name, item_std_nm, item_cls_cd, item_ty_cd, price, tax_type, stock, sfty_qty,
              orgn_nat_cd, pkg_unit_cd, qty_unit_cd, use_yn, isrc_aplcb_yn, btch_no, bcd, add_info,
              category, item_type, image_url, synced, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              item.itemCd,
              item.itemNm,
              item.itemStdNm || null,
              item.itemClsCd || '5059690809',
              item.itemTyCd || '2',
              item.dftPrc || 0,
              0,
              item.sftyQty || 0,
              item.sftyQty || 0,
              item.orgnNatCd || 'KE',
              item.pkgUnitCd || 'NT',
              item.qtyUnitCd || 'U',
              item.useYn || 'Y',
              item.isrcAplcbYn || 'N',
              item.btchNo || null,
              item.bcd || null,
              item.addInfo || null,
              category,
              item.itemTyCd === '2' ? 'service' : 'product',
              imageUrl,
              new Date().toISOString(),
              new Date().toISOString()
            ]
          );
          saved++;
        } catch (saveError) {
          console.error(`Failed to save item ${item.itemCd}:`, saveError.message);
        }
      }
      console.log(`Saved ${saved} items to database`);
    }

    if (response.data?.resultCd === '899') {
      return res.json({
        resultCd: '000',
        resultMsg: 'No items available',
        data: { itemList: [] }
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error('selectItems Error:', error.message);
    if (error.response?.data) {
      return res.status(error.response.status || 500).json(error.response.data || {
        resultCd: '999',
        resultMsg: error.message
      });
    }
    res.status(500).json({ resultCd: '999', resultMsg: error.message });
  }
});

// ============================================
// VSCU PROXY - Send Item to VSCU (saveItems)
// ============================================
router.post('/saveItems', async (req, res) => {
  console.log('===== VSCU SAVE ITEMS PROXY =====');
  try {
    const payload = req.body;

    if (!payload.tin || payload.tin === '') payload.tin = process.env.TIN;
    if (!payload.bhfId || payload.bhfId === '') payload.bhfId = process.env.BHF_ID;

    if (!payload.tin) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: tin' });
    }
    if (!payload.bhfId) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: bhfId' });
    }
    if (!payload.itemCd) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: itemCd' });
    }
    if (!payload.itemNm) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'Missing required field: itemNm' });
    }

    const headers = {
      'tin': payload.tin,
      'bhfId': payload.bhfId,
      'cmckey': process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/items/saveItems`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    res.json(response.data);
  } catch (error) {
    console.error('saveItems Error:', error.message);
    if (error.response?.data) {
      return res.status(error.response.status || 500).json(error.response.data || {
        resultCd: '999',
        resultMsg: error.message
      });
    }
    res.status(500).json({ resultCd: '999', resultMsg: error.message });
  }
});

// ============================================
// VSCU PROXY - Send Item Composition
// ============================================
router.post('/saveItemComposition', async (req, res) => {
  console.log('===== VSCU SAVE ITEM COMPOSITION PROXY =====');
  try {
    const payload = req.body;

    if (!payload.tin || payload.tin === '') payload.tin = process.env.TIN;
    if (!payload.bhfId || payload.bhfId === '') payload.bhfId = process.env.BHF_ID;

    if (!payload.tin) return res.status(400).json({ resultCd: '999', resultMsg: 'Missing tin' });
    if (!payload.bhfId) return res.status(400).json({ resultCd: '999', resultMsg: 'Missing bhfId' });
    if (!payload.itemCd) return res.status(400).json({ resultCd: '999', resultMsg: 'Missing itemCd' });
    if (!payload.cpstItemCd) return res.status(400).json({ resultCd: '999', resultMsg: 'Missing cpstItemCd' });
    if (payload.cpstQty === undefined || payload.cpstQty === null || payload.cpstQty < 1) {
      return res.status(400).json({ resultCd: '999', resultMsg: 'cpstQty must be at least 1' });
    }

    if (!payload.useYn) payload.useYn = 'Y';

    const headers = {
      'tin': payload.tin,
      'bhfId': payload.bhfId,
      'cmckey': process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const response = await axios.post(
      `${vscuClient.baseUrl}/items/saveItemComposition`,
      {
        tin: payload.tin,
        bhfId: payload.bhfId,
        itemCd: payload.itemCd,
        cpstItemCd: payload.cpstItemCd,
        cpstQty: payload.cpstQty,
        useYn: payload.useYn,
        regrId: payload.regrId || 'Admin',
        regrNm: payload.regrNm || 'Admin'
      },
      { headers, timeout: 30000 }
    );

    res.json(response.data);
  } catch (error) {
    console.error('saveItemComposition Error:', error.message);
    if (error.response?.data) {
      return res.status(error.response.status || 500).json(error.response.data || {
        resultCd: '999',
        resultMsg: error.message
      });
    }
    res.status(500).json({ resultCd: '999', resultMsg: error.message });
  }
});

// ============================================
// HELPER: Map Item to VSCU Payload (KRA compliant)
// ============================================
const mapItemToVSCU = (item) => {
  return {
    tin: process.env.TIN,
    bhfId: process.env.BHF_ID,
    itemCd: item.itemCd || item.item_cd,
    itemClsCd: item.itemClsCd || item.item_cls_cd || '5059690809',
    itemTyCd: item.itemTyCd || item.item_ty_cd || '2',
    itemNm: item.itemNm || item.item_name,
    itemStdNm: item.itemStdNm || item.item_std_nm || null,
    orgnNatCd: item.orgnNatCd || item.orgn_nat_cd || 'KE',
    pkgUnitCd: item.pkgUnitCd || item.pkg_unit_cd || 'NT',
    qtyUnitCd: item.qtyUnitCd || item.qty_unit_cd || 'U',
    taxTyCd: item.taxTyCd || item.tax_type || 'B',
    btchNo: item.btchNo || item.btch_no || null,
    bcd: item.bcd || null,
    dftPrc: Number(item.dftPrc || item.price || 0),
    grpPrcL1: Number(item.grpPrcL1 || item.price || item.dftPrc || 0),
    grpPrcL2: Number(item.grpPrcL2 || item.price || item.dftPrc || 0),
    grpPrcL3: Number(item.grpPrcL3 || item.price || item.dftPrc || 0),
    grpPrcL4: Number(item.grpPrcL4 || item.price || item.dftPrc || 0),
    grpPrcL5: item.grpPrcL5 || null,
    addInfo: item.addInfo || item.add_info || null,
    sftyQty: Number(item.sftyQty || item.sfty_qty || 0),
    isrcAplcbYn: item.isrcAplcbYn || item.isrc_aplcb_yn || 'N',
    useYn: item.useYn || item.use_yn || 'Y',
    regrNm: item.regrNm || 'Admin',
    regrId: item.regrId || 'Admin',
    modrNm: item.modrNm || 'Admin',
    modrId: item.modrId || 'Admin'
  };
};

// ============================================
// HELPER: Auto-derive category from service name
// ============================================
const deriveCategoryFromName = (name) => {
  const n = (name || '').toLowerCase();
  if (n.includes('vip')) return 'vip';
  if (n.includes('premium')) return 'premium';
  if (n.includes('standard')) return 'standard';
  if (n.includes('basic')) return 'basic';
  if (n.includes('interior') || n.includes('vacuum')) return 'interior';
  return 'addon';
};

// ============================================
// LOCAL ITEM ROUTES
// ============================================

router.get('/', async (req, res) => {
  try {
    const { type, category } = req.query;

    let query = `SELECT * FROM items WHERE use_yn = 'Y'`;
    const params = [];

    if (type) {
      query += ` AND item_type = ?`;
      params.push(type);
    }

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY category, item_name`;

    const rows = await db.allAsync(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get items error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ITEM COMPOSITION ROUTES
// ============================================
router.get('/:itemCd/compositions', async (req, res) => {
  try {
    const { itemCd } = req.params;
    const rows = await db.allAsync(
      `SELECT id, parent_item_cd, component_item_cd, component_qty, synced, created_at, updated_at
       FROM item_compositions 
       WHERE parent_item_cd = ? AND use_yn = 'Y'
       ORDER BY created_at DESC`,
      [itemCd]
    );
    const compositions = rows.map(row => ({
      id: row.id,
      parentItemCd: row.parent_item_cd,
      cpstItemCd: row.component_item_cd,
      cpstQty: row.component_qty,
      synced: row.synced || 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
    res.json({ success: true, data: compositions });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/:itemCd/compositions', async (req, res) => {
  try {
    const { itemCd } = req.params;
    const { cpstItemCd, cpstQty } = req.body;
    const now = new Date().toISOString();

    if (!cpstItemCd || !cpstQty) {
      return res.status(400).json({ success: false, error: 'cpstItemCd and cpstQty are required' });
    }

    const parent = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [itemCd]);
    if (!parent) return res.status(404).json({ success: false, error: 'Parent item not found' });

    const component = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [cpstItemCd]);
    if (!component) return res.status(404).json({ success: false, error: 'Component item not found' });

    const existing = await db.getAsync(
      `SELECT * FROM item_compositions WHERE parent_item_cd = ? AND component_item_cd = ? AND use_yn = 'Y'`,
      [itemCd, cpstItemCd]
    );

    if (existing) {
      await db.runAsync(
        `UPDATE item_compositions SET component_qty = ?, updated_at = ?, synced = 0
         WHERE parent_item_cd = ? AND component_item_cd = ?`,
        [cpstQty, now, itemCd, cpstItemCd]
      );
    } else {
      await db.runAsync(
        `INSERT INTO item_compositions 
         (parent_item_cd, component_item_cd, component_qty, synced, use_yn, created_at, updated_at)
         VALUES (?, ?, ?, 0, 'Y', ?, ?)`,
        [itemCd, cpstItemCd, cpstQty, now, now]
      );
    }

    let synced = false;
    let queued = false;

    try {
      const status = await vscuClient.checkStatus();
      const vscuPayload = {
        tin: process.env.TIN,
        bhfId: process.env.BHF_ID,
        itemCd, cpstItemCd,
        cpstQty: parseInt(cpstQty),
        useYn: 'Y',
        regrId: 'Admin',
        regrNm: 'Admin'
      };

      if (status.connected) {
        const vscuResponse = await vscuClient.sendComposition(vscuPayload);
        if (vscuResponse?.resultCd === '000' || vscuResponse?.resultCd === '00') {
          await db.runAsync(
            `UPDATE item_compositions SET synced = 1, updated_at = ? 
             WHERE parent_item_cd = ? AND component_item_cd = ?`,
            [now, itemCd, cpstItemCd]
          );
          synced = true;
        } else {
          await db.runAsync(
            `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
            ['/items/saveItemComposition', JSON.stringify(vscuPayload), vscuResponse?.resultMsg || 'Error', now]
          );
          queued = true;
        }
      } else {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/items/saveItemComposition', JSON.stringify(vscuPayload), 'VSCU offline', now]
        );
        queued = true;
      }
    } catch (vscuError) {
      queued = true;
    }

    res.json({ success: true, synced, queued });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/:itemCd/compositions/:cpstItemCd', async (req, res) => {
  try {
    const { itemCd, cpstItemCd } = req.params;
    const now = new Date().toISOString();

    await db.runAsync(
      `UPDATE item_compositions SET use_yn = 'N', updated_at = ?, synced = 0
       WHERE parent_item_cd = ? AND component_item_cd = ?`,
      [now, itemCd, cpstItemCd]
    );

    res.json({ success: true, message: 'Composition removed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// SINGLE ITEM ROUTE
// ============================================
router.get('/:itemCd', async (req, res) => {
  try {
    const row = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [req.params.itemCd]);
    if (!row) return res.status(404).json({ error: 'Item not found' });
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add or update item
router.post('/', async (req, res) => {
  try {
    const item = req.body;
    const now = new Date().toISOString();

    if (!item.itemCd || !item.itemNm) {
      return res.status(400).json({ error: 'itemCd and itemNm are required' });
    }

    const itemCode = item.itemCd || item.item_cd;
    const vscuPayload = mapItemToVSCU(item);

    const itemTypeCd = item.itemTyCd || item.item_ty_cd || '2';
    const itemType = itemTypeCd === '2' ? 'service' : 'product';
    const category = item.category || deriveCategoryFromName(item.itemNm || item.item_name);

    console.log('Item Payload to VSCU:', JSON.stringify(vscuPayload, null, 2));

    // 1. SAVE TO DATABASE FIRST
    await db.runAsync(
      `INSERT OR REPLACE INTO items 
       (item_cd, item_name, item_std_nm, item_cls_cd, item_ty_cd, price, tax_type, stock, sfty_qty,
        orgn_nat_cd, pkg_unit_cd, qty_unit_cd, use_yn, isrc_aplcb_yn, btch_no, bcd, add_info,
        category, item_type, image_url, synced, sync_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      [
        itemCode,
        item.itemNm || item.item_name,
        item.itemStdNm || item.item_std_nm || null,
        item.itemClsCd || item.item_cls_cd || '5059690809',
        itemTypeCd,
        Number(item.dftPrc || item.price || 0),
        item.taxTyCd || item.tax_type || 'B',
        Number(item.stock || 0),
        Number(item.sftyQty || item.sfty_qty || 0),
        item.orgnNatCd || item.orgn_nat_cd || 'KE',
        item.pkgUnitCd || item.pkg_unit_cd || 'NT',
        item.qtyUnitCd || item.qty_unit_cd || 'U',
        item.useYn || item.use_yn || 'Y',
        item.isrcAplcbYn || item.isrc_aplcb_yn || 'N',
        item.btchNo || item.btch_no || null,
        item.bcd || null,
        item.addInfo || item.add_info || null,
        category,
        itemType,
        item.image_url || null,
        null,
        now,
        now
      ]
    );

    // 2. TRY TO SYNC TO VSCU
    let synced = false;
    let queued = false;
    let vscuResponse = null;

    try {
      const status = await vscuClient.checkStatus();

      if (status.connected) {
        vscuResponse = await vscuClient.saveItem(vscuPayload);
        const resCd = vscuResponse?.resultCd;

        if (resCd === '000' || resCd === '00') {
          await db.runAsync(
            `UPDATE items SET synced = 1, sync_error = NULL, updated_at = ? WHERE item_cd = ?`,
            [now, itemCode]
          );
          synced = true;
        } else {
          const errMsg = vscuResponse?.resultMsg || 'Validation Error';
          await db.runAsync(
            `UPDATE items SET sync_error = ?, updated_at = ? WHERE item_cd = ?`,
            [`[${resCd}] ${errMsg}`, now, itemCode]
          );
        }
      } else {
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/items/saveItems', JSON.stringify(vscuPayload), 'VSCU offline', now]
        );
        queued = true;
      }
    } catch (vscuError) {
      await db.runAsync(
        `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
        ['/items/saveItems', JSON.stringify(vscuPayload), vscuError.message || 'Network error', now]
      );
      queued = true;
    }

    const updatedItem = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [itemCode]);

    res.json({
      success: true,
      item: updatedItem,
      synced,
      queued,
      vscuResponse,
      message: synced ? 'Item synced to KRA' : queued ? 'Item saved and queued' : 'Item saved locally'
    });

  } catch (error) {
    console.error('Save item error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete item (soft delete)
router.delete('/:itemCd', async (req, res) => {
  try {
    const item = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [req.params.itemCd]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const now = new Date().toISOString();

    await db.runAsync(
      `DELETE FROM sync_queue WHERE endpoint = '/items/saveItems' AND json_extract(payload, '$.itemCd') = ?`,
      [req.params.itemCd]
    );

    const vscuPayload = {
      tin: process.env.TIN,
      bhfId: process.env.BHF_ID,
      itemCd: req.params.itemCd,
      useYn: 'N',
      regrId: 'Admin',
      regrNm: 'Admin',
      modrId: 'Admin',
      modrNm: 'Admin'
    };

    await db.runAsync(
      `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
      ['/items/saveItems', JSON.stringify(vscuPayload), 'Deletion queued', now]
    );

    await db.runAsync(
      `UPDATE items SET use_yn = 'N', synced = 0, updated_at = ? WHERE item_cd = ?`,
      [now, req.params.itemCd]
    );

    res.json({ success: true, message: 'Item deactivated and queued for VSCU deletion' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Adjust stock (products only)
router.patch('/:itemCd/stock', async (req, res) => {
  try {
    const { quantity, type, reason } = req.body;
    const itemCd = req.params.itemCd;
    const now = new Date().toISOString();

    if (!quantity || !type) return res.status(400).json({ error: 'quantity and type are required' });
    if (!['IN', 'OUT'].includes(type)) return res.status(400).json({ error: 'type must be IN or OUT' });

    const item = await db.getAsync(`SELECT * FROM items WHERE item_cd = ?`, [itemCd]);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (type === 'OUT' && item.stock < quantity) {
      return res.status(400).json({ error: `Not enough stock! Available: ${item.stock}` });
    }

    const delta = type === 'IN' ? quantity : -quantity;
    const newStock = item.stock + delta;

    await db.runAsync(`UPDATE items SET stock = ?, updated_at = ? WHERE item_cd = ?`, [newStock, now, itemCd]);

    await db.runAsync(
      `INSERT INTO stock_movements (item_cd, quantity, type, reference, note, date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [itemCd, Math.abs(quantity), type, 'Manual adjustment', reason || null, now.slice(0, 10), now]
    );

    res.json({ success: true, itemCd, oldStock: item.stock, newStock });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search items
router.get('/search/:query', async (req, res) => {
  try {
    const query = `%${req.params.query}%`;
    const rows = await db.allAsync(
      `SELECT * FROM items 
       WHERE use_yn = 'Y' 
       AND (item_name LIKE ? OR item_cd LIKE ? OR bcd LIKE ?)
       ORDER BY item_name`,
      [query, query, query]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Bulk import items
router.post('/bulk', async (req, res) => {
  try {
    const items = req.body;
    const now = new Date().toISOString();
    let imported = 0;
    let queued = 0;
    let errors = [];

    for (const item of items) {
      try {
        if (!item.itemCd || !item.itemNm) {
          errors.push({ item, error: 'Missing required fields' });
          continue;
        }

        const itemTypeCd = item.itemTyCd || '2';
        const itemType = itemTypeCd === '2' ? 'service' : 'product';
        const category = item.category || deriveCategoryFromName(item.itemNm);

        await db.runAsync(
          `INSERT OR REPLACE INTO items 
           (item_cd, item_name, item_cls_cd, item_ty_cd, price, tax_type, stock, sfty_qty, 
            orgn_nat_cd, pkg_unit_cd, qty_unit_cd, use_yn, category, item_type, image_url, synced, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            item.itemCd,
            item.itemNm,
            item.itemClsCd || '5059690809',
            itemTypeCd,
            Number(item.dftPrc || item.price || 0),
            item.taxTyCd || 'B',
            Number(item.stock || 0),
            Number(item.sftyQty || 0),
            item.orgnNatCd || 'KE',
            item.pkgUnitCd || 'NT',
            item.qtyUnitCd || 'U',
            item.useYn || 'Y',
            category,
            itemType,
            item.image_url || null,
            now, now
          ]
        );

        const vscuPayload = mapItemToVSCU(item);
        await db.runAsync(
          `INSERT INTO sync_queue (endpoint, payload, error_reason, created_at) VALUES (?, ?, ?, ?)`,
          ['/items/saveItems', JSON.stringify(vscuPayload), 'Bulk import queued', now]
        );
        queued++;
        imported++;
      } catch (err) {
        errors.push({ item, error: err.message });
      }
    }

    res.json({ success: true, imported, queued, errors: errors.length > 0 ? errors : undefined });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;