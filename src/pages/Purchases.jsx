import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getPurchases, savePurchase, getPurchasesFromVSCU, getItems, getSyncStatus, processSync, checkVSCUStatus } from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';

const Purchases = () => {
  const [purchases, setPurchases] = useState([]);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [purchasePendingCount, setPurchasePendingCount] = useState(0);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [fetchingFromVSCU, setFetchingFromVSCU] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState('');

  const [formData, setFormData] = useState({
    invoice_no: '',
    supplier_id: '',
    supplier_tin: '',
    supplier_name: '',
    supplier_phone: '',
    supplier_email: '',
    supplier_address: '',
    supplier_invoice_no: '',
    date: new Date().toISOString().split('T')[0],
    payment_method: '01',
    remark: '',
    items: [],
  });

  const [currentItem, setCurrentItem] = useState({
    itemCd: '',
    itemNm: '',
    qty: 1,
    prc: '',
    taxTyCd: 'B',
  });

  useEffect(() => {
    fetchPurchases();
    fetchItems();
    fetchSuppliers();
    fetchPurchaseSyncStatus();
    checkVSCU();
  }, []);

  const fetchPurchases = async () => {
    try {
      setLoading(true);
      const response = await getPurchases();
      setPurchases(response.data || []);
    } catch (error) {
      console.error('Failed to fetch purchases:', error);
      toast.error('Error loading purchases');
      setPurchases([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await getItems();
      setItems(response.data || []);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const fetchSuppliers = async () => {
    try {
      const response = await axiosInstance.get('/api/suppliers');
      setSuppliers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch suppliers:', error);
      setSuppliers([]);
    }
  };

  const fetchPurchaseSyncStatus = async () => {
    try {
      const response = await getSyncStatus();
      const byEndpoint = response.data?.byEndpoint || [];
      let count = 0;
      byEndpoint.forEach(item => {
        if (item.endpoint === '/trnsPurchase/savePurchases') {
          count = item.count;
        }
      });
      setPurchasePendingCount(count);
    } catch (error) {
      console.error('Failed to fetch purchase sync status:', error);
      setPurchasePendingCount(0);
    }
  };

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const fetchPurchasesFromVSCU = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setFetchingFromVSCU(true);
    try {
      const response = await getPurchasesFromVSCU(lastSyncDate || '20200101000000');

      if (response.data?.resultCd === '000') {
        const purchaseList = response.data?.data?.purchaseList || [];

        if (purchaseList.length > 0) {
          await axiosInstance.post('/api/purchases/bulk', purchaseList);
          await fetchPurchases();
          setLastSyncDate(new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14));
          toast.success(`Fetched ${purchaseList.length} purchases from KRA`);
        } else {
          toast.info('No purchases found in KRA');
        }
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to fetch purchases');
      }
    } catch (error) {
      console.error('Failed to fetch purchases from VSCU:', error);
      toast.error('Failed to fetch purchases from KRA');
    } finally {
      setFetchingFromVSCU(false);
    }
  };

  const handleSync = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please try again later.');
      return;
    }

    setSyncing(true);
    setSyncMessage('Syncing purchases...');

    try {
      const response = await processSync();

      if (response.data.success) {
        const { synced, failed } = response.data;

        if (synced > 0 && failed === 0) {
          setSyncMessage(`${synced} purchases synced`);
          toast.success(`Synced ${synced} purchases successfully`);
        } else if (synced > 0 && failed > 0) {
          setSyncMessage(`${synced} synced, ${failed} failed`);
          toast.warning(`Synced ${synced} purchases, ${failed} failed`);
        } else if (synced === 0 && failed > 0) {
          setSyncMessage(`${failed} purchases failed`);
          toast.error(`Sync failed: ${failed} purchases`);
        } else {
          setSyncMessage('No purchases to sync');
          toast.info('No pending purchases to sync');
        }
      } else {
        setSyncMessage('Sync issue');
        toast.warning('Sync completed with issues');
      }

      fetchPurchaseSyncStatus();
      checkVSCU();
      fetchPurchases();
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncMessage('Sync failed');
      toast.error('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const handleAddItem = () => {
    if (!currentItem.itemCd || currentItem.qty < 1 || !currentItem.prc || currentItem.prc === '') {
      toast.error('Please select item, quantity, and price');
      return;
    }
    const qty = Number(currentItem.qty);
    const prc = Number(currentItem.prc);
    const taxRate = currentItem.taxTyCd === 'B' ? 0.16 : 0;
    const splyAmt = qty * prc;
    const taxAmt = splyAmt * taxRate;
    const totAmt = splyAmt + taxAmt;
    const selectedItem = items.find(i => i.item_cd === currentItem.itemCd);

    setFormData({
      ...formData,
      items: [...formData.items, {
        itemSeq: formData.items.length + 1,
        itemCd: currentItem.itemCd,
        itemNm: currentItem.itemNm || selectedItem?.item_name || 'Unknown',
        itemClsCd: selectedItem?.item_cls_cd || '50101010',
        qty: qty,
        prc: prc,
        splyAmt: splyAmt,
        taxTyCd: currentItem.taxTyCd,
        taxAmt: taxAmt,
        totAmt: totAmt,
        taxblAmt: splyAmt,
      }]
    });

    setCurrentItem({ itemCd: '', itemNm: '', qty: 1, prc: 0, taxTyCd: 'B' });
  };

  const handleRemoveItem = (itemSeq) => {
    setFormData({
      ...formData,
      items: formData.items.filter(i => i.itemSeq !== itemSeq)
    });
  };

  const calculateTotals = () => {
    const items = formData.items;
    const totItemCnt = items.length;
    const totTaxblAmt = items.reduce((sum, i) => sum + (i.taxblAmt || 0), 0);
    const totTaxAmt = items.reduce((sum, i) => sum + (i.taxAmt || 0), 0);
    const totAmt = items.reduce((sum, i) => sum + (i.totAmt || 0), 0);
    return { totItemCnt, totTaxblAmt, totTaxAmt, totAmt };
  };

  const handleSupplierSelect = (supplierId) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    if (supplier) {
      setFormData({
        ...formData,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_tin: supplier.pin,
        supplier_phone: supplier.phone || '',
        supplier_email: supplier.email || '',
        supplier_address: supplier.address || '',
      });
    } else {
      setFormData({
        ...formData,
        supplier_id: '',
        supplier_name: '',
        supplier_tin: '',
        supplier_phone: '',
        supplier_email: '',
        supplier_address: '',
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.items.length === 0) {
      toast.error('Please add at least one item');
      return;
    }

    if (!formData.supplier_name) {
      toast.error('Please select or enter supplier name');
      return;
    }

    const totals = calculateTotals();

    const payload = {
      invoice_no: formData.invoice_no || `PUR-${Date.now().toString().slice(-6)}`,
      supplier_id: formData.supplier_id || null,
      supplier_tin: formData.supplier_tin || null,
      supplier_name: formData.supplier_name,
      supplier_phone: formData.supplier_phone || null,
      supplier_email: formData.supplier_email || null,
      supplier_address: formData.supplier_address || null,
      supplier_invoice_no: formData.supplier_invoice_no || null,
      subtotal: totals.totTaxblAmt,
      tax: totals.totTaxAmt,
      total: totals.totAmt,
      payment_method: formData.payment_method || '01',
      date: formData.date,
      remark: formData.remark || null,
      cashier: 'Admin',
      status: 'Completed',
      items: formData.items,
    };

    try {
      await savePurchase(payload);
      toast.success('Purchase saved successfully!');
      setShowForm(false);
      setFormData({
        invoice_no: '',
        supplier_id: '',
        supplier_tin: '',
        supplier_name: '',
        supplier_phone: '',
        supplier_email: '',
        supplier_address: '',
        supplier_invoice_no: '',
        date: new Date().toISOString().split('T')[0],
        payment_method: '01',
        remark: '',
        items: [],
      });
      fetchPurchases();
      fetchPurchaseSyncStatus();
    } catch (error) {
      console.error('Failed to save purchase:', error);
      toast.error('Failed to save purchase');
    }
  };

  const totals = calculateTotals();

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">Purchases</h1>
          <p className="text-gray-500 text-sm">Manage supplier invoices</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchPurchasesFromVSCU}
            disabled={fetchingFromVSCU || !vscuOnline}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              fetchingFromVSCU || !vscuOnline
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white'
            }`}
            title={vscuOnline ? 'Fetch purchases from KRA' : 'VSCU Offline'}
          >
            {fetchingFromVSCU ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            )}
            <span className="text-sm font-medium">
              {fetchingFromVSCU ? 'Fetching...' : 'Get from KRA'}
            </span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || purchasePendingCount === 0 || !vscuOnline}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              syncing || purchasePendingCount === 0 || !vscuOnline
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : vscuOnline
                  ? 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
                  : 'bg-yellow-500 hover:bg-yellow-600 text-white'
            }`}
          >
            {syncing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : syncMessage ? (
              <span className="text-xs">{syncMessage}</span>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            )}
            <span className="text-sm font-medium">
              {syncing ? 'Syncing...' : syncMessage || 'Send to KRA'}
            </span>
            {purchasePendingCount > 0 && !syncMessage && (
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {purchasePendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setShowForm(!showForm)}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              showForm ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
            }`}
          >
            {showForm ? 'Cancel' : '+ New Purchase'}
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-xs font-medium text-gray-600">VSCU: {vscuOnline ? 'Online' : 'Offline'}</span>
        </div>
        <div className="h-4 w-px bg-gray-200"></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {purchasePendingCount > 0 ? (
              <span className="text-yellow-600 font-medium">{purchasePendingCount} purchases pending sync</span>
            ) : (
              <span className="text-green-600">All purchases synced</span>
            )}
          </span>
        </div>
        {lastSyncDate && (
          <>
            <div className="h-4 w-px bg-gray-200"></div>
            <span className="text-xs text-gray-400">Last sync: {lastSyncDate}</span>
          </>
        )}
        {!vscuOnline && purchasePendingCount > 0 && (
          <span className="text-xs text-yellow-600">(Auto-sync when online)</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Purchases</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{purchases.length}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Spend</p>
          <p className="text-xl font-bold text-[#1a2a4a]">
            KES {purchases.reduce((sum, p) => sum + (p.total || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Input VAT</p>
          <p className="text-xl font-bold text-[#1a2a4a]">
            KES {purchases.reduce((sum, p) => sum + (p.tax || 0), 0).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Suppliers</p>
          <p className="text-xl font-bold text-[#1a2a4a]">
            {new Set(purchases.map(p => p.supplier_name)).size}
          </p>
        </div>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">New Purchase Invoice</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No</label>
                <input
                  type="text"
                  value={formData.invoice_no}
                  onChange={(e) => setFormData({ ...formData, invoice_no: e.target.value })}
                  placeholder="e.g., PUR-001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier *</label>
                <div className="flex gap-2">
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => handleSupplierSelect(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  >
                    <option value="">Select a supplier...</option>
                    {suppliers.filter(s => s.is_active !== 0).map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name} ({supplier.pin})
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData({
                        ...formData,
                        supplier_id: '',
                        supplier_name: '',
                        supplier_tin: '',
                        supplier_phone: '',
                        supplier_email: '',
                        supplier_address: '',
                      });
                    }}
                    className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-lg transition"
                    title="Clear supplier"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Name</label>
                <input
                  type="text"
                  value={formData.supplier_name}
                  onChange={(e) => setFormData({ ...formData, supplier_name: e.target.value })}
                  placeholder="Supplier name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier PIN</label>
                <input
                  type="text"
                  value={formData.supplier_tin}
                  onChange={(e) => setFormData({ ...formData, supplier_tin: e.target.value })}
                  placeholder="e.g., A123456789Z"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Phone</label>
                <input
                  type="text"
                  value={formData.supplier_phone}
                  onChange={(e) => setFormData({ ...formData, supplier_phone: e.target.value })}
                  placeholder="e.g., +254 700 000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Invoice #</label>
                <input
                  type="text"
                  value={formData.supplier_invoice_no}
                  onChange={(e) => setFormData({ ...formData, supplier_invoice_no: e.target.value })}
                  placeholder="Supplier invoice #"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment</label>
                <select
                  value={formData.payment_method}
                  onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="01">Cash</option>
                  <option value="02">Card</option>
                  <option value="03">Mobile Money</option>
                </select>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-[#1a2a4a] mb-3">Add Items</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Item</label>
                  <select
                    value={currentItem.itemCd}
                    onChange={(e) => {
                      const selected = items.find(i => i.item_cd === e.target.value);
                      setCurrentItem({
                        ...currentItem,
                        itemCd: e.target.value,
                        itemNm: selected?.item_name || '',
                        taxTyCd: selected?.tax_type || 'B',
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  >
                    <option value="">Select item</option>
                    {items.map((item) => (
                      <option key={item.item_cd} value={item.item_cd}>
                        {item.item_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Qty</label>
                  <input
                    type="number"
                    min="1"
                    value={currentItem.qty}
                    onChange={(e) => setCurrentItem({ ...currentItem, qty: Number(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Price</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={currentItem.prc}
                    onChange={(e) => setCurrentItem({ ...currentItem, prc: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tax</label>
                  <select
                    value={currentItem.taxTyCd}
                    onChange={(e) => setCurrentItem({ ...currentItem, taxTyCd: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  >
                    <option value="A">Exempt</option>
                    <option value="B">Standard (16%)</option>
                    <option value="C">Zero Rated</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg text-sm transition"
                  >
                    Add Item
                  </button>
                </div>
              </div>
            </div>

            {formData.items.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500 border-b">
                      <th className="pb-2">#</th>
                      <th className="pb-2">Item</th>
                      <th className="pb-2">Qty</th>
                      <th className="pb-2">Price</th>
                      <th className="pb-2">Tax</th>
                      <th className="pb-2">Tax Amt</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {formData.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-50">
                        <td className="py-2 text-gray-400">{item.itemSeq}</td>
                        <td className="py-2 text-[#1a2a4a]">{item.itemNm}</td>
                        <td className="py-2">{item.qty}</td>
                        <td className="py-2">KES {item.prc.toLocaleString()}</td>
                        <td className="py-2">
                          <span className="px-2 py-1 bg-gray-100 rounded-full text-xs">{item.taxTyCd}</span>
                        </td>
                        <td className="py-2">KES {item.taxAmt.toLocaleString()}</td>
                        <td className="py-2 text-right font-bold text-[#1a2a4a]">
                          KES {item.totAmt.toLocaleString()}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.itemSeq)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="font-bold border-t-2">
                      <td colSpan="4" className="py-2 text-right">Subtotal:</td>
                      <td colSpan="2" className="py-2 text-right">KES {totals.totTaxblAmt.toLocaleString()}</td>
                      <td className="py-2 text-right">KES {totals.totTaxAmt.toLocaleString()}</td>
                      <td></td>
                    </tr>
                    <tr className="font-bold text-[#f47b20]">
                      <td colSpan="6" className="py-2 text-right">Total:</td>
                      <td className="py-2 text-right">KES {totals.totAmt.toLocaleString()}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex gap-3 mt-4">
              <button type="submit" className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-6 py-2 rounded-lg transition">
                Save Purchase
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

      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search by supplier..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent bg-gray-50"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <button
          onClick={fetchPurchases}
          disabled={loading}
          className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
          </svg>
          Refresh
        </button>
      </div>

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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Supplier</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Items</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">VAT</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody>
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-400">
                      No purchase records found
                    </td>
                  </tr>
                ) : (
                  purchases
                    .filter(p => p.supplier_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           p.invoice_no?.toString().includes(searchTerm))
                    .map((p) => (
                      <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">{p.invoice_no || p.id}</td>
                        <td className="px-4 py-3 font-medium text-[#1a2a4a]">{p.supplier_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-right">{p.items?.length || 0}</td>
                        <td className="px-4 py-3 text-right text-[#f47b20]">
                          KES {(p.tax || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#1a2a4a]">
                          KES {(p.total || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-gray-500">{p.date || '-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            p.synced === 1 ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {p.synced === 1 ? 'Synced' : 'Pending'}
                          </span>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Purchases;