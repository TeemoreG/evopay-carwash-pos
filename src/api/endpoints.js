const API_BASE = '/api';

const ENDPOINTS = {
  // Items
  GET_ITEMS: `${API_BASE}/items`,
  SAVE_ITEM: `${API_BASE}/items`,
  
  // Sales
  SAVE_SALES: `${API_BASE}/sales`,
  
  // Stock
  GET_STOCK: `${API_BASE}/stock`,
  
  // Purchases
  GET_PURCHASES: `${API_BASE}/purchases`,
  SAVE_PURCHASE: `${API_BASE}/purchases`,
  
  // Imports
  GET_IMPORT_ITEMS: `${API_BASE}/imports`,
  UPDATE_IMPORT_ITEMS: `${API_BASE}/imports/updateImportItems`,
  
  // Branches
  GET_BRANCHES: `${API_BASE}/branches`,
  SAVE_BRANCH: `${API_BASE}/branches`,
  
  // Settings
  GET_SETTINGS: `${API_BASE}/settings`,
  UPDATE_SETTINGS: `${API_BASE}/settings`,
  
  // Data
  GET_TAX_RATES: `${API_BASE}/data/tax-rates`,
  GET_PAYMENT_TYPES: `${API_BASE}/data/payment-types`,
  GET_UNIT_CODES: `${API_BASE}/data/unit-codes`,
  GET_CLASSIFICATIONS: `${API_BASE}/data/classifications`,
  
  // Sync
  PROCESS_SYNC: `${API_BASE}/sync/process`,
  SYNC_STATUS: `${API_BASE}/sync/status`,
  
  // VSCU
  VSCU_STATUS: `${API_BASE}/health`,

  // Users 
  LOGIN: `${API_BASE}/users/login`,
  GET_USERS: `${API_BASE}/users`,
  CREATE_USER: `${API_BASE}/users`,
  DELETE_USER: `${API_BASE}/users`,
};

export default ENDPOINTS;