import { useState, useMemo } from 'react';

const CATEGORIES = [
  { id: 'all', name: 'All' },
  { id: 'basic', name: 'Basic' },
  { id: 'standard', name: 'Standard' },
  { id: 'premium', name: 'Premium' },
  { id: 'vip', name: 'VIP' },
  { id: 'interior', name: 'Interior' },
  { id: 'addon', name: 'Add-ons' },
];

const ServiceGrid = ({ items, onAdd }) => {
  const [tab, setTab] = useState('service');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    return items
      .filter((i) => (i.item_type || 'service') === tab)
      .filter((i) => category === 'all' || (i.category || 'addon') === category)
      .filter((i) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (i.item_name || i.itemNm || '').toLowerCase().includes(q) ||
          (i.item_cd || i.itemCd || '').toLowerCase().includes(q)
        );
      });
  }, [items, tab, category, search]);

  const getPrice = (i) => Number(i.price || i.dftPrc || 0);
  const getName = (i) => i.item_name || i.itemNm || 'Unnamed';
  const getDuration = (i) => i.sfty_qty || i.sftyQty || 0;
  const getStock = (i) => i.stock ?? 0;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {['service', 'product'].map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setCategory('all'); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition ${
              tab === t
                ? 'text-[#f47b20] border-b-2 border-[#f47b20]'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {t === 'service' ? 'Services' : 'Products'}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="p-3 border-b border-slate-100">
        <input
          type="text"
          placeholder={`Search ${tab === 'service' ? 'services' : 'products'}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
        />
      </div>

      {/* Category chips (services only) */}
      {tab === 'service' && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-2.5 py-1 text-xs rounded-full font-medium transition ${
                category === c.id
                  ? 'bg-[#1a2a4a] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-sm">
            No {tab === 'service' ? 'services' : 'products'} found
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
            {filtered.map((item) => {
              const stock = getStock(item);
              const isService = tab === 'service';
              const outOfStock = !isService && stock <= 0;
              return (
                <button
                  key={item.item_cd || item.itemCd}
                  onClick={() => !outOfStock && onAdd(item)}
                  disabled={outOfStock}
                  className={`text-left p-3 rounded-lg border transition active:scale-95 ${
                    outOfStock
                      ? 'bg-slate-50 border-slate-200 opacity-50 cursor-not-allowed'
                      : 'bg-white border-slate-200 hover:border-[#f47b20] hover:shadow-md'
                  }`}
                >
                  <p className="text-xs font-semibold text-[#1a2a4a] line-clamp-2 min-h-8">
                    {getName(item)}
                  </p>
                  <p className="text-sm font-bold text-[#f47b20] mt-1">
                    KES {getPrice(item).toLocaleString()}
                  </p>
                  <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                    {isService && getDuration(item) > 0 && (
                      <span>{getDuration(item)} min</span>
                    )}
                    {!isService && (
                      <span className={stock <= 0 ? 'text-rose-500' : ''}>
                        {stock <= 0 ? 'Out of stock' : `${stock} left`}
                      </span>
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