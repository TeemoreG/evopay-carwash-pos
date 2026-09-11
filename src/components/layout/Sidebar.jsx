import { NavLink, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { checkVSCUStatus } from '../../api/vscuApi';

const Sidebar = ({ sidebarOpen, setSidebarOpen }) => {
  const navigate = useNavigate();
  const [vscuOnline, setVscuOnline] = useState(false);

  useEffect(() => {
    checkVSCU();
    const interval = setInterval(checkVSCU, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const navGroups = [
    {
      label: 'Main',
      links: [
        { to: '/', label: 'Dashboard', icon: 'dashboard' },
        { to: '/sales', label: 'POS', icon: 'car', primary: true },
      ],
    },
    {
      label: 'Catalog',
      links: [
        { to: '/items', label: 'Services', icon: 'droplets' },
        { to: '/stock', label: 'Products', icon: 'package' },
        { to: '/purchases', label: 'Purchases', icon: 'purchases' },
      ],
    },
    {
      label: 'Operations',
      links: [
        { to: '/customers', label: 'Customers', icon: 'customers' },
        { to: '/reports', label: 'Reports', icon: 'reports' },
        { to: '/cashiers', label: 'Cashiers', icon: 'cashiers' },
      ],
    },
    {
      label: 'System',
      links: [
        { to: '/settings', label: 'Settings', icon: 'settings' },
      ],
    },
  ];

  const Icon = ({ name, className = 'w-4 h-4' }) => {
    const icons = {
      dashboard: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm0 10a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10-10a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zm0 10a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
      car: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 17h14M5 17a2 2 0 01-2-2v-3.5a2 2 0 011.2-1.84l1.34-.56a2 2 0 00.88-.76l1.1-1.7A2 2 0 009.34 6h5.32a2 2 0 001.82 1.14l1.1 1.7a2 2 0 00.88.76l1.34.56A2 2 0 0121 12.5V15a2 2 0 01-2 2M5 17a2 2 0 104 0m10 0a2 2 0 11-4 0" />
        </svg>
      ),
      droplets: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6h.1a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3v-6" />
        </svg>
      ),
      package: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
      purchases: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      customers: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      reports: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
      cashiers: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      ),
      settings: (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    };
    return icons[name] || icons.dashboard;
  };

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('tin');
      localStorage.removeItem('bhfId');
      localStorage.removeItem('cmcKey');
      localStorage.removeItem('token');
      navigate('/login');
    }
  };

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-50 w-55 bg-[#1a2a4a] text-white flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Mobile close only */}
        <div className="flex items-center justify-end px-4 h-14 md:h-16 border-b border-white/10">
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-white/60 hover:text-white transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {navGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.links.map((link) => (
                  <NavLink
                    key={link.to}
                    to={link.to}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                        isActive
                          ? link.primary
                            ? 'bg-[#f47b20] text-white font-semibold shadow-sm'
                            : 'bg-[#f47b20]/20 text-[#f47b20] font-medium'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <Icon name={link.icon} />
                    <span className="font-medium">{link.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Bottom */}
        <div className="border-t border-white/10 px-3 py-3 space-y-2">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-white/5 rounded-lg">
            <span className="text-[10px] font-medium text-white/50 uppercase tracking-wide">VSCU</span>
            <div className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${vscuOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
              <span className="text-[10px] font-medium text-white/70">{vscuOnline ? 'Online' : 'Offline'}</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 rounded-lg text-xs font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all duration-200 flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>

          <div className="text-center pt-1 space-y-0.5">
            <p className="text-[9px] text-white/30">Car Wash POS • KRA eTIMS</p>
            <p className="text-[9px] text-white/25">v1.0.0</p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;