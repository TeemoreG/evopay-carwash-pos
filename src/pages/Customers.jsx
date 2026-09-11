// src/pages/Customers.jsx
import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getCustomerByPin, checkVSCUStatus } from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [customerPendingCount, setCustomerPendingCount] = useState(0);
  const [savingToVSCU, setSavingToVSCU] = useState(false);
  const [formData, setFormData] = useState({
    pin: '',
    name: '',
    phone: '',
    email: '',
    address: '',
    tax_type: 'B',
    is_active: 1
  });

  useEffect(() => {
    fetchCustomers();
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

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get('/api/customers');
      setCustomers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch customers:', error);
      toast.error('Error loading customers');
    } finally {
      setLoading(false);
    }
  };

  const verifyCustomerPIN = async (pin) => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Cannot verify PIN.');
      return;
    }

    if (!pin || pin.length < 9) {
      toast.warning('Enter a valid PIN (9-16 characters)');
      return;
    }

    setVerifyingPin(true);
    try {
      const response = await getCustomerByPin(pin);
      
      if (response.data && response.data.custNm) {
        setFormData({
          ...formData,
          name: response.data.custNm || formData.name,
          phone: response.data.custMblNo || formData.phone,
          email: response.data.custEmail || formData.email,
          address: response.data.adrs || formData.address
        });
        toast.success('✅ Customer found in KRA');
      } else {
        toast.info('Customer not found in KRA. You can still add them manually.');
      }
    } catch (error) {
      console.error('PIN verification failed:', error);
      toast.info('Could not verify PIN. You can still add manually.');
    } finally {
      setVerifyingPin(false);
    }
  };

  // ============================================
  // SAVE CUSTOMER BRANCH — Sends to VSCU
  // ============================================
  const saveCustomerBranchToVSCU = async (customerData) => {
    if (!vscuOnline) {
      toast.warning('VSCU offline — Customer saved locally only.');
      return false;
    }

    try {
      setSavingToVSCU(true);
      const payload = {
        tin: import.meta.env.VITE_VSCU_TIN || 'P600004311A',
        bhfId: import.meta.env.VITE_VSCU_BHF_ID || '00',
        custNo: customerData.pin || 'CUST-' + Date.now().toString().slice(-6),
        custTin: customerData.pin,
        custNm: customerData.name,
        adrs: customerData.address || null,
        telNo: customerData.phone || null,
        email: customerData.email || null,
        faxNo: null,
        useYn: customerData.is_active === 0 ? 'N' : 'Y',
        remark: null,
        regrNm: 'Admin',
        regrId: 'Admin',
        modrNm: 'Admin',
        modrId: 'Admin'
      };

      const response = await axiosInstance.post('/api/branches/saveBrancheCustomers', payload);
      
      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success('✅ Customer synced to VSCU branch');
        return true;
      } else {
        toast.warning(`VSCU: ${response.data?.resultMsg || 'Unknown error'}`);
        return false;
      }
    } catch (error) {
      console.error('Save customer branch error:', error);
      toast.error('Failed to sync to VSCU — saved locally');
      return false;
    } finally {
      setSavingToVSCU(false);
    }
  };

  const handleAdd = () => {
    setEditingCustomer(null);
    setFormData({ pin: '', name: '', phone: '', email: '', address: '', tax_type: 'B', is_active: 1 });
    setShowForm(true);
  };

  const handleEdit = (customer) => {
    setEditingCustomer(customer);
    setFormData({
      pin: customer.pin || '',
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      tax_type: customer.tax_type || 'B',
      is_active: customer.is_active !== undefined ? customer.is_active : 1
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.pin || !formData.name) {
      toast.error('PIN and Name are required');
      return;
    }

    if (!/^[A-Z0-9]{9,16}$/.test(formData.pin)) {
      toast.error('Invalid PIN format (9-16 characters, letters and numbers)');
      return;
    }

    try {
      // 1. Save to local DB
      await axiosInstance.post('/api/customers', formData);
      toast.success(editingCustomer ? 'Customer updated successfully' : 'Customer added successfully');

      // 2. Sync to VSCU Branch
      await saveCustomerBranchToVSCU(formData);

      setShowForm(false);
      fetchCustomers();
    } catch (error) {
      console.error('Failed to save customer:', error);
      toast.error('Error saving customer');
    }
  };

  const handleDelete = async (pin) => {
    if (!window.confirm('Deactivate this customer?')) return;
    try {
      await axiosInstance.delete(`/api/customers/${pin}`);
      fetchCustomers();
      toast.success('Customer deactivated');
    } catch (error) {
      console.error('Failed to delete customer:', error);
      toast.error('Error deleting customer');
    }
  };

  const getTaxBadge = (type) => {
    const types = {
      'A': { label: 'Exempt', color: 'bg-gray-100 text-gray-700' },
      'B': { label: 'Standard (16%)', color: 'bg-blue-100 text-blue-700' },
      'C': { label: 'Zero Rated', color: 'bg-green-100 text-green-700' }
    };
    return types[type] || types.B;
  };

  const getStatusBadge = (isActive) => {
    if (isActive === 0) {
      return { label: 'Inactive', color: 'bg-red-100 text-red-700' };
    }
    return { label: 'Active', color: 'bg-green-100 text-green-700' };
  };

  const filteredCustomers = customers.filter(c => {
    const search = searchTerm.toLowerCase();
    return c.name?.toLowerCase().includes(search) ||
           c.pin?.toLowerCase().includes(search) ||
           c.phone?.toLowerCase().includes(search);
  });

  const stats = {
    total: customers.filter(c => c.is_active !== 0).length,
    b2b: customers.filter(c => c.tax_type === 'B' && c.is_active !== 0).length,
    b2c: customers.filter(c => c.tax_type === 'C' && c.is_active !== 0).length,
  };

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">Customers</h1>
          <p className="text-gray-500 text-sm">Manage B2B and B2C customers</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleAdd}
            className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Customer
          </button>
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* VSCU Status Bar */}
      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
        <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className="text-xs font-medium text-gray-600">
          VSCU: {vscuOnline ? 'Online' : 'Offline'}
        </span>
        <div className="h-4 w-px bg-gray-200"></div>
        <span className="text-xs text-gray-500">
          {stats.total} active customers
        </span>
        {!vscuOnline && (
          <span className="text-xs text-yellow-600 ml-auto">(PIN verification unavailable)</span>
        )}
        {savingToVSCU && (
          <span className="text-xs text-blue-600 ml-auto animate-pulse">Syncing to VSCU...</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Customers</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">B2B (Standard)</p>
          <p className="text-xl font-bold text-blue-600">{stats.b2b}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">B2C (Zero Rated)</p>
          <p className="text-xl font-bold text-green-600">{stats.b2c}</p>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search by name, PIN, or phone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent bg-gray-50"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <span className="text-xs text-gray-400">
          {filteredCustomers.length} of {customers.length} customers
        </span>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">
            {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">PIN *</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value.toUpperCase() })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                    placeholder="e.g., A123456789Z"
                    required
                    disabled={editingCustomer}
                  />
                  {!editingCustomer && vscuOnline && (
                    <button
                      type="button"
                      onClick={() => verifyCustomerPIN(formData.pin)}
                      disabled={verifyingPin || !formData.pin}
                      className="px-4 py-2 bg-[#1a2a4a] hover:bg-[#0f1a33] text-white text-sm rounded-lg transition disabled:opacity-50 whitespace-nowrap"
                    >
                      {verifyingPin ? 'Verifying...' : 'Verify PIN'}
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-1">KRA PIN for B2B customers</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="Full name or business name"
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
                  placeholder="e.g., customer@example.com"
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
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
                <select
                  value={formData.tax_type}
                  onChange={(e) => setFormData({ ...formData, tax_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="A">A - Exempt (0%)</option>
                  <option value="B">B - Standard (16%)</option>
                  <option value="C">C - Zero Rated (0%)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value={1}>Active</option>
                  <option value={0}>Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                disabled={savingToVSCU}
                className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
              >
                {savingToVSCU ? 'Syncing...' : (editingCustomer ? 'Update' : 'Save')}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customers Table */}
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">PIN</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tax</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                      No customers found. Click "Add Customer" to create one.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => {
                    const taxBadge = getTaxBadge(customer.tax_type);
                    const statusBadge = getStatusBadge(customer.is_active);
                    return (
                      <tr key={customer.pin} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono text-xs font-bold text-[#1a2a4a]">{customer.pin}</td>
                        <td className="px-4 py-3 text-[#1a2a4a] font-medium">{customer.name}</td>
                        <td className="px-4 py-3 text-gray-600">{customer.phone || '-'}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${taxBadge.color}`}>
                            {taxBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusBadge.color}`}>
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => handleEdit(customer)}
                            className="text-[#1a2a4a] hover:text-[#0f1a33] text-xs mr-3"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(customer.pin)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;