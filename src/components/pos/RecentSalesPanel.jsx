import { useState } from 'react';
import SalesHistory from '../sales/SalesHistory';

const RecentSalesPanel = ({ sales, loading, onRetry, onDownloadReceipt }) => {
  const [open, setOpen] = useState(false);
  const recent = sales.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-[#1a2a4a]">Recent Sales</h3>
          <span className="text-xs text-slate-400">({sales.length})</span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-slate-100 p-3">
          <SalesHistory
            sales={recent}
            loading={loading}
            onRetry={onRetry}
            onDownloadReceipt={onDownloadReceipt}
          />
        </div>
      )}
    </div>
  );
};

export default RecentSalesPanel;