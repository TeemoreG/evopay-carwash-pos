import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';

const QRPaymentModal = ({ invoice, amount, onMarkPaid, onCancel, onStkPush, onPoll }) => {
  const [qr, setQr] = useState(null);
  const [showStk, setShowStk] = useState(false);
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('pending');
  const [pushing, setPushing] = useState(false);
  const pollRef = useRef(null);

  const safeAmount = Number(amount) || 0;
  const payUrl = `${import.meta.env.VITE_PAYMENT_BASE_URL || 'http://localhost:5173'}/pay/${invoice}`;

  useEffect(() => {
    if (!invoice) return;
    QRCode.toDataURL(payUrl, { width: 240, margin: 2 })
      .then(setQr)
      .catch(() => toast.error('QR failed'));
  }, [payUrl, invoice]);

  useEffect(() => {
    if (!onPoll || !invoice) return;
    pollRef.current = setInterval(async () => {
      try {
        const r = await onPoll(invoice);
        if (r?.status === 'completed') {
          setStatus('completed');
          clearInterval(pollRef.current);
          toast.success('Payment confirmed!');
          setTimeout(() => onMarkPaid(invoice), 800);
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
      toast.error('STK push failed');
    } finally { setPushing(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-[#1a2a4a]">Payment</h2>
            <p className="text-xs text-slate-400">{invoice}</p>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="text-center mb-4">
          <div className="inline-block p-3 bg-white border-2 border-slate-200 rounded-xl">
            {qr ? <img src={qr} alt="QR" className="w-48 h-48" /> :
              <div className="w-48 h-48 flex items-center justify-center text-slate-400 text-sm">Loading...</div>}
          </div>
          <p className="text-2xl font-bold text-[#f47b20] mt-3">
            KES {safeAmount.toLocaleString()}
          </p>
          <p className="text-xs text-slate-500 mt-1">Customer scans to pay</p>
        </div>

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
              <span className="text-xs text-slate-400 font-medium">STK PUSH</span>
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
              className="w-full bg-[#f47b20] hover:bg-[#e06d1a] text-white py-2.5 rounded-lg font-semibold text-sm transition disabled:opacity-50 flex items-center justify-center gap-2"
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
              className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
            >
              Hide
            </button>
          </div>
        )}

        {status !== 'pending' && (
          <div className={`mt-3 text-center text-xs font-medium ${
            status === 'completed' ? 'text-emerald-600' :
            status === 'failed' ? 'text-rose-600' : 'text-amber-600'
          }`}>
            {status === 'completed' && 'Payment confirmed'}
            {status === 'failed' && 'Payment failed — try again'}
            {status === 'processing' && 'Waiting for PIN...'}
          </div>
        )}

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