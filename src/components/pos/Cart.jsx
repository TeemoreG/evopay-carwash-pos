import { useState, useEffect, useRef } from 'react';
import axiosInstance from '../../api/axiosConfig';

const TAX_RATES = { A: 0, B: 0.16, C: 0 };

const Cart = ({ lines, onQty, onRemove, discount, setDiscount, customer, setCustomer }) => {
  const [customers, setCustomers] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    axiosInstance.get('/api/customers')
      .then((res) => setCustomers(res.data || []))
      .catch(() => setCustomers([]));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const tax = lines.reduce((s, l) => {
    const rate = TAX_RATES[l.tax_type || 'B'] || 0;
    const amount = l.price * l.qty;
    return s + (rate ? amount * (rate / (1 + rate)) : 0);
  }, 0);

  let discountAmount = 0;
  if (discount.type === 'percentage' && discount.value) {
    discountAmount = (subtotal * parseFloat(discount.value)) / 100;
  } else if (discount.type === 'fixed' && discount.value) {
    discountAmount = parseFloat(discount.value);
  }
  const total = Math.max(0, subtotal - discountAmount);

  const filteredCustomers = customer.trim()
    ? customers.filter((c) =>
        (c.name || '').toLowerCase().includes(customer.toLowerCase()) ||
        (c.pin || '').toLowerCase().includes(customer.toLowerCase()) ||
        (c.plate || '').toLowerCase().includes(customer.toLowerCase())
      ).slice(0, 8)
    : customers.slice(0, 8);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm flex flex-col h-full">
      {/* Customer */}
      <div className="p-3 border-b border-slate-100" ref={dropdownRef}>
        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
          Customer / Plate
        </label>
        <div className="relative">
          <input
            type="text"
            value={customer}
            onChange={(e) => { setCustomer(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder="Walk-in customer or plate..."
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
          />
          {showDropdown && filteredCustomers.length > 0 && (
            <div className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
              {filteredCustomers.map((c, i) => (
                <button
                  key={c.id || i}
                  type="button"
                  onClick={() => { setCustomer(c.name || c.plate || ''); setShowDropdown(false); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-slate-50 text-xs border-b border-slate-50 last:border-0"
                >
                  <span className="font-medium text-slate-700">{c.name || c.plate}</span>
                  {c.plate && <span className="text-slate-400 ml-2">{c.plate}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {lines.length === 0 ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            Tap a service to add
          </div>
        ) : (
          lines.map((l) => (
            <div key={l.item_cd} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[#1a2a4a] truncate">{l.name}</p>
                <p className="text-[10px] text-slate-400">
                  KES {l.price.toLocaleString()} × {l.qty}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => onQty(l.item_cd, l.qty - 1)}
                  className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-bold"
                >−</button>
                <span className="w-6 text-center text-xs font-semibold">{l.qty}</span>
                <button
                  onClick={() => onQty(l.item_cd, l.qty + 1)}
                  className="w-6 h-6 rounded bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm font-bold"
                >+</button>
              </div>
              <button
                onClick={() => onRemove(l.item_cd)}
                className="text-rose-500 hover:bg-rose-50 p-1 rounded"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>

      {/* Discount */}
      <div className="px-3 py-2 border-t border-slate-100 flex gap-2">
        <select
          value={discount.type}
          onChange={(e) => setDiscount({ ...discount, type: e.target.value, value: '' })}
          className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
        >
          <option value="none">No Discount</option>
          <option value="percentage">% Off</option>
          <option value="fixed">KES Off</option>
        </select>
        {discount.type !== 'none' && (
          <input
            type="number"
            min="0"
            value={discount.value}
            onChange={(e) => setDiscount({ ...discount, value: e.target.value })}
            placeholder={discount.type === 'percentage' ? '%' : 'KES'}
            className="flex-1 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
          />
        )}
      </div>

      {/* Totals */}
      <div className="p-3 border-t border-slate-200 space-y-1 text-sm">
        <div className="flex justify-between text-slate-500">
          <span>Subtotal</span>
          <span>KES {subtotal.toLocaleString()}</span>
        </div>
        <div className="flex justify-between text-slate-500">
          <span>VAT (16%)</span>
          <span className="text-[#f47b20]">KES {Math.round(tax).toLocaleString()}</span>
        </div>
        {discountAmount > 0 && (
          <div className="flex justify-between text-blue-600">
            <span>Discount</span>
            <span>− KES {Math.round(discountAmount).toLocaleString()}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base text-[#1a2a4a] pt-1 border-t border-slate-100">
          <span>TOTAL</span>
          <span className="text-[#f47b20]">KES {Math.round(total).toLocaleString()}</span>
        </div>
      </div>
    </div>
  );
};

export default Cart;