// backend/services/vscuClient.js
const axios = require('axios');
const dotenv = require('dotenv');
dotenv.config();

console.log('CMCKEY loaded:', process.env.CMCKEY ? 'YES' : 'NO');
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
    if (includeCmckey && CMCKEY) headers['cmckey'] = CMCKEY;
    return headers;
  },

  sendSale: async (saleData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/trnsSales/saveSales`, saleData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      console.error('VSCU sendSale error:', e.message);
      return e.response?.data || { error: e.message, resultCd: '999' };
    }
  },

  getItems: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/items/selectItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  saveItem: async (itemData) => {
    try {
      const payload = { ...itemData, tin: TIN, bhfId: BHF_ID };
      const r = await axios.post(`${VSCU_URL}/items/saveItems`, payload,
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      console.error('VSCU saveItem error:', e.message);
      return e.response?.data || { error: e.message, resultCd: '999' };
    }
  },

  sendComposition: async (compositionData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/items/saveItemComposition`,
        { ...compositionData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message, resultCd: '999' };
    }
  },

  saveStock: async (stockData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/stock/saveStockItems`, stockData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getStock: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/stock/selectStockItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  saveStockMaster: async (stockMasterData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/stockMaster/saveStockMaster`, stockMasterData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  savePurchase: async (purchaseData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/trnsPurchase/savePurchases`, purchaseData,
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message, resultCd: '999' };
    }
  },

  getPurchases: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/trnsPurchase/selectTrnsPurchaseSales`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  saveBranchCustomer: async (customerData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/branches/saveBrancheCustomers`,
        { ...customerData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  saveBranchUser: async (userData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/branches/saveBrancheUsers`,
        { ...userData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getImportItems: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/imports/selectImportItems`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  updateImportItems: async (importData) => {
    try {
      const r = await axios.post(`${VSCU_URL}/imports/updateImportItems`,
        { ...importData, tin: TIN, bhfId: BHF_ID },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getCodeList: async (lastReqDt = '20230328000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/code/selectCodes`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getItemClassifications: async (lastReqDt = '20180523000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/itemClass/selectItemsClass`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getBranches: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/branches/selectBranches`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  getNotices: async (lastReqDt = '20200101000000') => {
    try {
      const r = await axios.post(`${VSCU_URL}/notices/selectNotices`,
        { tin: TIN, bhfId: BHF_ID, lastReqDt },
        { headers: vscuClient.getHeaders(true), timeout: 30000 });
      return r.data;
    } catch (e) {
      return e.response?.data || { error: e.message };
    }
  },

  // ============================================
  // VSCU STATUS — FIXED
  // Uses lightweight init endpoint with fallback to TCP probe
  // ============================================
  checkStatus: async () => {
    // Primary: try initializer endpoint (fast, always present)
    try {
      const r = await axios.post(
        `${VSCU_URL}/initializer/selectInitInfo`,
        { tin: TIN, bhfId: BHF_ID, dvcSrlNo: 'healthcheck' },
        { headers: vscuClient.getHeaders(false), timeout: 4000 }
      );
      if (r.status === 200) {
        return { connected: true, online: true };
      }
    } catch (e1) {
      // If init returns 4xx/5xx but server responded, still counts as online
      if (e1.response && e1.response.status) {
        return { connected: true, online: true };
      }
      // Fallback: try root probe
      try {
        await axios.get(VSCU_URL, { timeout: 3000 });
        return { connected: true, online: true };
      } catch (e2) {
        if (e2.response && e2.response.status) {
          return { connected: true, online: true };
        }
        return { connected: false, online: false, error: e2.message };
      }
    }
  },

  initializeDevice: async (dvcSrlNo) => {
    try {
      const r = await axios.post(`${VSCU_URL}/initializer/selectInitInfo`,
        { tin: TIN, bhfId: BHF_ID, dvcSrlNo },
        { headers: vscuClient.getHeaders(false), timeout: 30000 });
      return r.data;
    } catch (e) {
      console.error('VSCU initializeDevice error:', e.message);
      return e.response?.data || { error: e.message };
    }
  },
};

module.exports = { ...vscuClient, baseUrl: VSCU_URL };