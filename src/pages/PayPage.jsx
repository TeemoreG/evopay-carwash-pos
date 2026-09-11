import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getPublicPayment, stkPush, pollPaymentStatus } from '../api/vscuApi';

const MPESA_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789068986/MWMP_gf84uc.svg';
const AIRTEL_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789069305/330201734627_amm_c0dzym.jpg';
const CARD_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789069363/visa-mastercard-logos_mpvf6q.jpg';

const PayPage = () => {
  const { invoice } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('mpesa');
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [status, setStatus] = useState('idle');
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await getPublicPayment(invoice);
        setSession(r.data);
      } catch {
        toast.error('Payment not found');
      } finally { setLoading(false); }
    };
    load();
  }, [invoice]);

  useEffect(() => {
    if (status !== 'processing') return;
    const i = setInterval(async () => {
      try {
        const r = await pollPaymentStatus(invoice);
        if (r.data?.status === 'completed') { setStatus('completed'); clearInterval(i); }
        else if (r.data?.status === 'failed') { setStatus('failed'); clearInterval(i); }
      } catch {}
    }, 3000);
    return () => clearInterval(i);
  }, [status, invoice]);

  const handlePay = async () => {
    if (!/^0?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) return toast.error('Enter valid phone');
    setPushing(true);
    try {
      await stkPush(invoice, phone);
      setStatus('processing');
      toast.info('Check your phone for the prompt');
    } catch {
      toast.error('Payment failed');
    } finally { setPushing(false); }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc]">
      <div className="h-10 w-10 border-4 border-[#f47b20]/30 border-t-[#f47b20] rounded-full animate-spin"></div>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <p className="text-slate-500">Payment link not found or expired</p>
      </div>
    </div>
  );

  if (session.status === 'completed') return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8fafc] p-4">
      <div className="bg-white rounded-2xl shadow p-8 text-center max-w-sm">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#1a2a4a]">Payment Received</h2>
        <p className="text-sm text-slate-500 mt-1">Thank you!</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">
        <div className="bg-[#1a2a4a] px-6 py-5 text-white">
          <h1 className="text-lg font-bold">Evopay Car Wash</h1>
          <p className="text-xs text-white/60 mt-0.5">Invoice {invoice}</p>
          <p className="text-3xl font-extrabold text-[#f47b20] mt-3">
            KES {Number(session.amount).toLocaleString()}
          </p>
        </div>

        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
            Select Payment Method
          </p>
          <div className="grid grid-cols-3 gap-2 mb-5">
            {[
              { id: 'mpesa', src: MPESA_ICON, label: 'M-Pesa' },
              { id: 'airtel', src: AIRTEL_ICON, label: 'Airtel' },
              { id: 'card', src: CARD_ICON, label: 'Card' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`p-2.5 rounded-lg border-2 transition flex flex-col items-center gap-1.5 ${
                  method === m.id ? 'border-[#f47b20] bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <img src={m.src} alt={m.label} className="h-8 object-contain" />
                <span className="text-[10px] font-semibold text-slate-600">{m.label}</span>
              </button>
            ))}
          </div>

          {method !== 'card' ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="0712 345 678"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">KRA PIN (optional)</label>
                <input
                  type="text"
                  value={kraPin}
                  onChange={e => setKraPin(e.target.value.toUpperCase())}
                  placeholder="A123456789Z"
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
                />
              </div>
              <button
                onClick={handlePay}
                disabled={pushing || !phone || status === 'processing'}
                className="w-full bg-[#f47b20] hover:bg-[#e06d1a] text-white py-3 rounded-lg font-bold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {pushing || status === 'processing' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                    </svg>
                    Waiting for PIN...
                  </>
                ) : `Pay KES ${Number(session.amount).toLocaleString()}`}
              </button>
              {status === 'completed' && <p className="text-center text-sm text-emerald-600 font-semibold">✓ Payment received</p>}
              {status === 'failed' && <p className="text-center text-sm text-rose-600 font-semibold">Payment failed — try again</p>}
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center">
              <img src={CARD_ICON} alt="Visa/Mastercard" className="h-10 mx-auto mb-2 object-contain" />
              <p className="text-xs text-slate-500">Card payments coming soon</p>
            </div>
          )}
        </div>

        <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">Powered by Evopay • KRA eTIMS Compliant</p>
        </div>
      </div>
    </div>
  );
};

export default PayPage;