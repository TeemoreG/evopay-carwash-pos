// src/api/vscuApi.js
import axiosInstance from './axiosConfig';
import ENDPOINTS from './endpoints';

const TIN = import.meta.env.VITE_VSCU_TIN;
const BHF_ID = import.meta.env.VITE_VSCU_BHF_ID;

// ============================================
// HELPERS
// ============================================
const getBasePayload = () => ({
  tin: TIN,
  bhfId: BHF_ID
});

// ============================================
// INITIALIZATION
// ============================================
export const initializeDevice = (data) => {
  return axiosInstance.post('/api/initializer/selectInitInfo', data);
};

// ============================================
// BASIC DATA MANAGEMENT
// ============================================
export const getCodeList = (lastReqDt = '20230328000000') => {
  return axiosInstance.post('/api/data/code/selectCodes', {
    ...getBasePayload(),
    lastReqDt
  });
};

export const getItemClassifications = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/data/itemClass/selectItemsClass', {
    ...getBasePayload(),
    lastReqDt
  });
};

export const getCustomerByPin = (custmTin) => {
  return axiosInstance.post('/api/customers/selectCustomer', {
    ...getBasePayload(),
    custmTin
  });
};

export const getBranchesFromVSCU = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/branches/selectBranches', {
    ...getBasePayload(),
    lastReqDt
  });
};

export const getNotices = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/notices/selectNotices', {
    ...getBasePayload(),
    lastReqDt
  });
};

// ============================================
// BRANCH INFORMATION MANAGEMENT
// ============================================
export const saveBranchCustomer = (data) => {
  return axiosInstance.post('/api/branches/saveBrancheCustomers', {
    ...getBasePayload(),
    ...data
  });
};

export const saveBranchUser = (data) => {
  return axiosInstance.post('/api/branches/saveBrancheUsers', {
    ...getBasePayload(),
    ...data
  });
};

export const saveBranchInsurance = (data) => {
  return axiosInstance.post('/api/branches/saveBrancheInsurances', {
    ...getBasePayload(),
    ...data
  });
};

// ============================================
// ITEMS
// ============================================
export const getItems = () => {
  return axiosInstance.get(ENDPOINTS.GET_ITEMS);
};

export const getItem = (itemCd) => {
  return axiosInstance.get(`${ENDPOINTS.GET_ITEMS}/${itemCd}`);
};

export const saveItem = (data) => {
  return axiosInstance.post(ENDPOINTS.SAVE_ITEM, data);
};

export const deleteItem = (itemCd) => {
  return axiosInstance.delete(`${ENDPOINTS.GET_ITEMS}/${itemCd}`);
};

export const searchItems = (query) => {
  return axiosInstance.get(`${ENDPOINTS.GET_ITEMS}/search/${query}`);
};

export const bulkImportItems = (items) => {
  return axiosInstance.post(`${ENDPOINTS.GET_ITEMS}/bulk`, items);
};

export const getItemsFromVSCU = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/items/selectItems', {
    ...getBasePayload(),
    lastReqDt
  });
};

export const getItemInfo = (data) => {
  return axiosInstance.post('/api/items/selectItems', data);
};

export const sendItem = (data) => {
  return axiosInstance.post('/api/items/saveItems', {
    ...getBasePayload(),
    ...data
  });
};

export const sendItemComposition = (data) => {
  return axiosInstance.post('/api/items/saveItemComposition', {
    ...getBasePayload(),
    ...data
  });
};

// ============================================
// IMPORTS
// ============================================
export const getLocalImportItems = () => {
  return axiosInstance.get(ENDPOINTS.GET_IMPORT_ITEMS);
};

export const updateImportItems = (data) => {
  return axiosInstance.post(ENDPOINTS.UPDATE_IMPORT_ITEMS, data);
};

export const getImportItemsFromVSCU = (lastReqDt = '20190524000000') => {
  return axiosInstance.post('/api/imports/selectImportItems', {
    ...getBasePayload(),
    lastReqDt
  });
};

// ============================================
// PURCHASES
// ============================================
export const getPurchases = () => {
  return axiosInstance.get(ENDPOINTS.GET_PURCHASES);
};

export const savePurchase = (data) => {
  return axiosInstance.post(ENDPOINTS.SAVE_PURCHASE, data);
};

export const getPurchasesFromVSCU = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/purchases/selectTrnsPurchaseSales', {
    ...getBasePayload(),
    lastReqDt
  });
};

// ============================================
// SALES
// ============================================
export const saveSales = (data) => {
  return axiosInstance.post(ENDPOINTS.SAVE_SALES, data);
};

export const getSales = (params) => {
  return axiosInstance.get(ENDPOINTS.SAVE_SALES, { params });
};

export const getSale = (id) => {
  return axiosInstance.get(`${ENDPOINTS.SAVE_SALES}/${id}`);
};

export const retrySale = (id) => {
  return axiosInstance.post(`${ENDPOINTS.SAVE_SALES}/${id}/retry`);
};

export const getSalesStats = () => {
  return axiosInstance.get(`${ENDPOINTS.SAVE_SALES}/stats/summary`);
};

// ============================================
// STOCK / PRODUCTS
// ============================================
export const getStock = () => {
  return axiosInstance.get(ENDPOINTS.GET_STOCK);
};

export const getStockItem = (itemCd) => {
  return axiosInstance.get(`${ENDPOINTS.GET_STOCK}/${itemCd}`);
};

export const saveStockMovement = (data) => {
  return axiosInstance.post(`${ENDPOINTS.GET_STOCK}/movement`, {
    ...getBasePayload(),
    ...data
  });
};

export const getStockMovements = (itemCd) => {
  return axiosInstance.get(`${ENDPOINTS.GET_STOCK}/${itemCd}/movements`);
};

export const getLowStockAlerts = () => {
  return axiosInstance.get(`${ENDPOINTS.GET_STOCK}/alerts/low`);
};

export const syncStockToVSCU = () => {
  return axiosInstance.post('/api/stock/sync');
};

export const getStockFromVSCU = (lastReqDt = '20200101000000') => {
  return axiosInstance.post('/api/stock/selectStockItems', {
    ...getBasePayload(),
    lastReqDt
  });
};

export const saveStockMaster = (itemCd, rsdQty) => {
  return axiosInstance.post('/api/stock/stockMaster/saveStockMaster', {
    ...getBasePayload(),
    itemCd,
    rsdQty,
    regrId: 'Admin',
    regrNm: 'Admin',
    modrNm: 'Admin',
    modrId: 'Admin'
  });
};

// ============================================
// PAYMENTS (M-Pesa / QR)
// ============================================
export const getNextInvoice = () => {
  return axiosInstance.get('/api/pay/next-invoice');
};

// M-Pesa Dynamic QR (Safaricom) — default mode
export const generateMpesaQR = (invoice_no, amount) => {
  return axiosInstance.post('/api/pay/qr/mpesa', { invoice_no, amount });
};

// Custom QR (redirect to /pay/:invoice) — Airtel / Card
export const createQRSession = (data) => {
  return axiosInstance.post('/api/pay/qr/generate', data);
};

export const generateCustomQR = (invoice_no, amount, sale_id) => {
  return axiosInstance.post('/api/pay/qr/generate', { invoice_no, amount, sale_id });
};

export const getQRSession = (invoiceNo) => {
  return axiosInstance.get(`/api/pay/qr/${invoiceNo}`);
};

export const stkPush = (invoiceNo, phone) => {
  return axiosInstance.post('/api/pay/stk-push', {
    invoice_no: invoiceNo,
    phone
  });
};

export const pollPaymentStatus = (invoiceNo) => {
  return axiosInstance.get(`/api/pay/payment-status/${invoiceNo}`);
};

export const confirmPayment = (invoiceNo, method = 'cash') => {
  return axiosInstance.post('/api/pay/payment-confirm', {
    invoice_no: invoiceNo,
    payment_method: method
  });
};

export const getPublicPayment = (invoiceNo) => {
  return axiosInstance.get(`/api/pay/${invoiceNo}`);
};

export const getMpesaStatus = () => {
  return axiosInstance.get('/api/pay/mpesa/status');
};

export const cancelPaymentSession = (invoiceNo) => {
  return axiosInstance.post(`/api/pay/cancel/${invoiceNo}`);
};

export const getSaleByInvoice = (invoiceNo) => {
  return axiosInstance.get(`/api/sales/by-invoice/${invoiceNo}`);
};

export const getReceiptByInvoice = (invoiceNo) => {
  return axiosInstance.get(`/api/receipts/${invoiceNo}`);
};

export const sendReceiptSms = (invoiceNo, phone) => {
  return axiosInstance.post(`/api/receipts/${invoiceNo}/send-sms`, { phone });
};

// ============================================
// BRANCHES (Local)
// ============================================
export const getBranches = () => {
  return axiosInstance.get(ENDPOINTS.GET_BRANCHES);
};

export const saveBranch = (data) => {
  return axiosInstance.post(ENDPOINTS.SAVE_BRANCH, data);
};

// ============================================
// DATA (Reference Data - Local)
// ============================================
export const getTaxRates = () => {
  return axiosInstance.get(ENDPOINTS.GET_TAX_RATES);
};

export const getPaymentTypes = () => {
  return axiosInstance.get(ENDPOINTS.GET_PAYMENT_TYPES);
};

export const getUnitCodes = () => {
  return axiosInstance.get(ENDPOINTS.GET_UNIT_CODES);
};

export const getClassifications = () => {
  return axiosInstance.get(ENDPOINTS.GET_CLASSIFICATIONS);
};

export const getSettings = () => {
  return axiosInstance.get(ENDPOINTS.GET_SETTINGS);
};

export const updateSettings = (data) => {
  return axiosInstance.post(ENDPOINTS.GET_SETTINGS, data);
};

// ============================================
// SYNC (Queue Management)
// ============================================
export const processSync = () => {
  return axiosInstance.post(ENDPOINTS.PROCESS_SYNC);
};

export const getSyncStatus = () => {
  return axiosInstance.get(ENDPOINTS.SYNC_STATUS);
};

export const retrySync = (id) => {
  return axiosInstance.post(`${ENDPOINTS.PROCESS_SYNC}/retry/${id}`);
};

export const clearSyncQueue = () => {
  return axiosInstance.delete(ENDPOINTS.PROCESS_SYNC);
};

export const clearAllSync = () => {
  return axiosInstance.delete(`${ENDPOINTS.PROCESS_SYNC}/clear-all`);
};

export const autoSync = () => {
  return axiosInstance.post(`${ENDPOINTS.PROCESS_SYNC}/auto-sync`);
};

// ============================================
// VSCU STATUS
// ============================================
export const checkVSCUStatus = async () => {
  try {
    const response = await axiosInstance.get('/api/vscu/status');
    return { data: { online: response.data?.online || false } };
  } catch (error) {
    console.error('VSCU status check failed:', error);
    return { data: { online: false } };
  }
};

// ============================================
// USERS (Cashier Management)
// ============================================
export const getUsers = () => {
  return axiosInstance.get(ENDPOINTS.GET_USERS);
};

export const createUser = (data) => {
  return axiosInstance.post(ENDPOINTS.CREATE_USER, data);
};

export const deleteUser = (userId) => {
  return axiosInstance.delete(`${ENDPOINTS.DELETE_USER}/${userId}`);
};

export const loginUser = (credentials) => {
  return axiosInstance.post(ENDPOINTS.LOGIN, credentials);
};

// ============================================
// REPORTS
// ============================================
export const getXReport = () => {
  return axiosInstance.get('/api/reports/x-report');
};

export const getZReport = () => {
  return axiosInstance.get('/api/reports/z-report');
};

export const getItemReport = (params) => {
  return axiosInstance.get('/api/reports/items', { params });
};

export const getTaxReport = (params) => {
  return axiosInstance.get('/api/reports/tax', { params });
};