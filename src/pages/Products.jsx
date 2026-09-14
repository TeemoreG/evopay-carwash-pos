import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import {
  getStock, saveStockMovement, getSyncStatus, checkVSCUStatus,
  syncStockToVSCU, saveStockMaster, saveItem,
} from '../api/vscuApi';
import AddItemForm from '../components/items/AddItemForm';

const PRODUCT_CATEGORIES = {
  detergent: { name: 'Detergents', color: 'bg-blue-100 text-blue-700' },
  freshener: { name: 'Air Fresheners', color: 'bg-purple-100 text-purple-700' },
  accessories: { name: 'Accessories', color: 'bg-amber-100 text-amber-700' },
  polish: { name: 'Polishes & Wax', color: 'bg-cyan-100 text-cyan-700' },
  consumable: { name: 'Consumables', color: 'bg-green-100 text-green-700' },
  other: { name: 'Other', color: 'bg-slate-100 text-slate-700' },
};

const Products = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showMovementForm, setShowMovementForm] = useState(false);
  const [submittingMovement, setSubmittingMovement] = useState(false);
  const [movementData, setMovementData] = useState({
    itemCd: '', itemName: '', qty: '', type: 'IN', reason: '',
  });
  const [vscuOnline, setVscuOnline] = useState(false);
  const [stockPendingCount, setStockPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchSyncStatus();
    checkVSCU();
    const i = setInterval(checkVSCU, 30000);
    return () => clearInterval(i);
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const res = await getStock();
      const raw = res.data || [];
      const products = raw.filter(Boolean).filter(
        (i) => (i.item_type || '').toLowerCase() === 'product' || String(i.item_ty_cd) === '1'
      );
      setItems(products);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load products');
      setItems([]);
    } finally { setLoading(false); }
  };

  const fetchSyncStatus = async () => {
    try {
      const r = await getSyncStatus();
      const byEndpoint = r.data?.byEndpoint || [];
      let c = 0;
      byEndpoint.forEach((x) => { if (x.endpoint === '/stock/saveStockItems') c = x.count; });
      setStockPendingCount(c);
    } catch {}
  };

  const checkVSCU = async () => {
    try {
      const r = await checkVSCUStatus();
      setVscuOnline(r.data?.online || false);
    } catch { setVscuOnline(false); }
  };

  const stats = useMemo(() => {
    const totalItems = items.length;
    const totalStock = items.reduce((s, i) => s + (i.stock || 0), 0);
    const lowStock = items.filter((i) => (i.stock || 0) <= (i.sfty_qty || 5) && (i.stock || 0) > 0).length;
    const outOfStock = items.filter((i) => (i.stock || 0) === 0).length;
    const stockValue = items.reduce((s, i) => s + (i.price || 0) * (i.stock || 0), 0);
    return { totalItems, totalStock, lowStock, outOfStock, stockValue };
  }, [items]);

  const filtered = useMemo(() => {
    return items
      .filter((i) => categoryFilter === 'all' || (i.category || 'other') === categoryFilter)
      .filter((i) => {
        if (filterStatus === 'low') return (i.stock || 0) <= (i.sfty_qty || 5) && (i.stock || 0) > 0;
        if (filterStatus === 'out') return (i.stock || 0) === 0;
        return true;
      })
      .filter((i) => {
        if (!searchTerm.trim()) return true;
        const q = searchTerm.toLowerCase();
        return (
          (i.item_name || '').toLowerCase().includes(q) ||
          (i.item_cd || '').toLowerCase().includes(q)
        );
      });
  }, [items, categoryFilter, filterStatus, searchTerm]);

  const handleAddProduct = async (newProduct) => {
    if (!newProduct.itemCd || !newProduct.itemNm) {
      toast.error('Product code and name are required');
      return;
    }
    if (items.find((i) => (i.item_cd || i.itemCd) === newProduct.itemCd)) {
      toast.error(`Code "${newProduct.itemCd}" already exists`);
      return;
    }
    setSavingProduct(true);
    try {
      await saveItem(newProduct);
      setShowAddForm(false);
      await fetchProducts();
      toast.success(`"${newProduct.itemNm}" added`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save product');
    } finally { setSavingProduct(false); }
  };

  const handleEditProduct = async (updatedProduct) => {
    if (!updatedProduct.itemCd || !updatedProduct.itemNm) {
      toast.error('Code and name required');
      return;
    }
    setSavingProduct(true);
    try {
      // Force product type — this page only manages products
      await saveItem({
        ...updatedProduct,
        item_type: 'product',
        itemTyCd: '1',
      });
      setEditingItem(null);
      await fetchProducts();
      toast.success(`"${updatedProduct.itemNm}" updated`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to update product');
    } finally { setSavingProduct(false); }
  };

  const openMovement = (item, type = 'IN') => {
    setMovementData({
      itemCd: item.item_cd,
      itemName: item.item_name,
      qty: '',
      type,
      reason: '',
    });
    setShowMovementForm(true);
  };

  const handleMovementSubmit = async () => {
    if (!movementData.itemCd || !movementData.qty || movementData.qty < 1) {
      toast.error('Select product and enter quantity');
      return;
    }
    setSubmittingMovement(true);
    try {
      const item = items.find((i) => i.item_cd === movementData.itemCd);
      const r = await saveStockMovement({
        itemCd: item.item_cd,
        itemName: item.item_name,
        itemClsCd: item.item_cls_cd || '5059690809',
        price: item.price || 0,
        taxTyCd: item.tax_type || 'B',
        qty: Number(movementData.qty),
        type: movementData.type,
        reason: movementData.reason,
        reference: '',
        cashier: 'Admin',
      });
      if (r.data?.success) {
        toast.success(`Stock ${movementData.type === 'IN' ? 'added' : 'removed'}`);
        setShowMovementForm(false);
        setMovementData({ itemCd: '', itemName: '', qty: '', type: 'IN', reason: '' });
        fetchProducts();
        fetchSyncStatus();
      } else {
        toast.error(r.data?.error || 'Failed');
      }
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed');
    } finally { setSubmittingMovement(false); }
  };

  const handleSync = async () => {
    if (!vscuOnline) return toast.error('VSCU offline');
    setSyncing(true);
    try {
      const r = await syncStockToVSCU();
      const s = r.data;
      if (s.success) {
        toast.success(`Synced ${s.synced}${s.failed ? `, ${s.failed} failed` : ''}`);
      } else {
        toast.warning(s.message || 'Sync issue');
      }
      fetchProducts();
      fetchSyncStatus();
    } catch { toast.error('Sync failed'); }
    finally { setSyncing(false); }
  };

  const handleSaveMaster = async (item) => {
    if (!vscuOnline) return toast.error('VSCU offline');
    try {
      const r = await saveStockMaster(item.item_cd, item.stock || 0);
      if (r.data?.resultCd === '000' || r.data?.resultCd === '00') {
        toast.success(`Master saved for ${item.item_cd}`);
      } else {
        toast.warning(r.data?.resultMsg || 'Failed');
      }
    } catch { toast.error('Save master failed'); }
  };

  const getStatus = (stock, min) => {
    if (!stock || stock <= 0) return { label: 'Out', color: 'bg-rose-100 text-rose-700' };
    if (stock <= (min || 5)) return { label: 'Low', color: 'bg-amber-100 text-amber-700' };
    return { label: 'In Stock', color: 'bg-emerald-100 text-emerald-700' };
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-24 lg:pb-6">

      {/* Header */}
      <div className="bg-white border-b border-slate-200/80 sticky top-0 z-20">
        <div className="px-3 sm:px-6 py-3 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold text-[#1a2a4a] truncate">Products</h1>
            <p className="text-[10px] sm:text-xs text-slate-400 truncate">
              Stock {stats.totalStock} · Value KES {stats.stockValue.toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
              vscuOnline ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'
            }`}>
              <span className={`text-[10px] font-semibold ${vscuOnline ? 'text-emerald-700' : 'text-rose-700'}`}>
                {vscuOnline ? 'VSCU' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Stats strip */}
        <div className="px-3 sm:px-6 pb-3 grid grid-cols-4 gap-2">
          <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Products</p>
            <p className="text-sm font-bold text-[#1a2a4a]">{stats.totalItems}</p>
          </div>
          <div className="bg-slate-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-slate-400">Stock</p>
            <p className="text-sm font-bold text-[#1a2a4a]">{stats.totalStock}</p>
          </div>
          <div className="bg-amber-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-amber-600">Low</p>
            <p className="text-sm font-bold text-amber-600">{stats.lowStock}</p>
          </div>
          <div className="bg-rose-50 rounded-lg px-2 py-1.5 text-center">
            <p className="text-[9px] uppercase tracking-wider text-rose-600">Out</p>
            <p className="text-sm font-bold text-rose-600">{stats.outOfStock}</p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-3 sm:px-6 pb-3 flex flex-wrap gap-2">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
              showAddForm ? 'bg-slate-200 text-slate-700' : 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={showAddForm ? 'M6 18L18 6M6 6l12 12' : 'M12 4v16m8-8H4'} />
            </svg>
            {showAddForm ? 'Cancel' : 'Add Product'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || stockPendingCount === 0 || !vscuOnline}
            className={`flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1.5 ${
              syncing || stockPendingCount === 0 || !vscuOnline
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {syncing ? 'Syncing...' : `Sync${stockPendingCount > 0 ? ` (${stockPendingCount})` : ''}`}
          </button>
          <button
            onClick={() => openMovement({ item_cd: '', item_name: '' }, 'IN')}
            className="flex-1 sm:flex-initial px-3 py-2 rounded-lg text-xs font-semibold bg-[#1a2a4a] hover:bg-[#253b66] text-white transition"
          >
            Movement
          </button>
          <button
            onClick={fetchProducts}
            disabled={loading}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
            </svg>
          </button>
        </div>

        {/* Search + filters */}
        <div className="px-3 sm:px-6 pb-3 flex flex-wrap gap-2">
          <div className="flex-1 min-w-40 relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
            />
            <svg className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          >
            <option value="all">All Categories</option>
            {Object.entries(PRODUCT_CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
          >
            <option value="all">All</option>
            <option value="low">Low</option>
            <option value="out">Out</option>
          </select>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="p-3 sm:p-6">
          <AddItemForm
            mode="product"
            onSave={handleAddProduct}
            onCancel={() => setShowAddForm(false)}
            isSaving={savingProduct}
          />
        </div>
      )}

      {/* Edit form (modal) */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-start sm:items-center justify-center z-50 p-0 sm:p-4 overflow-y-auto">
          <div className="bg-white sm:rounded-2xl shadow-2xl max-w-2xl w-full my-4">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-[#1a2a4a]">Edit Product</h2>
              <button
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 max-h-[80vh] overflow-y-auto">
              <AddItemForm
                item={editingItem}
                mode="product"
                onSave={handleEditProduct}
                onCancel={() => setEditingItem(null)}
                isSaving={savingProduct}
              />
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="p-3 sm:p-6 space-y-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            <p className="text-sm text-slate-500 font-medium">No products found</p>
            <p className="text-xs text-slate-400 mt-1">Tap "Add Product" to create your first item</p>
          </div>
        ) : (
          filtered.map((item) => {
            const status = getStatus(item.stock, item.sfty_qty);
            const cat = PRODUCT_CATEGORIES[item.category] || PRODUCT_CATEGORIES.other;
            const img = item.image_url;
            return (
              <div key={item.item_cd} className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="flex gap-3 p-3">
                  {/* Image / placeholder */}
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-lg bg-slate-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {img ? (
                      <img src={img} alt={item.item_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-xl font-bold text-slate-300">
                        {(item.item_name || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-[#1a2a4a] truncate">{item.item_name}</p>
                        <p className="text-[10px] font-mono text-slate-400">{item.item_cd}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold whitespace-nowrap ${status.color}`}>
                        {status.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400">Price</p>
                        <p className="text-sm font-bold text-[#f47b20]">
                          KES {(item.price || 0).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400">Stock</p>
                        <p className="text-sm font-bold text-[#1a2a4a]">{item.stock || 0}</p>
                      </div>
                      <div className="flex-1">
                        <p className="text-[9px] uppercase tracking-wider text-slate-400">Category</p>
                        <p className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cat.color} inline-block`}>
                          {cat.name}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 mt-2">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold transition"
                      >
                        EDIT
                      </button>
                      <button
                        onClick={() => openMovement(item, 'IN')}
                        className="flex-1 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded-lg text-[10px] font-bold transition"
                      >
                        + IN
                      </button>
                      <button
                        onClick={() => openMovement(item, 'OUT')}
                        className="flex-1 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[10px] font-bold transition"
                      >
                        − OUT
                      </button>
                      <button
                        onClick={() => handleSaveMaster(item)}
                        className="flex-1 py-1.5 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded-lg text-[10px] font-bold transition"
                      >
                        MASTER
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Movement modal */}
      {showMovementForm && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-[#1a2a4a]">Stock Movement</h2>
              <button onClick={() => setShowMovementForm(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Product</label>
                <select
                  value={movementData.itemCd}
                  onChange={(e) => {
                    const sel = items.find((i) => i.item_cd === e.target.value);
                    setMovementData({ ...movementData, itemCd: e.target.value, itemName: sel?.item_name || '' });
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                >
                  <option value="">Select product...</option>
                  {items.map((i) => (
                    <option key={i.item_cd} value={i.item_cd}>
                      {i.item_name} — {i.stock || 0} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setMovementData({ ...movementData, type: 'IN' })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                    movementData.type === 'IN' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  + Stock IN
                </button>
                <button
                  onClick={() => setMovementData({ ...movementData, type: 'OUT' })}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                    movementData.type === 'OUT' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  − Stock OUT
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={movementData.qty}
                  onChange={(e) => setMovementData({ ...movementData, qty: e.target.value })}
                  placeholder="Enter quantity"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={movementData.reason}
                  onChange={(e) => setMovementData({ ...movementData, reason: e.target.value })}
                  placeholder="e.g. Restock, Damage"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm"
                />
              </div>

              {movementData.itemCd && (
                <div className="bg-slate-50 rounded-lg p-3 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Current</span>
                    <span className="font-bold">{items.find((i) => i.item_cd === movementData.itemCd)?.stock || 0}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-slate-500">After</span>
                    <span className="font-bold text-[#f47b20]">
                      {(items.find((i) => i.item_cd === movementData.itemCd)?.stock || 0) +
                        (movementData.type === 'IN' ? Number(movementData.qty || 0) : -Number(movementData.qty || 0))}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 p-4 border-t border-slate-100">
              <button
                onClick={() => setShowMovementForm(false)}
                className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                onClick={handleMovementSubmit}
                disabled={!movementData.itemCd || !movementData.qty || submittingMovement}
                className="flex-1 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {submittingMovement ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Products;