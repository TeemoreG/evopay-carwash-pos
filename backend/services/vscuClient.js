// backend/services/vscuClient.js
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

console.log('CMCKEY loaded:', process.env.CMCKEY ? 'YES' : 'NO');
console.log('CMCKEY value:', process.env.CMCKEY);
console.log('TIN loaded:', process.env.TIN);

const VSCU_URL = process.env.VSCU_URL;
const TIN = process.env.TIN;
const BHF_ID = process.env.BHF_ID;
const CMCKEY = process.env.CMCKEY;

const vscuClient = {
  getHeaders: (includeCmckey = true) => {
    const headers = {
      'tin': TIN,
      'bhfId': BHF_ID,
      'Content-Type': 'application/json',
    };
    if (includeCmckey && CMCKEY) {
      headers['cmckey'] = CMCKEY;
    }
    return headers;
  },

  // ============================================
  // SALES
  // ============================================
  sendSale: async (saleData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/trnsSales/saveSales`,
        saleData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU sendSale error:', error.message);
      if (error.response) {
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
        return error.response.data || { error: error.message, resultCd: '999' };
      }
      return { error: error.message, resultCd: '999' };
    }
  },

  // ============================================
  // ITEMS
  // ============================================
  getItems: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/items/selectItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getItems error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  saveItem: async (itemData) => {
  try {
    const payload = { ...itemData, tin: TIN, bhfId: BHF_ID };
    
    // ADD REQUEST LOGGING
    console.log('[vscuClient] Save Item Request:', {
      itemCd: payload.itemCd,
      itemNm: payload.itemNm,
      itemClsCd: payload.itemClsCd
    });

    const response = await axios.post(
      `${VSCU_URL}/items/saveItems`,
      payload,
      { headers: vscuClient.getHeaders(true), timeout: 30000 }
    );

    // RESPONSE LOGGING
    console.log('[vscuClient] Save Item Response:', {
      resultCd: response.data?.resultCd,
      resultMsg: response.data?.resultMsg,
      resultDt: response.data?.resultDt,
      itemCd: payload.itemCd
    });

    // LOG FULL RESPONSE FOR ERRORS
    if (response.data?.resultCd !== '000' && response.data?.resultCd !== '00') {
      console.log('⚠️ [vscuClient] Non-success response:', JSON.stringify(response.data, null, 2));
    }

    return response.data;
  } catch (error) {
    console.error('❌ VSCU saveItem error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      return error.response.data || { error: error.message };
    }
    return { error: error.message, resultCd: '999' };
  }
},

  // ============================================
  // ITEM COMPOSITION
  // ============================================
  sendComposition: async (compositionData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/items/saveItemComposition`,
        { ...compositionData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU sendComposition error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message, resultCd: '999' };
      }
      return { error: error.message, resultCd: '999' };
    }
  },

  // ============================================
  // STOCK
  // ============================================
  saveStock: async (stockData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/stock/saveStockItems`,
        stockData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU saveStock error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  getStock: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/stock/selectStockItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getStock error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  saveStockMaster: async (stockMasterData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/stockMaster/saveStockMaster`,
        stockMasterData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU saveStockMaster error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // PURCHASES
  // ============================================
  savePurchase: async (purchaseData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/trnsPurchase/savePurchases`,
        purchaseData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU savePurchase error:', error.message);
      if (error.response) {
        console.error('=== VSCU PURCHASE ERROR DETAILS ===');
        console.error('Status:', error.response.status);
        console.error('Data:', JSON.stringify(error.response.data, null, 2));
        console.error('Headers:', JSON.stringify(error.response.headers, null, 2));
        return error.response.data || {
          error: error.message,
          resultCd: '999',
          resultMsg: error.response.statusText || 'VSCU error'
        };
      }
      return { error: error.message, resultCd: '999' };
    }
  },

  getPurchases: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/trnsPurchase/selectTrnsPurchaseSales`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getPurchases error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // BRANCHES / CUSTOMERS
  // ============================================
  saveBranchCustomer: async (customerData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/branches/saveBrancheCustomers`,
        { ...customerData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU saveBranchCustomer error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  saveBranchUser: async (userData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/branches/saveBrancheUsers`,
        { ...userData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU saveBranchUser error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // IMPORTS
  // ============================================
  getImportItems: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/imports/selectImportItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getImportItems error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  updateImportItems: async (importData) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/imports/updateImportItems`,
        { ...importData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU updateImportItems error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // CODE LISTS / REFERENCE DATA
  // ============================================
  getCodeList: async (lastReqDt = '20230328000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/code/selectCodes`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getCodeList error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  getItemClassifications: async (lastReqDt = '20180523000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/itemClass/selectItemsClass`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getItemClassifications error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  getBranches: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/branches/selectBranches`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getBranches error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // NOTICES
  // ============================================
  getNotices: async (lastReqDt = '20200101000000') => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/notices/selectNotices`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU getNotices error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },

  // ============================================
  // VSCU STATUS
  // ============================================
  checkStatus: async () => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/code/selectCodes`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt: '20230328000000' },
        { headers: vscuClient.getHeaders(true), timeout: 5000 }
      );
      return { connected: response.status === 200, online: true };
    } catch (error) {
      return { connected: false, online: false, error: error.message };
    }
  },

  // ============================================
  // INITIALIZATION
  // ============================================
  initializeDevice: async (dvcSrlNo) => {
    try {
      const response = await axios.post(
        `${VSCU_URL}/initializer/selectInitInfo`,
        { tin: TIN, bhfId: BHF_ID, dvcSrlNo },
        { headers: vscuClient.getHeaders(false), timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('VSCU initializeDevice error:', error.message);
      if (error.response) {
        return error.response.data || { error: error.message };
      }
      return { error: error.message };
    }
  },
};

module.exports = {
  ...vscuClient,
  baseUrl: VSCU_URL
};