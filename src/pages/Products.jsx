import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  getStock,
  saveStockMovement,
  getSyncStatus,
  checkVSCUStatus,
  syncStockToVSCU,
  saveStockMaster,
  getItems,
  saveItem,
} from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';
import AddItemForm from '../components/items/AddItemForm';

const PRODUCT_CATEGORIES = {
  detergent: { name: 'Detergents', color: 'bg-blue-50 text-blue-700' },
  freshener: { name: 'Air Fresheners', color: 'bg-purple-50 text-purple-700' },
  accessories: { name: 'Accessories', color: 'bg-amber-50 text-amber-700' },
  polish: { name: 'Polishes & Wax', color: 'bg-cyan-50 text-cyan-700' },
  consumable: { name: 'Consumables', color: 'bg-green-50 text-green-700' },
  other: { name: 'Other', color: 'bg-slate-50 text-slate-700' },
};

const Products = () => {
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [lastSyncDate, setLastSyncDate] = useState('');
  const [movementData, setMovementData] = useState({
    itemCd: '',
    itemName: '',
    qty: '',
    type: 'IN',
    reason: '',
    reference: '',
  });
  const [stats, setStats] = useState({
    totalItems: 0,
    totalStock: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [stockPendingCount, setStockPendingCount] = useState(0);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [submittingMovement, setSubmittingMovement] = useState(false);

  useEffect(() => {
    fetchStock();
    fetchStockSyncStatus();
    checkVSCU();
    const i = setInterval(checkVSCU, 30000);
    return () => clearInterval(i);
  }, []);

  const fetchStock = async () => {
  try {
    setLoading(true);
    const response = await getStock();
    const products = (response.data || []).filter(
      (i) => (i.item_type || '').toLowerCase() === 'product' || i.item_ty_cd === '1'
    );
    setStockItems(products);
    calculateStats(products);
  } catch (error) {
    console.error('Failed to fetch products:', error);
    toast.error('Error loading products');
    setStockItems([]);
  } finally {
    setLoading(false);
  }
};

  const fetchStockSyncStatus = async () => {
    try {
      const response = await getSyncStatus();
      const byEndpoint = response.data?.byEndpoint || [];
      let count = 0;
      byEndpoint.forEach((item) => {
        if (item.endpoint === '/stock/saveStockItems') count = item.count;
      });
      setStockPendingCount(count);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
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

  const calculateStats = (data) => {
    const totalItems = data.length;
    const totalStock = data.reduce((sum, item) => sum + (item.stock || 0), 0);
    const lowStock = data.filter(
      (item) => item.stock <= (item.sfty_qty || 5) && item.stock > 0
    ).length;
    const outOfStock = data.filter((item) => item.stock === 0).length;
    setStats({ totalItems, totalStock, lowStock, outOfStock });
  };

  const handleAddProduct = async (newProduct) => {
    if (!newProduct.itemCd || !newProduct.itemNm) {
      toast.error('Product code and name are required');
      return;
    }
    const exists = stockItems.find(
      (i) => (i.item_cd || i.itemCd) === newProduct.itemCd
    );
    if (exists) {
      toast.error(`Product code "${newProduct.itemCd}" already exists`);
      return;
    }

    setSavingProduct(true);
    try {
      const response = await saveItem(newProduct);
      const saved = response.data || newProduct;
      const name = saved.itemNm || saved.item_name || saved.itemCd;

      setShowAddForm(false);
      setLastSyncDate(new Date().toLocaleString());
      await fetchStock();

      if (vscuOnline) {
        toast.success(`"${name}" added — will sync to KRA on next stock push`);
      } else {
        toast.info(`"${name}" added locally. Sync when VSCU is online.`);
      }
    } catch (error) {
      console.error('Failed to add product:', error);
      toast.error('Error saving product');
    } finally {
      setSavingProduct(false);
    }
  };

  const handleSync = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please try again later.');
      return;
    }

    setSyncing(true);
    setSyncMessage('Syncing products...');

    try {
      const response = await syncStockToVSCU();

      if (response.data.success) {
        if (response.data.synced > 0 && response.data.failed === 0) {
          setSyncMessage(`${response.data.synced} synced`);
          toast.success(`Products synced: ${response.data.synced}`);
        } else if (response.data.synced > 0 && response.data.failed > 0) {
          setSyncMessage(`${response.data.synced} synced, ${response.data.failed} failed`);
          toast.warning(`${response.data.synced} synced, ${response.data.failed} failed`);
        } else if (response.data.failed > 0) {
          setSyncMessage(`${response.data.failed} failed`);
          toast.error(`Sync failed: ${response.data.failed} items`);
        } else {
          setSyncMessage('All synced');
          toast.info('All products already synced');
        }
      } else {
        setSyncMessage('Sync issue');
        toast.warning(response.data.message || 'Sync completed with issues');
      }

      fetchStockSyncStatus();
      checkVSCU();
      fetchStock();
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncMessage('Sync failed');
      toast.error('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const handleSaveStockMaster = async (itemCd, rsdQty) => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Cannot save stock master.');
      return;
    }
    try {
      const response = await saveStockMaster(itemCd, rsdQty);
      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success(`Stock master saved for ${itemCd}`);
        await fetchStock();
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to save stock master');
      }
    } catch (error) {
      console.error('Save stock master failed:', error);
      toast.error('Failed to save stock master');
    }
  };

  const handleMovementSubmit = async () => {
    if (!movementData.itemCd || !movementData.qty || movementData.qty < 1) {
      toast.error('Please select an item and enter quantity');
      return;
    }

    const selectedItem = stockItems.find((item) => item.item_cd === movementData.itemCd);
    if (!selectedItem) {
      toast.error('Item not found');
      return;
    }

    setSubmittingMovement(true);
    try {
      const payload = {
        itemCd: movementData.itemCd,
        itemName: selectedItem.item_name,
        itemClsCd: selectedItem.item_cls_cd || '5059690809',
        price: selectedItem.price || 0,
        taxTyCd: selectedItem.tax_type || 'B',
        qty: Number(movementData.qty),
        type: movementData.type,
        reason: movementData.reason,
        reference: movementData.reference,
        cashier: 'Admin',
      };

      const response = await saveStockMovement(payload);

      if (response.data?.success) {
        toast.success(`Stock ${movementData.type === 'IN' ? 'added' : 'removed'} successfully!`);
        setShowMovementForm(false);
        setMovementData({ itemCd: '', itemName: '', qty: '', type: 'IN', reason: '', reference: '' });
        fetchStock();
        fetchStockSyncStatus();
      } else {
        toast.error(response.data?.error || 'Failed to update stock');
      }
    } catch (error) {
      console.error('Movement failed:', error);
      toast.error(error.response?.data?.error || 'Failed to update stock');
    } finally {
      setSubmittingMovement(false);
    }
  };

  const getStockStatus = (stock, minStock) => {
    if (stock === 0) return { label: 'Out of Stock', color: 'bg-red-100 text-red-700' };
    if (stock <= minStock) return { label: 'Low Stock', color: 'bg-yellow-100 text-yellow-700' };
    return { label: 'In Stock', color: 'bg-green-100 text-green-700' };
  };

  const getCategoryBadge = (cat) => {
    const c = PRODUCT_CATEGORIES[cat] || PRODUCT_CATEGORIES.other;
    return c;
  };

  const filteredItems = stockItems.filter((item) => {
    const matchesSearch =
      item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.item_cd?.toLowerCase().includes(searchTerm.toLowerCase());
    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'low')
      return matchesSearch && item.stock <= (item.sfty_qty || 5) && item.stock > 0;
    if (filterStatus === 'out') return matchesSearch && item.stock === 0;
    return matchesSearch;
  });

  return (
    <div className="p-6 bg-[#f8fafc] min-h-screen">
      <ToastContainer position="top-right" autoClose={3000} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a] tracking-tight">Products</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Retail car care items and stock levels
          </p>
        </div>
        <div className="flex gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              showAddForm
                ? 'bg-slate-200 text-slate-700'
                : 'bg-[#f47b20] hover:bg-[#e06d1a] text-white shadow-sm hover:shadow-md'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={showAddForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
            </svg>
            <span>{showAddForm ? 'Cancel' : 'Add Product'}</span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || stockPendingCount === 0 || !vscuOnline}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 ${
              syncing || stockPendingCount === 0 || !vscuOnline
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm hover:shadow-md'
            }`}
            title={vscuOnline ? 'Sync stock to KRA' : 'VSCU Offline'}
          >
            {syncing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            )}
            <span>{syncing ? 'Syncing...' : syncMessage || 'Sync to KRA'}</span>
            {stockPendingCount > 0 && !syncMessage && (
              <span className="ml-1 bg-white/20 text-white px-2 py-0.5 rounded-full text-xs">
                {stockPendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setMovementData({ itemCd: '', itemName: '', qty: '', type: 'IN', reason: '', reference: '' });
              setShowMovementForm(true);
            }}
            className="bg-[#1a2a4a] hover:bg-[#253b66] text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 flex items-center gap-2 shadow-sm hover:shadow-md"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            New Movement
          </button>
        </div>
      </div>

      {/* Add Product Form */}
      {showAddForm && (
        <div className="mb-6">
          <AddItemForm
            mode="product"
            onSave={handleAddProduct}
            onCancel={() => setShowAddForm(false)}
            isSaving={savingProduct}
          />
        </div>
      )}

      {/* Status Bar */}
      <div className="flex items-center gap-4 mb-6 bg-white px-5 py-3 rounded-xl shadow-sm border border-slate-200/60">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${vscuOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <span className="text-sm font-medium text-slate-600">
            VSCU: <span className={vscuOnline ? 'text-emerald-600' : 'text-rose-600'}>
              {vscuOnline ? 'Online' : 'Offline'}
            </span>
          </span>
        </div>
        <div className="h-5 w-px bg-slate-200"></div>
        <div className="text-sm text-slate-600">
          {stockPendingCount > 0 ? (
            <span className="text-amber-600 font-medium">{stockPendingCount} products pending sync</span>
          ) : (
            <span className="text-emerald-600 font-medium">All products synced</span>
          )}
        </div>
        {lastSyncDate && (
          <>
            <div className="h-5 w-px bg-slate-200"></div>
            <span className="text-xs text-slate-400">Last updated: {lastSyncDate}</span>
          </>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/60">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Products</p>
          <p className="text-2xl font-bold text-[#1a2a4a] mt-1">{stats.totalItems}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/60">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Stock</p>
          <p className="text-2xl font-bold text-[#1a2a4a] mt-1">{stats.totalStock}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/60">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Low Stock</p>
          <p className="text-2xl font-bold text-amber-500 mt-1">{stats.lowStock}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200/60">
          <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">Out of Stock</p>
          <p className="text-2xl font-bold text-rose-500 mt-1">{stats.outOfStock}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl shadow-sm border border-slate-200/60">
        <div className="flex-1 min-w-50 relative">
          <input
            type="text"
            placeholder="Search products by name or code..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#f47b20]/60 focus:border-[#f47b20] transition outline-none"
          />
          <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#f47b20]/60 focus:border-[#f47b20] outline-none"
        >
          <option value="all">All Products</option>
          <option value="low">Low Stock</option>
          <option value="out">Out of Stock</option>
        </select>

        <button
          onClick={fetchStock}
          disabled={loading}
          className="bg-[#1a2a4a] hover:bg-[#253b66] text-white px-4 py-2.5 rounded-xl text-sm font-medium transition flex items-center gap-2 disabled:opacity-50"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
          </svg>
          Refresh
        </button>

        {filteredItems.length !== stockItems.length && (
          <span className="text-sm text-slate-400 font-medium">
            {filteredItems.length} of {stockItems.length}
          </span>
        )}
      </div>

      {/* Movement Modal */}
      {showMovementForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-slate-100">
              <h2 className="text-xl font-semibold text-[#1a2a4a]">Stock Movement</h2>
              <button
                onClick={() => setShowMovementForm(false)}
                className="text-slate-400 hover:text-slate-600 transition text-2xl leading-none"
              >
                ×
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Product</label>
                <select
                  value={movementData.itemCd}
                  onChange={(e) => {
                    const selected = stockItems.find((item) => item.item_cd === e.target.value);
                    setMovementData({
                      ...movementData,
                      itemCd: e.target.value,
                      itemName: selected?.item_name || '',
                    });
                  }}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#f47b20]/60 focus:border-[#f47b20] outline-none"
                >
                  <option value="">Select a product...</option>
                  {stockItems.map((item) => (
                    <option key={item.item_cd} value={item.item_cd}>
                      {item.item_name} ({item.item_cd}) — {item.stock} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Movement Type</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMovementData({ ...movementData, type: 'IN' })}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                      movementData.type === 'IN'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    + Stock IN
                  </button>
                  <button
                    onClick={() => setMovementData({ ...movementData, type: 'OUT' })}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition ${
                      movementData.type === 'OUT'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    − Stock OUT
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Quantity</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Enter quantity"
                  value={movementData.qty}
                  onChange={(e) => setMovementData({ ...movementData, qty: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#f47b20]/60 focus:border-[#f47b20] outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Reason / Reference</label>
                <input
                  type="text"
                  value={movementData.reason}
                  onChange={(e) => setMovementData({ ...movementData, reason: e.target.value })}
                  placeholder="e.g. Purchase order #123, Damage, etc."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-[#f47b20]/60 focus:border-[#f47b20] outline-none"
                />
              </div>

              {movementData.itemCd && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/60">
                  <p className="text-sm text-slate-600">
                    Current Stock:{' '}
                    <span className="font-bold text-slate-800">
                      {stockItems.find((i) => i.item_cd === movementData.itemCd)?.stock || 0}
                    </span>
                  </p>
                  <p className="text-sm text-slate-600 mt-1">
                    After {movementData.type === 'IN' ? 'Addition' : 'Removal'}:{' '}
                    <span className="font-bold text-slate-800">
                      {(stockItems.find((i) => i.item_cd === movementData.itemCd)?.stock || 0) +
                        (movementData.type === 'IN'
                          ? Number(movementData.qty || 0)
                          : -Number(movementData.qty || 0))}
                    </span>
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3 p-6 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
              <button
                onClick={() => setShowMovementForm(false)}
                className="flex-1 px-5 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleMovementSubmit}
                disabled={!movementData.itemCd || !movementData.qty || movementData.qty < 1 || submittingMovement}
                className="flex-1 px-5 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-xl text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md flex items-center justify-center gap-2"
              >
                {submittingMovement ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                    </svg>
                    Processing...
                  </>
                ) : (
                  'Confirm Movement'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Products Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="h-10 w-10 border-4 border-[#f47b20]/30 border-t-[#f47b20] rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200/60">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Code</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Price</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-5 py-12 text-center text-slate-400">
                      No products found. Click "Add Product" to create your first retail item.
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const status = getStockStatus(item.stock, item.sfty_qty || 5);
                    const cat = getCategoryBadge(item.category);
                    return (
                      <tr key={item.item_cd} className="border-b border-slate-50 hover:bg-slate-50/60 transition">
                        <td className="px-5 py-3.5">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cat.color}`}>
                            {cat.name}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-slate-500">{item.item_cd}</td>
                        <td className="px-5 py-3.5 font-medium text-slate-800">{item.item_name}</td>
                        <td className="px-5 py-3.5 text-right text-[#f47b20] font-semibold">
                          KES {item.price?.toLocaleString() || 0}
                        </td>
                        <td className="px-5 py-3.5 text-right font-bold text-[#1a2a4a]">{item.stock}</td>
                        <td className="px-5 py-3.5">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => {
                                setMovementData({
                                  itemCd: item.item_cd,
                                  itemName: item.item_name,
                                  qty: '',
                                  type: 'IN',
                                  reason: '',
                                  reference: '',
                                });
                                setShowMovementForm(true);
                              }}
                              className="text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition font-medium"
                              title="Add Stock"
                            >
                              + IN
                            </button>
                            <button
                              onClick={() => {
                                setMovementData({
                                  itemCd: item.item_cd,
                                  itemName: item.item_name,
                                  qty: '',
                                  type: 'OUT',
                                  reason: '',
                                  reference: '',
                                });
                                setShowMovementForm(true);
                              }}
                              className="text-xs bg-rose-100 text-rose-700 hover:bg-rose-200 px-3 py-1.5 rounded-lg transition font-medium"
                              title="Remove Stock"
                            >
                              - OUT
                            </button>
                            <button
                              onClick={() => handleSaveStockMaster(item.item_cd, item.stock)}
                              className="text-xs bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition font-medium"
                              title="Save Stock Master"
                            >
                              Master
                            </button>
                          </div>
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

export default Products;