// backend/routes/branches.js
const express = require('express');
const router = express.Router();
const db = require('../db');
const axios = require('axios');
const vscuClient = require('../services/vscuClient');

// ============================================
// LOCAL CRUD - BRANCHES
// ============================================

// Get all branches (local)
router.get('/', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM branches ORDER BY bhf_id`
    );
    console.log(`Fetched ${rows.length} branches from database`);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branches:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Save branch (add or update) - local
router.post('/', async (req, res) => {
  try {
    const data = req.body;
    const now = new Date().toISOString();

    console.log('Saving branch:', data.bhf_id, '-', data.bhf_name);

    await db.runAsync(
      `INSERT OR REPLACE INTO branches (
        bhf_id, bhf_name, bhf_stts_cd, prvnc_nm, dstrt_nm, sctr_nm,
        loc_desc, mgr_nm, mgr_tel_no, mgr_email, hq_yn,
        address, phone, email, use_yn, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.bhf_id,
        data.bhf_name,
        data.bhf_stts_cd || '01',
        data.prvnc_nm || null,
        data.dstrt_nm || null,
        data.sctr_nm || null,
        data.loc_desc || null,
        data.mgr_nm || null,
        data.mgr_tel_no || null,
        data.mgr_email || null,
        data.hq_yn || 'N',
        data.address || null,
        data.phone || null,
        data.email || null,
        data.use_yn || 'Y',
        now
      ]
    );

    console.log(`Branch ${data.bhf_id} saved successfully`);
    res.json({
      success: true,
      message: 'Branch saved successfully'
    });
  } catch (error) {
    console.error('Error saving branch:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Bulk save branches (from VSCU)
router.post('/bulk', async (req, res) => {
  try {
    const branchList = req.body;

    if (!Array.isArray(branchList) || branchList.length === 0) {
      return res.status(400).json({ error: 'Branches array is required' });
    }

    const now = new Date().toISOString();
    let saved = 0;

    for (const branch of branchList) {
      await db.runAsync(
        `INSERT OR REPLACE INTO branches (
          bhf_id, bhf_name, bhf_stts_cd, prvnc_nm, dstrt_nm, sctr_nm,
          loc_desc, mgr_nm, mgr_tel_no, mgr_email, hq_yn,
          address, phone, email, use_yn, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          branch.bhfId || branch.bhf_id,
          branch.bhfNm || branch.bhf_name || 'Unknown',
          branch.bhfSttsCd || branch.bhf_stts_cd || '01',
          branch.prvncNm || branch.prvnc_nm || null,
          branch.dstrtNm || branch.dstrt_nm || null,
          branch.sctrNm || branch.sctr_nm || null,
          branch.locDesc || branch.loc_desc || null,
          branch.mgrNm || branch.mgr_nm || null,
          branch.mgrTelNo || branch.mgr_tel_no || null,
          branch.mgrEmail || branch.mgr_email || null,
          branch.hqYn || branch.hq_yn || 'N',
          branch.adrs || branch.addr || branch.address || null,
          branch.telNo || branch.phone || null,
          branch.email || null,
          branch.useYn || branch.use_yn || 'Y',
          now
        ]
      );
      saved++;
    }

    console.log(`Bulk saved ${saved} branches from VSCU`);
    res.json({ success: true, saved });
  } catch (error) {
    console.error('Bulk save branches error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOCAL CRUD - BRANCH USERS
// ============================================

// Get users for a specific branch
router.get('/:bhfId/users', async (req, res) => {
  try {
    const { bhfId } = req.params;
    const rows = await db.allAsync(
      `SELECT user_id, user_name, full_name, role, use_yn, synced, bhf_id 
       FROM users WHERE bhf_id = ? ORDER BY user_id`,
      [bhfId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branch users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all users with branch info
router.get('/users/all', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT user_id, user_name, full_name, role, use_yn, synced, bhf_id 
       FROM users ORDER BY bhf_id, user_id`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all users:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// LOCAL CRUD - BRANCH INSURANCE
// ============================================

// Get insurance for a specific branch
router.get('/:bhfId/insurance', async (req, res) => {
  try {
    const { bhfId } = req.params;
    const rows = await db.allAsync(
      `SELECT * FROM branch_insurance WHERE bhf_id = ? ORDER BY isrcc_cd`,
      [bhfId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branch insurance:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Get all branch insurance
router.get('/insurance/all', async (req, res) => {
  try {
    const rows = await db.allAsync(
      `SELECT * FROM branch_insurance ORDER BY bhf_id, isrcc_cd`
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching all branch insurance:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Save branch insurance locally
router.post('/insurance', async (req, res) => {
  try {
    const data = req.body;
    const now = new Date().toISOString();

    console.log('Saving branch insurance locally:', data.isrccCd);

    await db.runAsync(
      `INSERT OR REPLACE INTO branch_insurance (
        bhf_id, isrcc_cd, isrcc_nm, isrc_rt, use_yn, synced, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.bhfId || '00',
        data.isrccCd,
        data.isrccNm,
        data.isrcRt || 0,
        data.useYn || 'Y',
        0,
        now,
        now
      ]
    );

    res.json({ success: true, message: 'Branch insurance saved locally' });
  } catch (error) {
    console.error('Error saving branch insurance:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// VSCU PROXY ENDPOINTS
// ============================================

// Get branches List from VSCU
router.post('/selectBranches', async (req, res) => {
  console.log('===== VSCU SELECT BRANCHES PROXY =====');
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

    console.log('Headers:', JSON.stringify(headers, null, 2));
    console.log('Payload:', JSON.stringify({ tin, bhfId, lastReqDt }, null, 2));
    console.log('Target:', `${vscuClient.baseUrl}/branches/selectBranches`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/branches/selectBranches`,
      { tin, bhfId, lastReqDt },
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);
    console.log('Branch list length:', response.data?.data?.bhfList?.length || 0);

    res.json(response.data);
  } catch (error) {
    console.error('Failed to fetch branches from VSCU:', error.message);
    if (error.response) {
      console.error('VSCU Error Status:', error.response.status);
      console.error('VSCU Error Data:', JSON.stringify(error.response.data, null, 2));
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

// Save branch customer to VSCU
router.post('/saveBrancheCustomers', async (req, res) => {
  console.log('===== VSCU SAVE BRANCH CUSTOMER PROXY =====');
  try {
    const payload = req.body;

    // Set defaults if missing
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
    if (!payload.custTin && !payload.custNm) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'custTin or custNm is required'
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
    console.log('Target:', `${vscuClient.baseUrl}/branches/saveBrancheCustomers`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/branches/saveBrancheCustomers`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);

    res.json(response.data);
  } catch (error) {
    console.error('Failed to save branch customer:', error.message);
    if (error.response) {
      console.error('VSCU Error Status:', error.response.status);
      console.error('VSCU Error Data:', JSON.stringify(error.response.data, null, 2));
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

// Save branch user to VSCU (updates main users table)
router.post('/saveBrancheUsers', async (req, res) => {
  console.log('===== VSCU SAVE BRANCH USER PROXY =====');
  try {
    const payload = req.body;

    // Set defaults if missing
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
    if (!payload.userId && !payload.userNm) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'userId and userNm are required'
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
    console.log('Target:', `${vscuClient.baseUrl}/branches/saveBrancheUsers`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/branches/saveBrancheUsers`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);

    // If VSCU success, update main users table
    if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
      const now = new Date().toISOString();

      // Check if user exists in users table
      const existing = await db.getAsync(
        `SELECT user_id FROM users WHERE user_id = ?`,
        [payload.userId]
      );

      if (existing) {
        // Update existing user
        await db.runAsync(
          `UPDATE users SET 
            user_name = ?,
            full_name = ?,
            password = ?,
            bhf_id = ?,
            use_yn = ?,
            synced = 1,
            updated_at = ?
          WHERE user_id = ?`,
          [
            payload.userNm,
            payload.userNm,
            payload.pwd || null,
            payload.bhfId || '00',
            payload.useYn || 'Y',
            now,
            payload.userId
          ]
        );
        console.log(`Branch user ${payload.userId} updated in main users table (synced)`);
      } else {
        // Insert new user
        await db.runAsync(
          `INSERT INTO users (
            user_id, user_name, full_name, password, role, bhf_id, use_yn, synced, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            payload.userId,
            payload.userNm,
            payload.userNm,
            payload.pwd || null,
            'cashier',
            payload.bhfId || '00',
            payload.useYn || 'Y',
            1,
            now,
            now
          ]
        );
        console.log(`Branch user ${payload.userId} inserted into main users table (synced)`);
      }
    }

    res.json(response.data);
  } catch (error) {
    console.error('Failed to save branch user:', error.message);
    if (error.response) {
      console.error('VSCU Error Status:', error.response.status);
      console.error('VSCU Error Data:', JSON.stringify(error.response.data, null, 2));
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

// Save branch insurance to VSCU (also saves locally)
router.post('/saveBrancheInsurances', async (req, res) => {
  console.log('===== VSCU SAVE BRANCH INSURANCE PROXY =====');
  try {
    const payload = req.body;

    // Set defaults if missing
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
    if (!payload.isrccCd && !payload.isrccNm) {
      return res.status(400).json({
        resultCd: '999',
        resultMsg: 'isrccCd and isrccNm are required'
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
    console.log('Target:', `${vscuClient.baseUrl}/branches/saveBrancheInsurances`);

    const response = await axios.post(
      `${vscuClient.baseUrl}/branches/saveBrancheInsurances`,
      payload,
      { headers, timeout: 30000 }
    );

    console.log('Response Code:', response.data?.resultCd);
    console.log('Response Msg:', response.data?.resultMsg);

    // If VSCU success, save to local db
    if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT OR REPLACE INTO branch_insurance (
          bhf_id, isrcc_cd, isrcc_nm, isrc_rt, use_yn, synced, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.bhfId || '00',
          payload.isrccCd,
          payload.isrccNm,
          payload.isrcRt || 0,
          payload.useYn || 'Y',
          1,
          now,
          now
        ]
      );
      console.log(`Branch insurance ${payload.isrccCd} saved locally (synced)`);
    }

    res.json(response.data);
  } catch (error) {
    console.error('Failed to save branch insurance:', error.message);
    if (error.response) {
      console.error('VSCU Error Status:', error.response.status);
      console.error('VSCU Error Data:', JSON.stringify(error.response.data, null, 2));
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

module.exports = router;