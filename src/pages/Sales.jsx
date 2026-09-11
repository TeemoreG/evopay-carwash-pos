import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import ServiceGrid from '../components/pos/ServiceGrid';
import Cart from '../components/pos/Cart';
import PaymentBar from '../components/pos/PaymentBar';
import QRPaymentModal from '../components/pos/QRPaymentModal';
import RecentSalesPanel from '../components/pos/RecentSalesPanel';
import ThermalReceipt from '../components/sales/ThermalReceipt';
import {
  getItems, getSales, saveSales, checkVSCUStatus,
  getNextInvoice, createQRSession, stkPush, pollPaymentStatus,
  confirmPayment,
} from '../api/vscuApi';
import { useAuth } from '../context/AuthContext';

const TAX_RATES = { A: 0, B: 0.16, C: 0 };

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

  useEffect(() => {
    fetchData();
    checkVSCU();
    const i = setInterval(checkVSCU, 15000);
    return () => clearInterval(i);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [i, s] = await Promise.all([
        getItems().catch(() => ({ data: [] })),
        getSales().catch(() => ({ data: [] })),
      ]);
      setItems(i.data || []);
      setSales((s.data || []).sort((a, b) =>
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
    const total = Math.max(0, subtotal - disc);

    return {
      invoice_no: invoice,
      customer: customer.trim() || 'Walk-in Customer',
      customer_pin: customerPin.trim() || '',
      cashier: user?.full_name || user?.username || 'Unknown',
      subtotal, tax, total,
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
  };

  const getInvoice = async () => {
    try {
      const r = await getNextInvoice();
      return r.data?.invoice_no;
    } catch {
      const d = new Date();
      const ymd = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
      return `CW-${ymd}-${String(Date.now()).slice(-4)}`;
    }
  };

  const handleCash = async () => {
    if (!lines.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      const invoice = await getInvoice();
      const payload = buildPayload(invoice, 'Completed', '01');
      const res = await saveSales(payload);
      const saved = res?.data?.sale || payload;
      setCurrentSale({ ...saved, ...payload, vscu_signature: res?.data?.signature });
      setShowReceipt(true);
      resetCart();
      fetchData();
      toast.success('Sale completed');
    } catch (e) {
      toast.error('Failed to save sale');
    } finally { setSaving(false); }
  };

  const handleQR = async () => {
    if (!lines.length) return toast.error('Add at least one item');
    setSaving(true);
    try {
      const invoice = await getInvoice();
      const payload = buildPayload(invoice, 'Pending', '03');
      const res = await saveSales(payload);
      const saved = res?.data?.sale || payload;
      const saleId = res?.data?.saleId || saved.id;
      await createQRSession({
        invoice_no: invoice,
        amount: payload.total,
        sale_id: saleId,
      });
      setQrSession({ invoice, amount: payload.total, sale: { ...saved, ...payload } });
      resetCart();
      fetchData();
    } catch (e) {
      toast.error('Failed to create QR session');
    } finally { setSaving(false); }
  };

  const handleMarkPaid = async (invoice) => {
    if (!qrSession) return;
    try {
      await confirmPayment(invoice, 'cash');
      setCurrentSale({ ...qrSession.sale, status: 'Completed', payment_method: '01' });
      setQrSession(null);
      setShowReceipt(true);
      fetchData();
      toast.success('Marked as paid');
    } catch { toast.error('Failed to confirm'); }
  };

  const handleSTK = async (invoice, phone) => {
    const r = await stkPush(invoice, phone);
    return r.data;
  };

  const handlePoll = async (invoice) => {
    const r = await pollPaymentStatus(invoice);
    return r.data;
  };

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 space-y-4">
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm px-5 py-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#1a2a4a]">Point of Sale</h1>
          <p className="text-xs text-slate-400">Select services, add to cart, complete payment</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg border border-slate-200">
          <span className={`w-2 h-2 rounded-full ${vscuOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <span className="text-xs font-medium text-slate-600">VSCU {vscuOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 h-[calc(100vh-220px)] min-h-125">
          <ServiceGrid items={items} onAdd={addToCart} />
        </div>
        <div className="flex flex-col gap-3 h-[calc(100vh-220px)] min-h-125">
          <div className="flex-1 min-h-0">
            <Cart
              lines={lines}
              onQty={handleQty}
              onRemove={handleRemove}
              discount={discount}
              setDiscount={setDiscount}
              customer={customer}
              setCustomer={setCustomer}
            />
          </div>
          <PaymentBar
            total={total}
            disabled={!lines.length || saving}
            onCash={handleCash}
            onQR={handleQR}
          />
        </div>
      </div>

      <RecentSalesPanel
        sales={sales}
        loading={loading}
        onRetry={() => {}}
        onDownloadReceipt={() => {}}
      />

      {qrSession && (
        <QRPaymentModal
          invoice={qrSession.invoice}
          amount={qrSession.amount}
          onMarkPaid={handleMarkPaid}
          onCancel={() => setQrSession(null)}
          onStkPush={handleSTK}
          onPoll={handlePoll}
        />
      )}

      {showReceipt && currentSale && (
        <ThermalReceipt
          sale={currentSale}
          onClose={() => { setShowReceipt(false); setCurrentSale(null); }}
        />
      )}
    </div>
  );
};

export default Sales;