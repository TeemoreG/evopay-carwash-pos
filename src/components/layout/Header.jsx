import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import evopayLogo from '../../assets/evopay-logo.png';

const Header = ({ setSidebarOpen, sidebarOpen }) => {
  const { tin, bhfId, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleLogout = () => {
    setMenuOpen(false);
    logout();
    navigate('/login');
  };

  const goTo = (path) => {
    setMenuOpen(false);
    navigate(path);
  };

  return (
    <header className="bg-[#1a2a4a] text-white px-4 md:px-6 py-3 md:py-4 grid grid-cols-[auto_1fr_auto] items-center shadow-md border-b border-white/10 w-full sticky top-0 z-40">

      {/* Left - Hamburger */}
      <div className="flex items-center">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="text-white text-2xl md:text-3xl hover:text-[#f47b20] transition md:hidden p-1"
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
      </div>

      {/* Center - Brand */}
      <div className="flex items-center justify-center gap-2 md:gap-3">
        <img
          src={evopayLogo}
          alt="Evopay Car Wash"
          className="h-8 md:h-12 w-auto object-contain"
          onError={(e) => {
            e.target.style.display = 'none';
            const parent = e.target.parentNode;
            const fallback = document.createElement('span');
            fallback.className = 'text-xl font-bold text-[#f47b20]';
            fallback.textContent = 'Evopay';
            parent.appendChild(fallback);
          }}
        />
        <div className="hidden sm:block border-l border-white/20 pl-2 md:pl-3">
          <h1 className="text-white font-bold text-xs md:text-base leading-tight tracking-wide">
            CAR WASH POS
          </h1>
          <span className="text-[8px] md:text-[10px] text-white/50 font-medium">
            KRA eTIMS Compliant
          </span>
        </div>
      </div>

      {/* Right - Account Menu */}
      <div className="flex items-center justify-end" ref={menuRef}>
        <div className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/10 px-3 py-1.5 rounded-lg transition text-xs font-medium"
            aria-label="Account menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="hidden sm:inline">Account</span>
            <svg
              className={`w-3 h-3 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white text-slate-700 rounded-xl shadow-xl border border-slate-200 overflow-hidden z-50">
              {/* Account info */}
              <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Account
                </p>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">TIN</span>
                  <span className="font-mono font-medium text-[#1a2a4a]">{tin || 'Not Set'}</span>
                </div>
                <div className="flex justify-between items-center text-xs mt-1.5">
                  <span className="text-slate-500">Branch</span>
                  <span className="font-mono font-medium text-[#1a2a4a]">{bhfId || '00'}</span>
                </div>
              </div>

              {/* Links */}
              <div className="py-1">
                <button
                  onClick={() => goTo('/branches')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition text-left"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  <span>Branches</span>
                </button>

                <button
                  onClick={() => goTo('/data')}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50 transition text-left"
                >
                  <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                  </svg>
                  <span>Data Management</span>
                </button>
              </div>

              {/* Logout */}
              <div className="border-t border-slate-100">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50 transition text-left"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;