import { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { toast } from 'react-toastify';

const MPESA_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789068986/MWMP_gf84uc.svg';
const AIRTEL_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789069305/330201734627_amm_c0dzym.jpg';
const CARD_ICON = 'https://res.cloudinary.com/dvqjgbdhp/image/upload/v1789069363/visa-mastercard-logos_mpvf6q.jpg';

const QRPaymentModal = ({ invoice, amount, onMarkPaid, onCancel, onStkPush, onPoll }) => {
  const [qr, setQr] = useState(null);
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [method, setMethod] = useState('mpesa');
  const [status, setStatus] = useState('pending');
  const [pushing, setPushing] = useState(false);
  const pollRef = useRef(null);

  const payUrl = `${import.meta.env.VITE_PAYMENT_BASE_URL || 'http://localhost:5173'}/pay/${invoice}`;

  useEffect(() => {
    QRCode.toDataURL(payUrl, { width: 260, margin: 2 }).then(setQr).catch(() => toast.error('QR failed'));
  }, [payUrl]);

  useEffect(() => {
    if (!onPoll) return;
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
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[95vh] overflow-y-auto">
        <div className="p-6">
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
            <p className="text-2xl font-bold text-[#f47b20] mt-3">KES {Math.round(amount).toLocaleString()}</p>
            <p className="text-xs text-slate-500 mt-1">Scan to pay</p>
          </div>

          {/* Payment method icons */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { id: 'mpesa', src: MPESA_ICON, label: 'M-Pesa' },
              { id: 'airtel', src: AIRTEL_ICON, label: 'Airtel' },
              { id: 'card', src: CARD_ICON, label: 'Card' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setMethod(m.id)}
                className={`p-2 rounded-lg border-2 transition flex flex-col items-center gap-1 ${
                  method === m.id ? 'border-[#f47b20] bg-orange-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <img src={m.src} alt={m.label} className="h-8 object-contain" />
                <span className="text-[10px] font-medium text-slate-600">{m.label}</span>
              </button>
            ))}
          </div>

          {method !== 'card' && (
            <>
              <div className="flex items-center gap-3 my-3">
                <div className="flex-1 h-px bg-slate-200"></div>
                <span className="text-xs text-slate-400 font-medium">OR STK PUSH</span>
                <div className="flex-1 h-px bg-slate-200"></div>
              </div>

              <div className="space-y-2">
                <input
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  disabled={pushing || status === 'processing'}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
                />
                <input
                  type="text"
                  value={kraPin}
                  onChange={e => setKraPin(e.target.value.toUpperCase())}
                  placeholder="KRA PIN (optional)"
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
                  ) : `Prompt ${method === 'airtel' ? 'Airtel' : 'M-Pesa'}`}
                </button>
              </div>
            </>
          )}

          {method === 'card' && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-center mb-3">
              <img src={CARD_ICON} alt="Visa/Mastercard" className="h-10 mx-auto mb-2 object-contain" />
              <p className="text-xs text-slate-500">Card payments coming soon</p>
            </div>
          )}

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

          <div className="mt-4 pt-3 border-t border-slate-100 flex gap-2">
            <button onClick={() => onMarkPaid(invoice)}
              className="flex-1 py-2 text-xs font-semibold text-[#1a2a4a] bg-slate-100 hover:bg-slate-200 rounded-lg transition">
              Mark as Paid (Cash)
            </button>
            <button onClick={onCancel}
              className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition">
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QRPaymentModal;