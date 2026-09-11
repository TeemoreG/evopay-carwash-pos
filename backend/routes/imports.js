// backend/routes/imports.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const vscuClient = require('../services/vscuClient');

// ============================================
// VSCU PROXY - Get Import Items from VSCU (selectImportItems)
// ============================================
router.post('/selectImportItems', async (req, res) => {
  console.log('===== VSCU SELECT IMPORTS PROXY =====');
  try {
    let { tin, bhfId, lastReqDt } = req.body;

    if (!tin) tin = process.env.TIN;
    if (!bhfId) bhfId = process.env.BHF_ID;
    if (!lastReqDt) lastReqDt = '20200101000000';

    if (!tin || !bhfId) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required fields: tin and bhfId are required'
      });
    }

    const headers = {
      'tin': tin,
      'bhfId': bhfId,
      'cmckey': process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    const payload = {
      tin: tin,
      bhfId: bhfId,
      lastReqDt: lastReqDt
    };

    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('Target:', `${vscuClient.baseUrl}/imports/selectImportItems`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/imports/selectImportItems`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);

    if (response.data?.resultCd === '000' && response.data?.data?.itemList) {
      const imports = response.data.data.itemList;
      let saved = 0;

      for (const imp of imports) {
  try {
    await db.runAsync(
      `INSERT OR REPLACE INTO imports 
       (task_cd, dcl_de, item_seq, hs_cd, item_name, item_cd, item_cls_cd, 
        impt_item_stts_cd, qty, pkg, pkg_unit_cd, qty_unit_cd,
        spplr_nm, agnt_nm, orgn_nat_cd, expt_nat_cd, dcl_no,
        synced, created_at, updated_at, matched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        imp.taskCd,
        imp.dclDe,
        imp.itemSeq || 1,
        imp.hsCd || null,
        imp.itemNm || imp.item_name || 'Unknown',
        imp.itemCd || null,
        imp.itemClsCd || null,
        imp.imptItemsttsCd || '2',
        imp.qty || 0,
        imp.pkg || 1,
        imp.pkgUnitCd || 'NT',
        imp.qtyUnitCd || 'U',
        imp.spplrNm || null,
        imp.agntNm || null,
        imp.orgnNatCd || 'KE',
        imp.exptNatCd || null,
        imp.dclNo || null,
        0,
        new Date().toISOString(),
        new Date().toISOString(),
        null
      ]
    );
    saved++;
  } catch (saveError) {
    console.error('Failed to save import:', saveError.message);
  }
}
      console.log(`Saved ${saved} imports to local database`);
    }

    if (response.data?.resultCd === '899') {
      console.log('selectImportItems returned 899 - returning empty list');
      return res.json({
        resultCd: '000',
        resultMsg: 'No imports available',
        data: { itemList: [] }
      });
    }

    res.json(response.data);
  } catch (error) {
    console.error('selectImportItems Error:', error.message);
    if (error.response?.data) {
      console.error('VSCU Response:', error.response.data);
      return res.status(error.response.status || 500).json(error.response.data || {
        resultCd: '999',
        resultMsg: error.message
      });
    }
    res.status(500).json({
      resultCd: '999',
      resultMsg: error.message,
      error: error.message
    });
  }
});

// ============================================
// VSCU PROXY - Update Import Items (updateImportItems)
// ============================================
router.post('/updateImportItems', async (req, res) => {
  console.log('===== VSCU UPDATE IMPORTS PROXY =====');
  try {
    const payload = req.body;

    if (!payload.tin || payload.tin === '') {
      payload.tin = process.env.TIN;
    }
    if (!payload.bhfId || payload.bhfId === '') {
      payload.bhfId = process.env.BHF_ID;
    }

    // Validate required fields
    if (!payload.tin) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required field: tin'
      });
    }
    if (!payload.bhfId) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required field: bhfId'
      });
    }
    if (!payload.taskCd) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required field: taskCd'
      });
    }
    if (!payload.itemCd) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required field: itemCd'
      });
    }
    if (!payload.itemClsCd) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'Missing required field: itemClsCd'
      });
    }

    const headers = {
      'tin': payload.tin,
      'bhfId': payload.bhfId,
      'cmckey': process.env.CMCKEY,
      'Content-Type': 'application/json'
    };

    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Payload:', JSON.stringify(payload, null, 2));
    console.log('Target:', `${vscuClient.baseUrl}/imports/updateImportItems`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/imports/updateImportItems`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);

    if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
      try {
        await db.runAsync(
          `UPDATE imports 
           SET item_cd = ?, 
               item_cls_cd = ?,
               impt_item_stts_cd = '1', 
               synced = 1,
               updated_at = ?
           WHERE task_cd = ?`,
          [payload.itemCd, payload.itemClsCd, new Date().toISOString(), payload.taskCd]
        );
        console.log(`Local import ${payload.taskCd} updated to matched`);
      } catch (dbError) {
        console.error('Failed to update local import:', dbError.message);
      }
    }

    res.json(response.data);
  } catch (error) {
    console.error('updateImportItems Error:', error.message);
    if (error.response?.data) {
      console.error('VSCU Response:', error.response.data);
      return res.status(error.response.status || 500).json(error.response.data || {
        resultCd: '999',
        resultMsg: error.message
      });
    }
    res.status(500).json({
      resultCd: '999',
      resultMsg: error.message,
      error: error.message
    });
  }
});

// ============================================
// RATE LIMITING
// ============================================
const rateLimitMap = new Map();

const rateLimit = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 30;

  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return next();
  }

  const userData = rateLimitMap.get(ip);
  const timeSinceFirst = now - userData.firstRequest;

  if (timeSinceFirst > windowMs) {
    rateLimitMap.set(ip, { count: 1, firstRequest: now });
    return next();
  }

  if (userData.count >= maxRequests) {
    return res.status(429).json({
      error: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((windowMs - timeSinceFirst) / 1000)
    });
  }

  userData.count++;
  rateLimitMap.set(ip, userData);
  next();
};

setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;
  for (const [ip, data] of rateLimitMap) {
    if (now - data.firstRequest > windowMs) {
      rateLimitMap.delete(ip);
    }
  }
}, 300000);

// ============================================
// LOCAL CRUD OPERATIONS
// ============================================

// Get all imports
router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM imports ORDER BY dcl_de DESC, task_cd DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch imports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get import by task code
router.get('/:taskCd', async (req, res) => {
  try {
    const { taskCd } = req.params;
    const row = await db.getAsync(
      `SELECT * FROM imports WHERE task_cd = ?`,
      [taskCd]
    );

    if (!row) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    res.json(row);
  } catch (error) {
    console.error('Failed to fetch import:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get imports by status
router.get('/status/:status', async (req, res) => {
  try {
    const { status } = req.params;

    if (!['0', '1', 'pending', 'matched'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Use: 0, 1, pending, or matched'
      });
    }

    let query;
    let params;

    if (status === 'pending') {
      query = `SELECT * FROM imports WHERE impt_item_stts_cd = '0' OR impt_item_stts_cd IS NULL ORDER BY dcl_de DESC`;
      params = [];
    } else if (status === 'matched') {
      query = `SELECT * FROM imports WHERE impt_item_stts_cd = '1' ORDER BY dcl_de DESC`;
      params = [];
    } else {
      query = `SELECT * FROM imports WHERE impt_item_stts_cd = ? ORDER BY dcl_de DESC`;
      params = [status];
    }

    const rows = await db.allAsync(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch imports by status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending imports (for matching)
router.get('/pending/matching', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM imports 
       WHERE impt_item_stts_cd = '0' OR impt_item_stts_cd IS NULL 
       ORDER BY dcl_de DESC LIMIT 100`
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch pending imports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Match import to item (local)
router.post('/', rateLimit, async (req, res) => {
  try {
    const { taskCd, itemCd, itemClsCd, imptItemSttsCd } = req.body;

    if (!taskCd) {
      return res.status(400).json({ error: 'taskCd is required' });
    }

    if (!itemCd) {
      return res.status(400).json({ error: 'itemCd is required' });
    }

    const existing = await db.getAsync(
      `SELECT * FROM imports WHERE task_cd = ?`,
      [taskCd]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    const itemExists = await db.getAsync(
      `SELECT * FROM items WHERE item_cd = ?`,
      [itemCd]
    );

    if (!itemExists) {
      return res.status(404).json({ error: `Item "${itemCd}" not found in inventory` });
    }

    const now = new Date().toISOString();
    const status = imptItemSttsCd || '1';
    const clsCd = itemClsCd || itemExists.item_cls_cd || '50101010';

    await db.runAsync(
      `UPDATE imports 
       SET item_cd = ?, 
           item_cls_cd = ?,
           impt_item_stts_cd = ?, 
           synced = 1, 
           matched_at = ?,
           updated_at = ?
       WHERE task_cd = ?`,
      [itemCd, clsCd, status, now, now, taskCd]
    );

    const updated = await db.getAsync(
      `SELECT * FROM imports WHERE task_cd = ?`,
      [taskCd]
    );

    console.log(`Import ${taskCd} matched to ${itemCd}`);

    res.json({
      success: true,
      message: 'Import matched successfully',
      data: updated
    });
  } catch (error) {
    console.error('Failed to match import:', error);
    res.status(500).json({ error: error.message });
  }
});

// Bulk match imports
router.post('/bulk-match', rateLimit, async (req, res) => {
  try {
    const { matches } = req.body;

    if (!matches || !Array.isArray(matches) || matches.length === 0) {
      return res.status(400).json({
        error: 'matches array is required with at least one item'
      });
    }

    const now = new Date().toISOString();
    let matched = 0;
    let failed = 0;
    const errors = [];

    for (const match of matches) {
      try {
        const { taskCd, itemCd, itemClsCd, imptItemSttsCd } = match;

        if (!taskCd || !itemCd) {
          errors.push({ taskCd, error: 'taskCd and itemCd are required' });
          failed++;
          continue;
        }

        const existing = await db.getAsync(
          `SELECT * FROM imports WHERE task_cd = ?`,
          [taskCd]
        );

        if (!existing) {
          errors.push({ taskCd, error: 'Import record not found' });
          failed++;
          continue;
        }

        const itemExists = await db.getAsync(
          `SELECT * FROM items WHERE item_cd = ?`,
          [itemCd]
        );

        if (!itemExists) {
          errors.push({ taskCd, itemCd, error: 'Item not found in inventory' });
          failed++;
          continue;
        }

        const status = imptItemSttsCd || '1';
        const clsCd = itemClsCd || itemExists.item_cls_cd || '50101010';

        await db.runAsync(
          `UPDATE imports 
           SET item_cd = ?, 
               item_cls_cd = ?,
               impt_item_stts_cd = ?, 
               synced = 1, 
               matched_at = ?,
               updated_at = ?
           WHERE task_cd = ?`,
          [itemCd, clsCd, status, now, now, taskCd]
        );

        matched++;
      } catch (matchError) {
        errors.push({ taskCd: match.taskCd, error: matchError.message });
        failed++;
      }
    }

    console.log(`Bulk match: ${matched} matched, ${failed} failed`);

    res.json({
      success: true,
      message: `Matched ${matched} imports, ${failed} failed`,
      matched,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Failed to bulk match imports:', error);
    res.status(500).json({ error: error.message });
  }
});

// Unmatch import (revert)
router.delete('/:taskCd/match', rateLimit, async (req, res) => {
  try {
    const { taskCd } = req.params;

    const existing = await db.getAsync(
      `SELECT * FROM imports WHERE task_cd = ?`,
      [taskCd]
    );

    if (!existing) {
      return res.status(404).json({ error: 'Import record not found' });
    }

    if (!existing.item_cd) {
      return res.status(400).json({ error: 'Import is not matched to any item' });
    }

    await db.runAsync(
      `UPDATE imports 
       SET item_cd = NULL, 
           item_cls_cd = NULL,
           impt_item_stts_cd = '0', 
           synced = 0,
           matched_at = NULL,
           updated_at = ?
       WHERE task_cd = ?`,
      [new Date().toISOString(), taskCd]
    );

    console.log(`Import ${taskCd} unmatched`);

    res.json({
      success: true,
      message: 'Import unmatched successfully'
    });
  } catch (error) {
    console.error('Failed to unmatch import:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get import stats
router.get('/stats/summary', async (req, res) => {
  try {
    const total = await db.getAsync(`SELECT COUNT(*) as count FROM imports`);
    const matched = await db.getAsync(
      `SELECT COUNT(*) as count FROM imports WHERE impt_item_stts_cd = '1'`
    );
    const pending = await db.getAsync(
      `SELECT COUNT(*) as count FROM imports WHERE impt_item_stts_cd = '0' OR impt_item_stts_cd IS NULL`
    );
    const synced = await db.getAsync(
      `SELECT COUNT(*) as count FROM imports WHERE synced = 1`
    );

    res.json({
      total: total?.count || 0,
      matched: matched?.count || 0,
      pending: pending?.count || 0,
      synced: synced?.count || 0
    });
  } catch (error) {
    console.error('Failed to fetch import stats:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;