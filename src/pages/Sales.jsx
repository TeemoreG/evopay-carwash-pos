import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import ServiceGrid from '../components/pos/ServiceGrid';
import Cart from '../components/pos/Cart';
import PaymentBar from '../components/pos/PaymentBar';
import QRPaymentModal from '../components/pos/QRPaymentModal';
import RecentSalesPanel from '../components/pos/RecentSalesPanel';
import ThermalReceipt, { generateThermalReceipt } from '../components/sales/ThermalReceipt';
import {
  getItems, getSales, saveSales, checkVSCUStatus,
  getNextInvoice, createQRSession, stkPush, pollPaymentStatus,
  confirmPayment, retrySale, getSale,
  getSaleByInvoice, cancelPaymentSession, sendReceiptSms,
} from '../api/vscuApi';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import posIcon from '../assets/pos-icon.png';

const TAX_RATES = { A: 0, B: 0.16, C: 0 };

const PosIcon = ({ className = 'w-7 h-7' }) => (
  <img
    src={posIcon}
    alt="POS"
    className={`${className} object-contain`}
  />
);

const Sales = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [lines, setLines] = useState([]);
  const [customer, setCustomer] = useState('');
  const [customerPin, setCustomerPin] = useState('');
  const [discount, setDiscount] = useState({ type: 'none', value: '' });
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [currentSale, setCurrentSale] = useState(null);
  const [qrSession, setQrSession] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cashLoading, setCashLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSending, setSmsSending] = useState(false);
  const [now, setNow] = useState(new Date());
  const [mobileTab, setMobileTab] = useState('services');
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
    checkVSCU();
    const i = setInterval(checkVSCU, 15000);
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => { clearInterval(i); clearInterval(t); };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F1') { e.preventDefault(); if (lines.length && !saving) handleCash(); }
      if (e.key === 'F2') { e.preventDefault(); if (lines.length && !saving) handleQR(); }
      if (e.key === 'Escape' && qrSession) {
        cancelPaymentSession(qrSession.invoice).catch(() => {});
        setQrSession(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lines, saving, qrSession]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [i, s] = await Promise.all([
        getItems().catch(() => ({ data: [] })),
        getSales().catch(() => ({ data: [] })),
      ]);
      setItems((i.data || []).filter(Boolean));
      setSales((s.data || []).filter(Boolean).sort((a, b) =>
        new Date(b.created_at || b.date) - new Date(a.created_at || a.date)));
    } finally { setLoading(false); }
  };

  const checkVSCU = async () => {
    try {
      const r = await checkVSCUStatus();
      setVscuOnline(r.data?.online || false);
    } catch { setVscuOnline(false); }
  };

  const addToCart = (item) => {
    if (!item) return;
    const cd = item.item_cd || item.itemCd;
    const price = Number(item.price || item.dftPrc || 0);
    const tax_type = item.tax_type || item.taxTyCd || 'B';
    const name = item.item_name || item.itemNm || 'Unnamed';
    setLines(prev => {
      const ex = prev.find(l => l.item_cd === cd);
      if (ex) return prev.map(l => l.item_cd === cd ? { ...l, qty: l.qty + 1 } : l);
      return [...prev, { item_cd: cd, name, price, qty: 1, tax_type }];
    });
  };

  const handleQty = (cd, qty) => {
    if (qty <= 0) return setLines(p => p.filter(l => l.item_cd !== cd));
    setLines(p => p.map(l => l.item_cd === cd ? { ...l, qty } : l));
  };

  const handleRemove = (cd) => setLines(p => p.filter(l => l.item_cd !== cd));

  const buildPayload = (invoice, status, method) => {
    const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
    const tax = lines.reduce((s, l) => {
      const r = TAX_RATES[l.tax_type] || 0;
      const amt = l.price * l.qty;
      return s + (r ? amt * (r / (1 + r)) : 0);
    }, 0);
    let disc = 0;
    if (discount.type === 'percentage' && discount.value) disc = (subtotal * parseFloat(discount.value)) / 100;
    else if (discount.type === 'fixed' && discount.value) disc = parseFloat(discount.value);
    const total = Math.max(0, Math.round(subtotal - disc));

    return {
      invoice_no: invoice,
      customer: customer.trim() || 'Walk-in Customer',
      customer_pin: customerPin.trim() || '',
      cashier: user?.full_name || user?.username || 'Unknown',
      subtotal: Math.round(subtotal),
      tax: Math.round(tax),
      total,
      discount_type: discount.type,
      discount_value: discount.value || null,
      payment_method: method,
      sales_type: 'N',
      receipt_type: 'NS',
      status,
      date: new Date().toISOString().split('T')[0],
      created_at: new Date().toISOString(),
      items: lines.map(l => ({
        item_cd: l.item_cd,
        item_name: l.name,
        item_cls_cd: '5059690809',
        quantity: l.qty,
        price: l.price,
        tax_type: l.tax_type,
        tax_amount: (TAX_RATES[l.tax_type] || 0) * l.price * l.qty / (1 + (TAX_RATES[l.tax_type] || 0)),
        total: l.price * l.qty,
      })),
    };
  };

  const resetCart = () => {
    setLines([]); setCustomer(''); setCustomerPin('');
    setDiscount({ type: 'none', value: '' });
    setMobileTab('services');
  };

  const getInvoice = async () => {
    try {
      const r = await getNextInvoice();
      const inv = r.data?.invoice_no;
      if (inv) return inv;
      throw new Error('No invoice');
    } catch {
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      return `CW-${ymd}-${String(Date.now()).slice(-4)}`;
    }
  };

  const handleCash = async () => {
    if (!lines.length) return toast.error('Add at least one item');
    setCashLoading(true);
    setSaving(true);
    try {
      const invoice = await getInvoice();
      const payload = buildPayload(invoice, 'Completed', '01');
      const res = await saveSales(payload);
      const saved = res?.data?.sale || payload;
      setCurrentSale({ ...saved, ...payload, vscu_signature: res?.data?.signature });
      setSmsPhone('');
      resetCart();
      fetchData();
      toast.success('Sale completed');
      setShowReceipt(true);
    } catch (e) {
      console.error(e);
      toast.error('Failed to save sale');
    } finally {
      setCashLoading(false);
      setSaving(false);
    }
  };

  const handleQR = async () => {
    if (!lines.length) return toast.error('Add at least one item');
    setQrLoading(true);
    setSaving(true);
    try {
      const invoice = await getInvoice();
      const cart = buildPayload(invoice, 'Pending', '03');

      if (!cart.total || isNaN(cart.total)) {
        toast.error('Cart total is invalid');
        return;
      }

      await createQRSession({
        invoice_no: invoice,
        amount: Number(cart.total),
        cart,
      });

      setQrSession({
        invoice: String(invoice),
        amount: Number(cart.total),
        sale: cart,
      });

      resetCart();
    } catch (e) {
      console.error('QR error:', e);
      toast.error('Failed to create QR session');
    } finally {
      setQrLoading(false);
      setSaving(false);
    }
  };

  const handleMarkPaid = async (invoice) => {
    if (!qrSession) return;
    try {
      await confirmPayment(invoice, 'cash');

      let sale = null;
      for (let i = 0; i < 6; i++) {
        try {
          const sr = await getSaleByInvoice(invoice);
          if (sr?.data?.items?.length) { sale = sr.data; break; }
          sale = sr?.data || sale;
        } catch (e) {
          // ignore 404 while waiting
        }
        await new Promise((r) => setTimeout(r, 800));
      }

      const finalSale = sale || qrSession.sale;

      setCurrentSale({ ...finalSale, status: 'Completed', payment_method: finalSale.payment_method || '03' });
      setQrSession(null);
      setSmsPhone('');
      setShowReceipt(true);
      fetchData();
      toast.success('Payment confirmed');
    } catch (e) {
      console.error('confirm failed:', e);
      toast.error('Failed to confirm');
    }
  };

  const handleSTK = async (invoice, phone) => {
    const r = await stkPush(invoice, phone);
    return r.data;
  };

  const handlePoll = async (invoice) => {
    const r = await pollPaymentStatus(invoice);
    return r.data;
  };

  const handleRetrySync = async (saleId) => {
    try {
      const r = await retrySale(saleId);
      if (r.data?.synced) {
        toast.success('Synced to KRA');
      } else {
        toast.warn('Still pending — VSCU may be offline');
      }
      fetchData();
    } catch (e) {
      console.error('Retry failed:', e);
      toast.error('Retry failed');
    }
  };

  const handleDownloadReceipt = async (sale) => {
    try {
      let fullSale = sale;
      if (!sale.items || sale.items.length === 0) {
        const r = await getSale(sale.id);
        fullSale = r.data || sale;
      }

      const doc = await generateThermalReceipt(fullSale, null);
      if (!doc) throw new Error('Failed to generate PDF');

      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const filename = `receipt-${sale.invoice_no || sale.id || Date.now()}.pdf`;

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Receipt downloaded');
    } catch (e) {
      console.error('Download failed:', e);
      toast.error('Download failed: ' + (e.message || 'Unknown'));
    }
  };

  const handleSendReceiptSms = async () => {
    if (!currentSale?.invoice_no) return toast.error('No invoice');
    const digits = (smsPhone || '').replace(/\D/g, '');
    if (digits.length !== 10 || !/^0[17]/.test(digits)) {
      return toast.error('Enter a valid phone (07XX or 01XX)');
    }
    setSmsSending(true);
    try {
      await sendReceiptSms(currentSale.invoice_no, digits);
      toast.success('Receipt SMS sent');
      setSmsPhone('');
    } catch (e) {
      const msg = e?.response?.data?.error || 'Failed to send SMS';
      toast.error(msg);
    } finally {
      setSmsSending(false);
    }
  };

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const itemCount = lines.reduce((s, l) => s + l.qty, 0);

  const todayStats = useMemo(() => {
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' });
    const todaySales = sales.filter(s =>
      (s.created_at || s.date || '').slice(0, 10) === todayStr
    );
    const revenue = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
    return { count: todaySales.length, revenue };
  }, [sales]);

  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">

      {/* ============ POS HEADER ============ */}
      <div className="bg-white border-b border-slate-200/80 px-3 py-2 sticky top-0 z-30 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          {/* Left spacer for balance */}
          <div className="w-16 hidden sm:block"></div>

          {/* Center — POS branding */}
          <div className="flex items-center gap-3 min-w-0">
            <PosIcon className="w-8 h-8" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-[17px] font-bold text-[#1a2a4a] leading-tight">Point of Sale</h1>
                <span className="text-[12px] font-semibold text-[#f47b20] bg-[#f47b20]/10 px-1.5 py-0.5 rounded">
                </span>
              </div>
              <p className="text-[12px] text-slate-400 truncate">
                {user?.full_name || user?.username || 'Cashier'} · {timeStr}
              </p>
            </div>
          </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1
            `}>
          </div>
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1 flex items-center justify-between gap-3 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-500">
                Today <span className="font-bold text-[#1a2a4a]">{todayStats.count}</span>
                <span className="text-slate-400"> sale{todayStats.count !== 1 ? 's' : ''}</span>
              </div>
              <div className="w-px h-3 bg-slate-300" />
              <div className="text-xs text-slate-500">
                <span className="font-bold text-[#f47b20]">KES {todayStats.revenue.toLocaleString()}</span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              {itemCount > 0 ? `${itemCount} item${itemCount !== 1 ? 's' : ''} in cart` : 'Cart empty'}
            </div>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="lg:hidden mt-2 flex bg-slate-100 rounded-lg p-0.5">
          {[
            { id: 'services', label: 'Services', icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z' },
            { id: 'cart', label: 'Cart', icon: 'M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z', badge: itemCount },
            { id: 'sales', label: 'Sales', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setMobileTab(t.id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-md transition flex items-center justify-center gap-1.5 relative ${
                mobileTab === t.id ? 'bg-white text-[#1a2a4a] shadow-sm' : 'text-slate-500'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={t.icon} />
              </svg>
              {t.label}
              {t.badge > 0 && (
                <span className="absolute top-0.5 right-1 bg-[#f47b20] text-white text-[9px] font-bold rounded-full min-w-4 h-4 flex items-center justify-center px-1">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ============ DESKTOP GRID ============ */}
      <div className="hidden lg:grid flex-1 grid-cols-12 gap-3 p-4">
        <div className="lg:col-span-7 xl:col-span-8 h-[calc(100vh-180px)] min-h-125">
          <ServiceGrid items={items} onAdd={addToCart} />
        </div>
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col h-[calc(100vh-180px)] min-h-125">
          <div className="flex-1 min-h-0">
            <Cart
              lines={lines}
              onQty={handleQty}
              onRemove={handleRemove}
              discount={discount}
              setDiscount={setDiscount}
              customer={customer}
              setCustomer={setCustomer}
              customerPin={customerPin}
              setCustomerPin={setCustomerPin}
              itemCount={itemCount}
              onClear={resetCart}
            />
          </div>
          <div className="mt-3">
            <PaymentBar
              total={total}
              disabled={!lines.length || saving}
              onCash={handleCash}
              onQR={handleQR}
              cashLoading={cashLoading}
              qrLoading={qrLoading}
            />
          </div>
        </div>
      </div>

      {/* ============ MOBILE CONTENT ============ */}
      <div className="lg:hidden flex-1 p-3 pb-32">
        {mobileTab === 'services' && (
          <div className="h-[calc(100vh-280px)] min-h-80">
            <ServiceGrid items={items} onAdd={addToCart} />
          </div>
        )}
        {mobileTab === 'cart' && (
          <div className="h-[calc(100vh-280px)] min-h-80">
            <Cart
              lines={lines}
              onQty={handleQty}
              onRemove={handleRemove}
              discount={discount}
              setDiscount={setDiscount}
              customer={customer}
              setCustomer={setCustomer}
              customerPin={customerPin}
              setCustomerPin={setCustomerPin}
              itemCount={itemCount}
              onClear={resetCart}
            />
          </div>
        )}
        {mobileTab === 'sales' && (
          <div>
            <RecentSalesPanel
              sales={sales}
              loading={loading}
              onRetry={handleRetrySync}
              onDownloadReceipt={handleDownloadReceipt}
              alwaysOpen
            />
          </div>
        )}
      </div>

      {/* Mobile payment bar */}
      {mobileTab === 'cart' && (
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-3 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-500">
              {itemCount} item{itemCount !== 1 ? 's' : ''}
            </span>
            <span className="text-lg font-bold text-[#f47b20]">
              KES {Math.round(total).toLocaleString()}
            </span>
          </div>
          <PaymentBar
            total={total}
            disabled={!lines.length || saving}
            onCash={handleCash}
            onQR={handleQR}
            cashLoading={cashLoading}
            qrLoading={qrLoading}
          />
        </div>
      )}

      {/* Desktop recent sales */}
      <div className="hidden lg:block p-3 sm:p-4 lg:pt-0">
        <RecentSalesPanel sales={sales} loading={loading} />
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="hidden lg:flex fixed bottom-3 right-3 items-center gap-3 bg-white/95 border border-slate-200 rounded-lg px-3 py-2 text-[10px] text-slate-500 shadow-sm z-20">
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono">F1</kbd> Cash
        </span>
        <span className="flex items-center gap-1">
          <kbd className="px-1.5 py-0.5 bg-slate-100 border border-slate-300 rounded text-[9px] font-mono">F2</kbd> QR
        </span>
      </div>

      {qrSession?.invoice && qrSession?.amount > 0 && (
        <QRPaymentModal
          invoice={qrSession.invoice}
          amount={qrSession.amount}
          onMarkPaid={handleMarkPaid}
          onCancel={async () => {
            try { await cancelPaymentSession(qrSession.invoice); } catch {}
            setQrSession(null);
          }}
          onStkPush={handleSTK}
          onPoll={handlePoll}
        />
      )}

      {showReceipt && currentSale && (
        <ThermalReceipt
          sale={currentSale}
          onClose={() => { setShowReceipt(false); setCurrentSale(null); setSmsPhone(''); }}
          onSendSms={handleSendReceiptSms}
          smsSending={smsSending}
          smsPhone={smsPhone}
          setSmsPhone={setSmsPhone}
        />
      )}
    </div>
  );
};

export default Sales;