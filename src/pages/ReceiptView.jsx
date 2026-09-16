import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import axiosInstance from '../api/axiosConfig';
import { generateSoftCopyReceipt } from '../utils/softCopyReceipt';

const ReceiptView = () => {
  const { invoice } = useParams();
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await axiosInstance.get(`/api/receipts/${invoice}`);
        setSale(r.data);
      } catch (e) {
        setError(e.response?.status === 404 ? 'Receipt not found' : 'Failed to load receipt');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [invoice]);

  const handleViewPdf = async () => {
    if (!sale) return;
    setOpening(true);
    try {
      const doc = await generateSoftCopyReceipt(sale);
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) {
      console.error('PDF open failed:', e);
      toast.error('Could not open receipt');
    } finally {
      setOpening(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="h-10 w-10 border-4 border-[#f47b20]/30 border-t-[#f47b20] rounded-full animate-spin"></div>
    </div>
  );

  if (error || !sale) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#1a2a4a]">{error || 'Not found'}</h2>
        <p className="text-sm text-slate-500 mt-1">Check the link or contact the business.</p>
      </div>
    </div>
  );

  const signed = sale.synced === 1 && !!sale.vscu_signature;
  const paymentLabel =
    sale.payment_method === '01' ? 'Cash' :
    sale.payment_method === '03' ? 'M-Pesa' :
    sale.payment_method === '02' ? 'Card' :
    sale.payment_method || '—';

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#eef2f7] p-3 sm:p-4 flex items-start sm:items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">

        <div className="bg-[#1a2a4a] px-5 py-4 text-white text-center">
          <h1 className="text-lg font-bold">Evopay Car Wash</h1>
          <p className="text-xs text-white/60 mt-0.5">eTIMS Compliant Receipt</p>
        </div>

        <div className="p-5 sm:p-6 space-y-4">

          <div className="text-center">
            <p className="text-xs text-slate-400 uppercase tracking-widest">Invoice</p>
            <p className="font-mono font-bold text-[#1a2a4a] text-base">{sale.invoice_no}</p>
            <p className="text-3xl font-extrabold text-[#f47b20] mt-2">
              KES {Number(sale.total || 0).toLocaleString()}
            </p>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-4 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">Customer</span>
              <span className="font-medium text-slate-700">{sale.customer || 'Walk-in'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cashier</span>
              <span className="font-medium text-slate-700">{sale.cashier || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Date</span>
              <span className="font-medium text-slate-700">
                {new Date(sale.created_at || sale.date).toLocaleString('en-KE')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Payment</span>
              <span className="font-medium text-slate-700">{paymentLabel}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-4">
            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Items</p>
            <div className="space-y-2">
              {(sale.items || []).map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-700 truncate">{item.item_name}</p>
                    <p className="text-[10px] text-slate-400">
                      {item.quantity} x {Number(item.price).toLocaleString()}
                    </p>
                  </div>
                  <span className="font-semibold text-slate-800 ml-2">
                    KES {Number(item.total).toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200 pt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">Subtotal</span>
              <span>KES {Number(sale.subtotal || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">VAT (16%)</span>
              <span>KES {Number(sale.tax || 0).toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-[#1a2a4a] text-base pt-1">
              <span>Total</span>
              <span>KES {Number(sale.total || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="text-center text-xs pt-2">
            {signed
              ? <span className="text-emerald-700 font-semibold">KRA eTIMS Verified</span>
              : <span className="text-amber-600 font-semibold">Pending eTIMS sync</span>}
          </div>

          <button
            onClick={handleViewPdf}
            disabled={opening}
            className="w-full text-center bg-[#f47b20] hover:bg-[#e06d1a] text-white py-3 rounded-lg font-bold text-sm transition disabled:opacity-60"
          >
            {opening ? 'Opening...' : 'View PDF Receipt'}
          </button>
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">Powered by Evopay - KRA eTIMS Compliant</p>
        </div>
      </div>
    </div>
  );
};

export default ReceiptView;