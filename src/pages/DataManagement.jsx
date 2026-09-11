// src/pages/DataManagement.jsx - FIXED
import React, { useState, useEffect, Fragment } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  checkVSCUStatus,
  getCodeList,
  getItemClassifications
} from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';

const DataManagement = () => {
  const [activeTab, setActiveTab] = useState('all');
  const [allCodes, setAllCodes] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  const [unitCodes, setUnitCodes] = useState([]);
  const [classifications, setClassifications] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [formData, setFormData] = useState({ 
    code: '', 
    label: '', 
    rate: 0, 
    description: '',
    pin: '',
    phone: '',
    email: '',
    address: ''
  });
  const [vscuOnline, setVscuOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncAllLoading, setSyncAllLoading] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  useEffect(() => {
    fetchAllData();
    checkVSCU();
  }, []);

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const fetchAllData = async () => {
    try {
      setLoading(true);
      
      const [tax, payment, unit, classif, supplier, allCodesData] = await Promise.all([
        axiosInstance.get('/api/data/tax-rates').catch(() => ({ data: [] })),
        axiosInstance.get('/api/data/payment-types').catch(() => ({ data: [] })),
        axiosInstance.get('/api/data/unit-codes').catch(() => ({ data: [] })),
        axiosInstance.get('/api/data/classifications').catch(() => ({ data: [] })),
        axiosInstance.get('/api/suppliers').catch(() => ({ data: [] })),
        axiosInstance.get('/api/data/codes/all').catch(() => ({ data: { data: { clsList: [] } } }))
      ]);
      
      setTaxRates(tax.data || []);
      setPaymentTypes(payment.data || []);
      setUnitCodes(unit.data || []);
      
      // FIX: Ensure classifications is set correctly
      const classifData = classif.data || [];
      console.log('Classifications fetched:', classifData.length);
      setClassifications(classifData);
      
      setSuppliers(supplier.data || []);
      
      const codesData = allCodesData.data;
      if (codesData?.resultCd === '000') {
        setAllCodes(codesData?.data?.clsList || []);
      } else {
        setAllCodes([]);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
      toast.error('Error loading reference data');
    } finally {
      setLoading(false);
    }
  };

  const fetchCodeList = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setSyncAllLoading(true);
    setSyncProgress('Fetching code list from KRA...');
    
    try {
      const response = await getCodeList('20230328000000');
      
      if (response.data?.resultCd === '000') {
        const clsList = response.data?.data?.clsList || [];
        const totalCodes = clsList.reduce((sum, c) => sum + (c.dtlList?.length || 0), 0);
        
        await axiosInstance.post('/api/data/codes/bulk', clsList);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await fetchAllData();
        
        setSyncProgress('');
        toast.success(`Fetched ${clsList.length} code categories (${totalCodes} total codes) from KRA`);
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to fetch code list');
      }
    } catch (error) {
      console.error('Fetch code list failed:', error);
      toast.error(error.response?.data?.error || 'Failed to fetch code list from KRA');
    } finally {
      setSyncAllLoading(false);
      setSyncProgress('');
    }
  };

  const fetchItemClassificationList = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setSyncing(true);
    setSyncProgress('Fetching classifications from KRA...');
    
    try {
      const response = await getItemClassifications('20180523000000');
      
      if (response.data?.resultCd === '000') {
        const classList = response.data?.data?.itemClsList || [];
        
        if (classList.length > 0) {
          await axiosInstance.post('/api/data/classifications/bulk', classList);
          await new Promise(resolve => setTimeout(resolve, 1500));
          await fetchAllData();
          
          setSyncProgress('');
          toast.success(`Fetched ${classList.length} classifications from KRA`);
        } else {
          toast.info('No classifications found');
        }
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to fetch classifications');
      }
    } catch (error) {
      console.error('Fetch classifications failed:', error);
      toast.error(error.response?.data?.error || 'Failed to fetch classifications from KRA');
    } finally {
      setSyncing(false);
      setSyncProgress('');
    }
  };

  const getCurrentData = () => {
    switch(activeTab) {
      case 'all': return allCodes;
      case 'tax': return taxRates;
      case 'payment': return paymentTypes;
      case 'unit': return unitCodes;
      case 'class': return classifications;
      case 'supplier': return suppliers;
      default: return [];
    }
  };

  const getEndpoint = () => {
    switch(activeTab) {
      case 'tax': return '/api/data/tax-rates';
      case 'payment': return '/api/data/payment-types';
      case 'unit': return '/api/data/unit-codes';
      case 'class': return '/api/data/classifications';
      case 'supplier': return '/api/suppliers';
      default: return '';
    }
  };

  const getLabel = () => {
    switch(activeTab) {
      case 'tax': return 'Tax Rate';
      case 'payment': return 'Payment Type';
      case 'unit': return 'Unit Code';
      case 'class': return 'Classification';
      case 'supplier': return 'Supplier';
      default: return 'Item';
    }
  };

  const tabs = [
    { id: 'all', label: 'All Codes' },
    { id: 'tax', label: 'Tax Rates' },
    { id: 'payment', label: 'Payment Types' },
    { id: 'unit', label: 'Unit Codes' },
    { id: 'class', label: 'Classifications' },
    { id: 'supplier', label: 'Suppliers' },
  ];

  const handleAdd = () => {
    setEditingItem(null);
    setFormData({ 
      code: '', 
      label: '', 
      rate: 0, 
      description: '',
      pin: '',
      phone: '',
      email: '',
      address: ''
    });
    setShowAddModal(true);
  };

  const handleEdit = (item) => {
    setEditingItem(item);
    setFormData({
      code: item.code || item.id || '',
      label: item.label || item.name || '',
      rate: item.rate || 0,
      description: item.description || '',
      pin: item.pin || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || ''
    });
    setShowAddModal(true);
  };

  const handleSave = async () => {
    if (activeTab === 'supplier') {
      if (!formData.pin || !formData.label) {
        toast.error('PIN and Name are required');
        return;
      }
      if (!/^[A-Z0-9]{9,16}$/.test(formData.pin)) {
        toast.error('Invalid PIN format (9-16 characters, letters and numbers)');
        return;
      }
      
      try {
        const payload = {
          id: formData.code || Date.now().toString(),
          pin: formData.pin,
          name: formData.label,
          phone: formData.phone || null,
          email: formData.email || null,
          address: formData.address || null,
          tax_type: 'B',
          is_active: 1
        };

        await axiosInstance.post('/api/suppliers', payload);
        await fetchAllData();
        toast.success(`Supplier ${editingItem ? 'updated' : 'added'} successfully`);
        setShowAddModal(false);
        setFormData({ code: '', label: '', rate: 0, description: '', pin: '', phone: '', email: '', address: '' });
      } catch (error) {
        console.error('Save error:', error);
        toast.error(error.response?.data?.error || 'Error saving supplier');
      }
      return;
    }

    if (activeTab === 'all') {
      toast.info('Cannot add codes directly. Use "Get Code List" button to fetch from KRA.');
      return;
    }

    if (!formData.code || !formData.label) {
      toast.error('Code and Name are required');
      return;
    }

    if (activeTab === 'payment' && !/^\d{2}$/.test(formData.code)) {
      toast.error('Payment code must be exactly 2 digits (e.g., 01, 02, 03)');
      return;
    }
    if (activeTab === 'unit' && !/^[A-Z]{2}$/.test(formData.code)) {
      toast.error('Unit code must be exactly 2 uppercase letters (e.g., NT, KG, L)');
      return;
    }
    if (activeTab === 'class' && !/^\d{8}$/.test(formData.code)) {
      toast.error('Classification code must be exactly 8 digits (e.g., 50101010)');
      return;
    }

    try {
      const payload = {
        code: formData.code,
        label: formData.label,
        name: formData.label,
        rate: formData.rate,
        description: formData.description
      };

      if (activeTab === 'payment') {
        payload.is_active = 1;
      }

      const endpoint = getEndpoint();
      await axiosInstance.post(endpoint, payload);
      await fetchAllData();
      toast.success(`${getLabel()} ${editingItem ? 'updated' : 'added'} successfully`);
      setShowAddModal(false);
      setFormData({ code: '', label: '', rate: 0, description: '', pin: '', phone: '', email: '', address: '' });
    } catch (error) {
      console.error('Save error:', error);
      toast.error(error.response?.data?.error || 'Error saving data');
    }
  };

  const handleDelete = async (code) => {
    if (activeTab === 'payment' && ['01', '02', '03'].includes(code)) {
      toast.error('Cannot delete default payment types (Cash, Card, Mobile Money)');
      return;
    }

    if (!window.confirm(`Delete this ${getLabel().toLowerCase()}?`)) return;

    try {
      const endpoint = getEndpoint();
      await axiosInstance.delete(`${endpoint}/${code}`);
      await fetchAllData();
      toast.success(`${getLabel()} deleted successfully`);
    } catch (error) {
      console.error('Delete error:', error);
      toast.error(error.response?.data?.error || 'Error deleting data');
    }
  };

  const currentData = getCurrentData();

  const getCount = (tabId) => {
    switch(tabId) {
      case 'all': return allCodes.reduce((sum, c) => sum + (c.dtlList?.length || 0), 0);
      case 'tax': return taxRates.length;
      case 'payment': return paymentTypes.length;
      case 'unit': return unitCodes.length;
      case 'class': return classifications.length;
      case 'supplier': return suppliers.length;
      default: return 0;
    }
  };

  const getCategoryCount = (tabId) => {
    switch(tabId) {
      case 'all': return allCodes.length;
      default: return 0;
    }
  };

  // Determine if add button should show
  const showAddButton = activeTab !== 'supplier' && activeTab !== 'all';

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#1a2a4a]">Data Management</h1>
        <p className="text-gray-500 text-sm">Manage KRA reference data and system codes</p>
      </div>

      {/* VSCU Status + Two Separate Buttons */}
      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-xs font-medium text-gray-600">VSCU: {vscuOnline ? 'Online' : 'Offline'}</span>
        </div>
        {vscuOnline && (
          <>
            <button
              onClick={fetchCodeList}
              disabled={syncAllLoading}
              className="px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white disabled:opacity-50"
            >
              {syncAllLoading ? (
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
              )}
              <span>{syncAllLoading ? syncProgress || 'Fetching...' : 'Get Code List'}</span>
            </button>
            <button
              onClick={fetchItemClassificationList}
              disabled={syncing}
              className="px-3 py-1 rounded-lg text-xs transition flex items-center gap-1 bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
            >
              {syncing ? (
                <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
              )}
              <span>{syncing ? syncProgress || 'Fetching...' : 'Get Item Classification List'}</span>
            </button>
          </>
        )}
        {!vscuOnline && <span className="text-xs text-yellow-600">VSCU offline - sync disabled</span>}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 mb-6">
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">All Codes</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{getCount('all')}</p>
          <p className="text-xs text-gray-400">{getCategoryCount('all')} categories</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Tax Rates</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{taxRates.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Payment Types</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{paymentTypes.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Unit Codes</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{unitCodes.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Classifications</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{classifications.length}</p>
        </div>
        <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-100">
          <p className="text-xs text-gray-500">Suppliers</p>
          <p className="text-lg font-bold text-[#1a2a4a]">{suppliers.length}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-1 mb-6 bg-white p-1 rounded-lg shadow-sm border border-gray-100">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-[#f47b20] text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-[#1a2a4a]'
            }`}
          >
            {tab.label}
            <span className={`text-xs ${activeTab === tab.id ? 'text-white/70' : 'text-gray-400'}`}>
              ({getCount(tab.id)})
            </span>
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          {showAddButton && (
            <button
              onClick={handleAdd}
              className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-3 py-1.5 rounded-lg text-sm transition flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add {getLabel()}
            </button>
          )}
          <button
            onClick={fetchAllData}
            disabled={loading}
            className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-3 py-1.5 rounded-lg text-sm transition disabled:opacity-50 flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {activeTab === 'all' ? (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {activeTab === 'supplier' ? 'PIN' : 'Code'}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        {activeTab === 'supplier' ? 'Contact' : 'Value / Description'}
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentData.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                      No data found. Click "Get Code List" or "Get Item Classification List" to fetch from KRA.
                    </td>
                  </tr>
                ) : activeTab === 'all' ? (
                  currentData.map((category) => (
                    <Fragment key={category.cdCls}>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan="5" className="px-4 py-2.5 font-bold text-[#1a2a4a]">
                          {category.cdCls} - {category.cdClsNm}
                          <span className="ml-2 text-xs font-normal text-gray-400">
                            ({category.dtlList?.length || 0} codes)
                          </span>
                        </td>
                      </tr>
                      {category.dtlList && category.dtlList.length > 0 ? (
                        category.dtlList.map((item) => (
                          <tr key={`${category.cdCls}-${item.cd}`} className="border-b border-gray-50 hover:bg-gray-50 transition">
                            <td className="px-4 py-2.5 text-xs text-gray-400 pl-8">{category.cdCls}</td>
                            <td className="px-4 py-2.5 font-mono text-xs font-bold text-[#1a2a4a]">{item.cd}</td>
                            <td className="px-4 py-2.5 text-[#1a2a4a]">{item.cdNm}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{item.cdDesc || '-'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                item.useYn === 'Y' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {item.useYn === 'Y' ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="px-4 py-2 text-center text-gray-400 text-xs">
                            No codes in this category
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : (
                  currentData.map((item) => (
                    <tr key={item.code || item.id || item.pin} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-bold text-[#1a2a4a]">
                        {item.code || item.pin || '--'}
                      </td>
                      <td className="px-4 py-3 text-[#1a2a4a]">
                        {item.label || item.name || '--'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {activeTab === 'supplier' 
                          ? (item.phone || item.email || '-') 
                          : activeTab === 'tax' 
                            ? `${(item.rate || 0) * 100}%` 
                            : (item.description || '-')}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          item.is_active === 0 || item.use_yn === 'N' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {item.is_active === 0 || item.use_yn === 'N' ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleEdit(item)}
                          className="text-[#1a2a4a] hover:text-[#0f1a33] text-xs px-2 py-1 rounded hover:bg-gray-100 transition mr-2"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.code || item.id)}
                          className={`text-xs px-2 py-1 rounded transition ${
                            (activeTab === 'payment' && ['01', '02', '03'].includes(item.code))
                              ? 'text-gray-400 cursor-not-allowed'
                              : 'text-red-600 hover:text-red-800 hover:bg-red-50'
                          }`}
                          disabled={activeTab === 'payment' && ['01', '02', '03'].includes(item.code)}
                          title={activeTab === 'payment' && ['01', '02', '03'].includes(item.code) ? 'Cannot delete default payment types' : ''}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-5 border-b sticky top-0 bg-white">
              <h2 className="text-lg font-semibold text-[#1a2a4a]">
                {editingItem ? `Edit ${getLabel()}` : `Add New ${getLabel()}`}
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              {activeTab === 'supplier' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">PIN *</label>
                    <input
                      type="text"
                      value={formData.pin}
                      onChange={(e) => setFormData({ ...formData, pin: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder="e.g., A123456789Z"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder="Supplier name"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder="e.g., +254 700 000000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder="e.g., supplier@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder="e.g., Nairobi, Kenya"
                    />
                  </div>
                </>
              ) : activeTab !== 'all' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Code *
                      {activeTab === 'payment' && <span className="text-xs text-gray-400 ml-1">(2 digits)</span>}
                      {activeTab === 'unit' && <span className="text-xs text-gray-400 ml-1">(2 uppercase letters)</span>}
                      {activeTab === 'class' && <span className="text-xs text-gray-400 ml-1">(8 digits)</span>}
                    </label>
                    <input
                      type="text"
                      value={formData.code}
                      onChange={(e) => {
                        let value = e.target.value.toUpperCase();
                        if (activeTab === 'payment' || activeTab === 'class') {
                          value = value.replace(/\D/g, '');
                        }
                        if (activeTab === 'class' && value.length > 8) {
                          value = value.slice(0, 8);
                        }
                        if (activeTab === 'payment' && value.length > 2) {
                          value = value.slice(0, 2);
                        }
                        if (activeTab === 'unit' && value.length > 2) {
                          value = value.slice(0, 2);
                        }
                        setFormData({ ...formData, code: value });
                      }}
                      disabled={editingItem}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent disabled:bg-gray-100"
                      placeholder={
                        activeTab === 'payment' ? '01' :
                        activeTab === 'unit' ? 'NT' :
                        activeTab === 'class' ? '50101010' :
                        'e.g., D'
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={formData.label}
                      onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                      placeholder={
                        activeTab === 'tax' ? 'Standard' :
                        activeTab === 'payment' ? 'Cash' :
                        activeTab === 'unit' ? 'Kilogram' :
                        activeTab === 'class' ? 'Furniture' :
                        'Enter name'
                      }
                    />
                  </div>
                  {activeTab === 'tax' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%)</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.rate * 100}
                        onChange={(e) => setFormData({ ...formData, rate: parseFloat(e.target.value) / 100 || 0 })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                        placeholder="e.g., 16"
                      />
                    </div>
                  )}
                  {(activeTab === 'class' || activeTab === 'unit' || activeTab === 'payment') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <input
                        type="text"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                        placeholder="Additional info"
                      />
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl sticky bottom-0">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                Cancel
              </button>
              {activeTab !== 'all' && (
                <button
                  onClick={handleSave}
                  className="px-5 py-2 text-sm bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg transition font-medium"
                >
                  {editingItem ? 'Update' : 'Add'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataManagement;