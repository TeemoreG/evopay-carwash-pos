import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import { generateMpesaQR } from '../../api/vscuApi';
import axiosInstance from '../../api/axiosConfig';

const QRPaymentModal = ({ invoice, amount, saleId, onMarkPaid, onCancel, onStkPush, onPoll }) => {
  const [mode, setMode] = useState('mpesa');           // 'mpesa' | 'custom'
  const [mpesaQr, setMpesaQr] = useState(null);
  const [customQr, setCustomQr] = useState(null);
  const [loadingMpesa, setLoadingMpesa] = useState(true);
  const [loadingCustom, setLoadingCustom] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const [showStk, setShowStk] = useState(false);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('pending');
  const [pushing, setPushing] = useState(false);
  const pollRef = useRef(null);
  const timerRef = useRef(null);

  const safeAmount = Number(amount) || 0;

  // Elapsed timer for loading feedback
  useEffect(() => {
    if (mode === 'mpesa' && loadingMpesa) {
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => clearInterval(timerRef.current);
  }, [mode, loadingMpesa]);

  // Fetch M-Pesa Dynamic QR on mount (once)
  useEffect(() => {
    if (!invoice) return;
    let cancelled = false;
    setLoadingMpesa(true);
    setError(null);

    generateMpesaQR(invoice, safeAmount)
      .then((r) => {
        if (cancelled) return;
        const b64 = r.data?.qr_base64;
        if (b64) {
          setMpesaQr(`data:image/png;base64,${b64}`);
          toast.success('M-Pesa QR ready');
        } else {
          setError('No QR returned from Safaricom');
          toast.error('M-Pesa QR unavailable');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError('M-Pesa QR failed to generate');
        toast.error('M-Pesa QR failed — switch to Custom QR');
      })
      .finally(() => !cancelled && setLoadingMpesa(false));

    return () => { cancelled = true; };
  }, [invoice, safeAmount]);

  // Fetch custom QR only when user switches to that tab
  useEffect(() => {
    if (mode !== 'custom' || customQr || !invoice) return;
    let cancelled = false;
    setLoadingCustom(true);

    axiosInstance.get(`/api/pay/qr/custom/${invoice}`)
      .then((r) => {
        if (cancelled) return;
        if (r.data?.qr_data_url) {
          setCustomQr(r.data.qr_data_url);
        } else {
          setError('Custom QR failed');
        }
      })
      .catch((e) => {
        if (cancelled) return;
        console.error(e);
        setError('Custom QR failed');
      })
      .finally(() => !cancelled && setLoadingCustom(false));

    return () => { cancelled = true; };
  }, [mode, invoice, customQr]);

  // Poll payment status
  useEffect(() => {
    if (!onPoll || !invoice) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await onPoll(invoice);
        if (r?.status === 'completed') {
          setStatus('completed');
          clearInterval(pollRef.current);
          toast.success('Payment confirmed');
          setTimeout(() => onMarkPaid(invoice), 600);
        } else if (r?.status === 'failed' || r?.status === 'cancelled') {
          setStatus('failed');
          clearInterval(pollRef.current);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [invoice, onPoll, onMarkPaid]);

  const handleStk = async () => {
    if (!/^0?[17]\d{8}$/.test(phone.replace(/\s/g, ''))) return toast.error('Enter valid phone');
    setPushing(true);
    setStatus('processing');
    try {
      await onStkPush(invoice, phone);
      toast.info('STK sent — customer enters PIN');
    } catch {
      setStatus('failed');
      toast.error('STK failed');
    } finally { setPushing(false); }
  };

  const currentQr = mode === 'mpesa' ? mpesaQr : customQr;
  const isLoading = mode === 'mpesa' ? loadingMpesa : loadingCustom;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-5 max-h-[95vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h2 className="text-lg font-bold text-[#1a2a4a]">Payment</h2>
            <p className="text-xs text-slate-400">{invoice}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 p-1">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Amount hero */}
        <div className="bg-[#1a2a4a] rounded-xl p-4 text-center mb-3">
          <p className="text-[10px] text-white/60 uppercase tracking-wider">Amount Due</p>
          <p className="text-2xl font-extrabold text-[#f47b20] mt-1">
            KES {safeAmount.toLocaleString()}
          </p>
        </div>

        {/* Mode toggle */}
        <div className="flex bg-slate-100 rounded-lg p-0.5 mb-4">
          <button
            onClick={() => setMode('mpesa')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
              mode === 'mpesa' ? 'bg-white text-[#1a2a4a] shadow-sm' : 'text-slate-500'
            }`}
          >
            M-Pesa QR
          </button>
          <button
            onClick={() => setMode('custom')}
            className={`flex-1 py-2 text-xs font-semibold rounded-md transition ${
              mode === 'custom' ? 'bg-white text-[#1a2a4a] shadow-sm' : 'text-slate-500'
            }`}
          >
            Custom QR
          </button>
        </div>

        {/* QR display */}
        <div className="text-center mb-4">
          <div className="inline-block p-3 bg-white border-2 border-slate-200 rounded-xl relative">
            {isLoading ? (
              <div className="w-52 h-52 flex flex-col items-center justify-center gap-2">
                <svg className="w-8 h-8 animate-spin text-[#f47b20]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                </svg>
                <p className="text-[11px] text-slate-500 font-medium">
                  Generating{elapsed > 0 ? ` (${elapsed}s)` : ''}...
                </p>
                {elapsed >= 8 && (
                  <p className="text-[10px] text-slate-400 px-4">
                    Slow? Try Custom QR instead.
                  </p>
                )}
              </div>
            ) : currentQr ? (
              <img src={currentQr} alt="QR" className="w-52 h-52" />
            ) : (
              <div className="w-52 h-52 flex flex-col items-center justify-center gap-2 px-4">
                <svg className="w-8 h-8 text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-[11px] text-rose-500 font-medium text-center">{error || 'Unavailable'}</p>
                <button
                  onClick={() => setMode('custom')}
                  className="mt-1 text-[10px] font-semibold text-[#f47b20] hover:underline"
                >
                  Try Custom QR →
                </button>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            {mode === 'mpesa' ? 'Scan with M-Pesa app' : 'Scan with any camera'}
          </p>
        </div>

        {/* STK Push toggle */}
        {!showStk ? (
          <button
            onClick={() => setShowStk(true)}
            className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 rounded-lg text-sm font-semibold transition"
          >
            Send STK Push Instead
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">STK Push</span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="07XX XXX XXX"
              disabled={pushing || status === 'processing'}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
            />
            <button
              onClick={handleStk}
              disabled={pushing || !phone || status === 'processing'}
              className="w-full bg-[#f47b20] hover:bg-[#e06d1a] text-white py-2.5 rounded-lg font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {pushing || status === 'processing' ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                  </svg>
                  Waiting for PIN...
                </>
              ) : 'Prompt Customer'}
            </button>
            <button
              onClick={() => setShowStk(false)}
              className="w-full text-[10px] text-slate-400 hover:text-slate-600 py-1"
            >
              Hide
            </button>
          </div>
        )}

        {/* Status */}
        {status !== 'pending' && (
          <div className={`mt-3 text-center text-xs font-medium ${
            status === 'completed' ? 'text-emerald-600' :
            status === 'failed' ? 'text-rose-600' : 'text-amber-600'
          }`}>
            {status === 'completed' && 'Payment confirmed'}
            {status === 'failed' && 'Payment failed — try again'}
            {status === 'processing' && 'Waiting for customer to enter PIN...'}
          </div>
        )}

        {/* Fallback */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
          <button
            onClick={() => onMarkPaid(invoice)}
            className="flex-1 py-2 text-xs font-semibold text-[#1a2a4a] bg-slate-100 hover:bg-slate-200 rounded-lg transition"
          >
            Mark as Paid (Cash)
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default QRPaymentModal;