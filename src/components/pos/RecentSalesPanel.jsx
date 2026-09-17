import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const RecentSalesPanel = ({ sales, loading }) => {
  const navigate = useNavigate();
  const recent = sales.slice(0, 5);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-[#1a2a4a]">Recent Sales</h3>
          <p className="text-[10px] text-slate-400">Last {recent.length} of {sales.length}</p>
        </div>
        <button
          onClick={() => navigate('/sales-history')}
          className="flex items-center gap-1 text-xs font-semibold text-[#f47b20] hover:text-[#e06d1a] shrink-0"
        >
          View All
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-6">
          <div className="h-5 w-5 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : recent.length === 0 ? (
        <div className="text-center py-6 text-slate-400 text-xs">No sales yet</div>
      ) : (
        <div className="divide-y divide-slate-100">
          {recent.map((sale) => (
            <button
              key={sale.id}
              onClick={() => navigate('/sales-history')}
              className="w-full text-left px-4 py-2.5 hover:bg-slate-50 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-[#1a2a4a] truncate">
                    {sale.invoice_no}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {sale.customer || 'Walk-in'} ·{' '}
                    {new Date(sale.created_at || sale.date).toLocaleTimeString('en-KE', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: false,
                    })}
                  </p>
                </div>
                <span className="font-bold text-[#1a2a4a] text-sm whitespace-nowrap">
                  KES {(sale.total || 0).toLocaleString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentSalesPanel;