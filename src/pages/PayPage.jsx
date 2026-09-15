import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { getPublicPayment, stkPush, pollPaymentStatus } from '../api/vscuApi';

const MPESA_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789068986/MWMP_gf84uc.svg';
const AIRTEL_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789463153/422-4221364_send-cash-to-ghana-airtel-logo-new-hd_scmhh9.png';
const CARD_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789069363/visa-mastercard-logos_mpvf6q.jpg';

const formatTime = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const PayPage = () => {
  const { invoice } = useParams();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState('mpesa');
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [status, setStatus] = useState('idle');
  const [pushing, setPushing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(null);
  const [cooldown, setCooldown] = useState(0);
  const [showItems, setShowItems] = useState(false);
  const pollRef = useRef(null);

  // Load session
  useEffect(() => {
    const load = async () => {
      try {
        const r = await getPublicPayment(invoice);
        setSession(r.data);
        if (r.data?.expires_at) {
          const remaining = Math.max(0, Math.floor((new Date(r.data.expires_at) - Date.now()) / 1000));
          setSecondsLeft(remaining);
        }
      } catch {
        toast.error('Payment not found');
      } finally { setLoading(false); }
    };
    load();
  }, [invoice]);

  // Countdown timer
  useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const i = setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, [secondsLeft !== null && secondsLeft > 0]);

  // Poll payment status while processing
  useEffect(() => {
    if (status !== 'processing') return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await pollPaymentStatus(invoice);
        if (r.data?.status === 'completed') { setStatus('completed'); clearInterval(pollRef.current); }
        else if (r.data?.status === 'failed' || r.data?.status === 'cancelled') { setStatus('failed'); clearInterval(pollRef.current); }
      } catch {}
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [status, invoice]);

  // STK cooldown
  useEffect(() => {
    if (cooldown <= 0) return;
    const i = setInterval(() => setCooldown(c => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(i);
  }, [cooldown > 0]);

  const handlePay = async () => {
    if (!/^0?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) return toast.error('Enter a valid phone number');
    if (cooldown > 0) return;
    setPushing(true);
    try {
      await stkPush(invoice, phone);
      setStatus('processing');
      setCooldown(30);
      toast.info('Check your phone for the M-Pesa prompt');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Payment failed — try again');
      setStatus('failed');
    } finally { setPushing(false); }
  };

  const handleCopyInvoice = async () => {
    try {
      await navigator.clipboard.writeText(invoice);
      setCopied(true);
      toast.success('Invoice copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy failed');
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return toast.info('Share not supported on this device');
    try {
      await navigator.share({
        title: `Car Wash — Invoice ${invoice}`,
        text: `Pay KES ${Number(session.amount).toLocaleString()} for invoice ${invoice}`,
        url: window.location.href,
      });
    } catch {}
  };

  const isExpired = secondsLeft !== null && secondsLeft === 0 && session?.status === 'pending';
  const isCompleted = session?.status === 'completed' || status === 'completed';
  const isBusy = pushing || status === 'processing';

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8fafc] to-[#eef2f7]">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 border-4 border-[#f47b20]/20 border-t-[#f47b20] rounded-full animate-spin"></div>
        <p className="text-xs text-slate-400">Loading payment...</p>
      </div>
    </div>
  );

  if (!session) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8fafc] to-[#eef2f7] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-[#1a2a4a]">Payment not found</h2>
        <p className="text-sm text-slate-500 mt-1">This payment link is invalid or has expired.</p>
        <p className="text-xs text-slate-400 mt-4">Ask the cashier to regenerate the QR.</p>
      </div>
    </div>
  );

  if (isCompleted) return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-[#f8fafc] to-[#eef2f7] p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm w-full">
        <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-[#1a2a4a]">Payment Received</h2>
        <p className="text-sm text-slate-500 mt-1">Thank you!</p>
        <p className="text-2xl font-extrabold text-[#f47b20] mt-4">KES {Number(session.amount).toLocaleString()}</p>
        <p className="text-xs text-slate-400 mt-1">Invoice {invoice}</p>
        {navigator.share && (
          <button
            onClick={handleShare}
            className="mt-6 w-full border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            Share Receipt Link
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] to-[#eef2f7] flex items-start sm:items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-lg max-w-md w-full overflow-hidden">

        {/* Header */}
        <div className="bg-[#1a2a4a] px-5 sm:px-6 py-5 text-white relative">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">  Car Wash</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <p className="text-xs text-white/60 font-mono truncate">{invoice}</p>
                <button
                  onClick={handleCopyInvoice}
                  className="text-white/40 hover:text-white/90 transition p-0.5"
                  title="Copy invoice"
                >
                  {copied ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Expiry badge */}
            {secondsLeft !== null && !isCompleted && (
              <div className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-md ${
                isExpired ? 'bg-rose-500/20 text-rose-300' : 'bg-white/10 text-white/70'
              }`}>
                {isExpired ? 'EXPIRED' : `Expires ${formatTime(secondsLeft)}`}
              </div>
            )}
          </div>

          <p className="text-[10px] text-white/50 uppercase tracking-widest mt-4">Amount Due</p>
          <p className="text-3xl sm:text-4xl font-extrabold text-[#f47b20] mt-1">
            KES {Number(session.amount).toLocaleString()}
          </p>

          {/* Progress steps */}
          <div className="flex items-center gap-2 mt-4">
            <StepDot active done label="Method" />
            <div className={`flex-1 h-0.5 rounded ${method ? 'bg-[#f47b20]' : 'bg-white/20'}`}></div>
            <StepDot active={!!phone || method === 'card'} label="Details" />
            <div className={`flex-1 h-0.5 rounded ${phone || method === 'card' ? 'bg-[#f47b20]' : 'bg-white/20'}`}></div>
            <StepDot active={isBusy || isCompleted} label="Pay" />
          </div>
        </div>

        {/* Body */}
        <div className="p-5 sm:p-6">

          {isExpired ? (
            <div className="text-center py-4">
              <div className="w-12 h-12 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-bold text-[#1a2a4a]">Session expired</p>
              <p className="text-xs text-slate-500 mt-1">Please ask the cashier to generate a new QR.</p>
            </div>
          ) : (
            <>
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
                  {method === 'mpesa' && (
                    <div className="bg-emerald-50 border border-emerald-100 text-emerald-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Enter your M-Pesa number. You'll receive a prompt to enter your PIN.</span>
                    </div>
                  )}

                  {method === 'airtel' && (
                    <div className="bg-red-50 border border-red-100 text-red-800 text-xs rounded-lg p-2.5 flex items-start gap-2">
                      <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Airtel Money is coming soon. Please use M-Pesa for now.</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Phone Number</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">+254</span>
                      <input
                        type="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value.replace(/[^\d\s]/g, ''))}
                        placeholder="712 345 678"
                        disabled={isBusy || method === 'airtel'}
                        className="w-full pl-14 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20] focus:border-transparent disabled:opacity-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      KRA PIN <span className="text-slate-400 font-normal">(optional — for tax receipt)</span>
                    </label>
                    <input
                      type="text"
                      value={kraPin}
                      onChange={e => setKraPin(e.target.value.toUpperCase())}
                      placeholder="P600005678A"
                      maxLength={11}
                      disabled={isBusy || method === 'airtel'}
                      className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20] focus:border-transparent disabled:opacity-50"
                    />
                  </div>

                  <button
                    onClick={handlePay}
                    disabled={isBusy || !phone || cooldown > 0 || method === 'airtel'}
                    className="w-full bg-[#f47b20] hover:bg-[#e06d1a] active:bg-[#c95e15] text-white py-3 rounded-lg font-bold text-sm transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {pushing || status === 'processing' ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                        </svg>
                        Waiting for PIN...
                      </>
                    ) : cooldown > 0 ? (
                      `Retry in ${cooldown}s`
                    ) : (
                      `Pay KES ${Number(session.amount).toLocaleString()}`
                    )}
                  </button>

                  {status === 'processing' && (
                    <div className="text-center space-y-1 pt-1">
                      <div className="flex items-center justify-center gap-2 text-sm text-amber-600 font-semibold">
                        <span className="relative flex h-2.5 w-2.5">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                        </span>
                        Waiting for PIN...
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Enter your M-Pesa PIN on your phone to complete
                      </p>
                    </div>
                  )}

                  {status === 'failed' && (
                    <div className="bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-lg p-2.5 text-center">
                      Payment failed. Check your balance and try again.
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 text-center">
                  <img src={CARD_ICON} alt="Visa/Mastercard" className="h-10 mx-auto mb-3 object-contain" />
                  <p className="text-sm font-semibold text-slate-700">Card payments coming soon</p>
                  <p className="text-xs text-slate-500 mt-1">Please use M-Pesa to complete this payment.</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Trust badges */}
        <div className="px-5 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Secured
          </div>
          <div className="h-3 w-px bg-slate-200"></div>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <svg className="w-3.5 h-3.5 text-[#f47b20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            KRA eTIMS Compliant
          </div>
        </div>

        <div className="px-5 sm:px-6 py-3 bg-white border-t border-slate-100 text-center">
          <p className="text-[10px] text-slate-400">Powered by Evopay</p>
        </div>
      </div>
    </div>
  );
};

// Small helper component for step indicator
const StepDot = ({ active, done, label }) => (
  <div className="flex items-center gap-1.5">
    <div className={`w-2 h-2 rounded-full transition ${done ? 'bg-[#f47b20]' : active ? 'bg-[#f47b20] ring-2 ring-[#f47b20]/30' : 'bg-white/30'}`}></div>
    <span className={`text-[9px] uppercase tracking-wider font-bold ${active || done ? 'text-white/90' : 'text-white/40'}`}>
      {label}
    </span>
  </div>
);

export default PayPage;