import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import evopayLogo from '../assets/log2.png';
import axiosInstance from '../api/axiosConfig';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);
  const [lockoutUntil, setLockoutUntil] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [serverOnline, setServerOnline] = useState(null);
  const [now, setNow] = useState(new Date());

  const usernameRef = useRef(null);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    const saved = localStorage.getItem('evopay_last_user');
    if (saved) {
      setUsername(saved);
      setRememberMe(true);
    }
    usernameRef.current?.focus();
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const ping = async () => {
      try {
        await axiosInstance.get('/api/health', { timeout: 4000 });
        if (!cancelled) setServerOnline(true);
      } catch {
        if (!cancelled) setServerOnline(false);
      }
    };
    ping();
    const t = setInterval(ping, 30000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const handleKeyEvent = (e) => {
    if (typeof e.getModifierState === 'function') {
      setCapsLock(e.getModifierState('CapsLock'));
    }
  };

  const lockRemaining = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (lockRemaining > 0) return;
    setError('');
    setLoading(true);

    try {
      const response = await axiosInstance.post('/api/users/login', {
        username,
        password,
      });

      if (response.data && response.data.success) {
        const userData = response.data.user;
        const tin = import.meta.env.VITE_VSCU_TIN;
        const bhfId = import.meta.env.VITE_VSCU_BHF_ID;
        const cmcKey = localStorage.getItem('cmcKey') || 'local-dev-key';

        if (rememberMe) {
          localStorage.setItem('evopay_last_user', username);
        } else {
          localStorage.removeItem('evopay_last_user');
        }

        login(tin, bhfId, null, cmcKey, {
          user_id: userData.user_id,
          user_name: userData.user_name,
          username: userData.user_name,
          full_name: userData.full_name || userData.user_name,
          role: userData.role || 'cashier',
        });
        navigate('/');
      } else {
        setError('Invalid username or password.');
        bumpAttempts();
      }
    } catch (err) {
      console.error('Login error:', err);
      setError(err.response?.data?.error || 'Invalid username or password.');
      bumpAttempts();
    } finally {
      setLoading(false);
    }
  };

  const bumpAttempts = () => {
    const next = attempts + 1;
    setAttempts(next);
    if (next >= 3) {
      setLockoutUntil(Date.now() + 10000);
      setAttempts(0);
    }
  };

  const features = [
    {
      title: 'KRA eTIMS Certified',
      desc: 'Every sale is signed and verified with KRA in real time.',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      title: 'M-Pesa Payments',
      desc: 'Dynamic QR, STK push, and instant payment confirmation.',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
    },
    {
      title: 'Fast Checkout',
      desc: 'Walk-in services and retail products in one cart.',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
    },
    {
      title: 'Instant Receipts',
      desc: 'Thermal print, PDF download, and SMS delivery.',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f6fa] p-4 relative overflow-hidden">
      {/* Brand bubbles (light) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#f47b20] opacity-[0.08] blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-24 w-[500px] h-[500px] rounded-full bg-[#f47b20] opacity-[0.06] blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/3 right-10 w-40 h-40 rounded-full bg-[#1a2a4a] opacity-[0.05] blur-2xl animate-pulse" style={{ animationDuration: '4s' }} />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-6 items-center">
        {/* ---- Info / Features column (desktop) ---- */}
        <div className="hidden lg:block">
          <div className="mb-6">
            {!logoError ? (
              <img
                src={evopayLogo}
                alt="Evopay"
                onError={() => setLogoError(true)}
                className="h-16 object-contain"
              />
            ) : (
              <div className="h-16 w-16 rounded-2xl bg-[#f47b20] flex items-center justify-center font-bold text-white text-2xl">E</div>
            )}
          </div>

          <h2 className="text-4xl font-bold text-[#1a2a4a] leading-tight mb-3">
            Fast. Compliant.<br />
            <span className="text-[#f47b20]">Ready to wash.</span>
          </h2>
          <p className="text-gray-500 text-sm mb-8 max-w-md">
            Walk-in car wash point of sale with KRA eTIMS tax compliance and M-Pesa payments built in.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {features.map((f) => (
              <div key={f.title} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition">
                <div className="w-9 h-9 rounded-lg bg-[#f47b20]/10 text-[#f47b20] flex items-center justify-center mb-3">
                  {f.icon}
                </div>
                <div className="font-semibold text-[#1a2a4a] text-sm mb-1">{f.title}</div>
                <div className="text-xs text-gray-500 leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-4 text-xs text-gray-400">
            <span>KRA eTIMS VSCU v2.0.21</span>
            <span className="w-1 h-1 rounded-full bg-gray-300" />
            <span>Powered by Evopay</span>
          </div>
        </div>

        {/* ---- Login card ---- */}
        <div className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-8 sm:p-10">
          <div className="text-center mb-8">
            <div className="lg:hidden flex justify-center mb-4">
              {!logoError ? (
                <img
                  src={evopayLogo}
                  alt="Evopay"
                  onError={() => setLogoError(true)}
                  className="h-20 object-contain"
                />
              ) : (
                <div className="h-20 w-20 rounded-2xl bg-[#f47b20] flex items-center justify-center font-bold text-white text-3xl">E</div>
              )}
            </div>
            <h1 className="text-2xl font-bold text-[#1a2a4a]">Car Wash POS</h1>
            <p className="text-sm mt-1 text-gray-500">Sign in to continue</p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2.5 rounded-lg mb-4 text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {lockRemaining > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-lg mb-4 text-sm">
              Too many attempts. Try again in <strong>{lockRemaining}s</strong>.
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Username</label>
                <input
                  ref={usernameRef}
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent outline-none transition bg-white text-gray-900 placeholder-gray-400"
                  placeholder="Enter your username"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-gray-700">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyUp={handleKeyEvent}
                    onKeyDown={handleKeyEvent}
                    autoComplete="current-password"
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent outline-none pr-11 transition bg-white text-gray-900 placeholder-gray-400"
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                      </svg>
                    )}
                  </button>
                </div>
                {capsLock && (
                  <div className="mt-1.5 text-xs text-amber-600 flex items-center gap-1">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.5 0L3.16 16.25A2 2 0 005 19z" />
                    </svg>
                    Caps Lock is on
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none text-gray-700">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-[#f47b20] focus:ring-[#f47b20]"
                  />
                  Remember me
                </label>
              </div>

              <button
                type="submit"
                disabled={loading || lockRemaining > 0}
                className="w-full bg-[#f47b20] hover:bg-[#e06d1a] active:bg-[#c95f15] text-white py-2.5 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                    </svg>
                    Signing in...
                  </>
                ) : (
                  <>
                    Sign In
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>

          <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between text-xs">
            <span className="text-gray-500">v1.0.0</span>
            <div className="flex items-center gap-4">
              <span className="text-gray-500">
                {now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Nairobi' })}
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${
                  serverOnline === null ? 'bg-gray-400 animate-pulse'
                  : serverOnline ? 'bg-green-500' : 'bg-red-500'
                }`} />
                <span className="text-gray-500">
                  {serverOnline === null ? 'Checking...' : serverOnline ? 'Online' : 'Offline'}
                </span>
              </span>
            </div>
          </div>

          {/* ---- Mobile feature strip (hidden on desktop) ---- */}
          <div className="lg:hidden mt-6 pt-5 border-t border-gray-100">
            <div className="text-[11px] font-semibold text-[#1a2a4a] uppercase tracking-wider mb-3 text-center">
              What you get
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {features.map((f) => (
                <div key={f.title} className="flex items-start gap-2 bg-[#f5f6fa] rounded-lg p-2.5">
                  <div className="w-7 h-7 rounded-md bg-[#f47b20]/15 text-[#f47b20] flex items-center justify-center flex-shrink-0">
                    {f.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-[#1a2a4a] text-[11px] leading-tight">{f.title}</div>
                    <div className="text-[10px] text-gray-500 leading-tight mt-0.5">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-gray-400">
              <span>KRA eTIMS VSCU v2.0.21</span>
              <span className="w-1 h-1 rounded-full bg-gray-300" />
              <span>Powered by Evopay</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;