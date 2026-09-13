import { useState, useMemo, useEffect } from 'react';
import { getItems, getStock } from '../../api/vscuApi';

const SERVICE_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'basic', name: 'Basic' },
  { id: 'standard', name: 'Standard' },
  { id: 'premium', name: 'Premium' },
  { id: 'vip', name: 'VIP' },
  { id: 'interior', name: 'Interior' },
  { id: 'addon', name: 'Add-ons' },
];

const PRODUCT_CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'detergent', name: 'Detergents' },
  { id: 'freshener', name: 'Fresheners' },
  { id: 'accessories', name: 'Accessories' },
  { id: 'polish', name: 'Polishes' },
  { id: 'consumable', name: 'Consumables' },
  { id: 'other', name: 'Other' },
];

// Insert Cloudinary transformation for square thumbnail
const toThumb = (url) => {
  if (!url) return '';
  if (!url.includes('res.cloudinary.com')) return url;
  return url.replace('/upload/', '/upload/w_300,h_300,c_fill,q_auto,f_auto/');
};

const isProduct = (i) =>
  (i.item_type || '').toLowerCase() === 'product' || String(i.item_ty_cd) === '1';

const isService = (i) =>
  (i.item_type || '').toLowerCase() === 'service' || String(i.item_ty_cd) === '2';

// Colored placeholder with first letter when no image
const Placeholder = ({ name }) => {
  const letter = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#1a2a4a] to-[#2a3a5a] flex items-center justify-center">
      <span className="text-3xl font-bold text-white/80">{letter}</span>
    </div>
  );
};

const ServiceGrid = ({ items: itemsProp, onAdd }) => {
  const [tab, setTab] = useState('service');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [services, setServices] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch own data if no items prop is provided
  useEffect(() => {
    if (itemsProp && itemsProp.length) {
      setServices(itemsProp.filter(isService));
      setProducts(itemsProp.filter(isProduct));
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        setLoading(true);
        const [itemsRes, stockRes] = await Promise.all([
          getItems().catch(() => ({ data: [] })),
          getStock().catch(() => ({ data: [] })),
        ]);
        const allItems = itemsRes.data || [];
        const stockItems = stockRes.data || [];

        setServices(allItems.filter(isService));
        setProducts(stockItems.length ? stockItems : allItems.filter(isProduct));
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    const i = setInterval(fetchData, 60000);
    return () => clearInterval(i);
  }, [itemsProp]);

  const activeList = tab === 'service' ? services : products;
  const activeCategories = tab === 'service' ? SERVICE_CATEGORIES : PRODUCT_CATEGORIES;

  const filtered = useMemo(() => {
    return activeList
      .filter(i => {
        if (tab === 'product') return true;
        return category === 'all' || (i.category || 'addon') === category;
      })
      .filter(i => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (i.item_name || i.itemNm || '').toLowerCase().includes(q) ||
          (i.item_cd || i.itemCd || '').toLowerCase().includes(q)
        );
      });
  }, [activeList, tab, category, search]);

  const getPrice = (i) => Number(i.price || i.dftPrc || 0);
  const getName = (i) => i.item_name || i.itemNm || 'Unnamed';
  const getDuration = (i) => i.sfty_qty || i.sftyQty || 0;
  const getStock = (i) => i.stock ?? 0;
  const getCd = (i) => i.item_cd || i.itemCd;
  const getImage = (i) => i.image_url || '';

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-full overflow-hidden">

      {/* Tabs */}
      <div className="flex border-b border-slate-200 shrink-0">
        {['service', 'product'].map((t) => {
          const count = t === 'service' ? services.length : products.length;
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => { setTab(t); setCategory('all'); setSearch(''); }}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-semibold transition flex items-center justify-center gap-1.5 ${
                active
                  ? 'text-[#f47b20] border-b-2 border-[#f47b20] bg-orange-50/40'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <span>{t === 'service' ? 'Services' : 'Products'}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                active ? 'bg-[#f47b20] text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <div className="p-2 border-b border-slate-100 shrink-0">
        <div className="relative">
          <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={`Search ${tab === 'service' ? 'services' : 'products'}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
          />
        </div>
      </div>

      {/* Category chips (services only) */}
      {tab === 'service' && (
        <div className="px-2 py-2 border-b border-slate-100 shrink-0">
          <div className="flex gap-1.5 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300">
            {activeCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategory(c.id)}
                className={`px-3 py-1 text-xs rounded-full font-medium whitespace-nowrap transition shrink-0 ${
                  category === c.id
                    ? 'bg-[#1a2a4a] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 px-4">
            <svg className="w-12 h-12 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
            <p className="text-slate-400 text-sm">
              No {tab === 'service' ? 'services' : 'products'} found
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {filtered.map((item) => {
              const stock = getStock(item);
              const inStock = tab === 'service' || stock > 0;
              const img = getImage(item);
              const name = getName(item);
              const price = getPrice(item);
              const duration = getDuration(item);

              return (
                <button
                  key={getCd(item)}
                  onClick={() => inStock && onAdd(item)}
                  disabled={!inStock}
                  className={`text-left rounded-lg border transition active:scale-[0.97] overflow-hidden flex flex-col ${
                    !inStock
                      ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-[#f47b20] hover:shadow-md'
                  }`}
                >
                  {/* Square image container */}
                  <div className="w-full aspect-square bg-slate-100 relative overflow-hidden">
                    {img ? (
                      <img
                        src={toThumb(img)}
                        alt={name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextElementSibling?.classList?.remove('hidden');
                        }}
                      />
                    ) : null}
                    <div className={img ? 'hidden' : ''}>
                      <Placeholder name={name} />
                    </div>

                    {/* Stock badge */}
                    {tab === 'product' && stock <= 0 && (
                      <span className="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        OUT
                      </span>
                    )}
                    {tab === 'product' && stock > 0 && stock <= 5 && (
                      <span className="absolute top-1 right-1 bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                        LOW
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-2 flex flex-col gap-0.5 min-h-0">
                    <p className="text-[11px] font-semibold text-[#1a2a4a] line-clamp-2 leading-tight">
                      {name}
                    </p>
                    <p className="text-xs font-bold text-[#f47b20]">
                      KES {price.toLocaleString()}
                    </p>
                    {tab === 'service' && duration > 0 && (
                      <p className="text-[9px] text-slate-400">{duration} min</p>
                    )}
                    {tab === 'product' && (
                      <p className="text-[9px] text-slate-400">
                        {stock > 0 ? `${stock} left` : 'Out of stock'}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceGrid;