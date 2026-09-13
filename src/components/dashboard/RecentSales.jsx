const RecentSales = ({ sales, loading, onViewAll }) => {
  const getStatusColor = (status) => {
    const colors = {
      Completed: 'bg-emerald-100 text-emerald-700',
      Pending: 'bg-amber-100 text-amber-700',
      Cancelled: 'bg-rose-100 text-rose-700',
      Failed: 'bg-rose-100 text-rose-700',
    };
    return colors[status] || 'bg-slate-100 text-slate-700';
  };

  const formatTs = (sale) => {
    const ts = sale.created_at || sale.date;
    if (!ts) return 'N/A';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return sale.date || 'N/A';
    return d.toLocaleString('en-KE', {
      day: '2-digit', month: 'short',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-6">
        <div className="flex justify-center py-8 sm:py-12">
          <div className="h-6 w-6 sm:h-8 sm:w-8 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  const recent = sales.slice(0, 10);

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-center px-3 sm:px-5 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-base font-bold text-[#1a2a4a] truncate">Recent Sales</h2>
          <p className="text-[10px] text-slate-400 truncate">Latest transactions</p>
        </div>
        <button
          onClick={onViewAll}
          className="text-xs text-[#f47b20] hover:underline font-semibold whitespace-nowrap ml-2 shrink-0"
        >
          View All →
        </button>
      </div>

      {recent.length === 0 ? (
        <div className="text-center py-10 sm:py-14 px-4">
          <svg className="w-10 h-10 mx-auto text-slate-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <p className="text-slate-400 text-sm">No sales recorded yet</p>
        </div>
      ) : (
        <>
          {/* Mobile & tablet: card list */}
          <div className="lg:hidden divide-y divide-slate-100 max-h-125 overflow-y-auto">
            {recent.map((sale) => (
              <div key={sale.id} className="p-3 hover:bg-slate-50 transition">
                <div className="flex justify-between items-start gap-2 mb-1.5">
                  <span className="font-mono text-xs font-semibold text-[#1a2a4a] truncate">
                    {sale.invoice_no || sale.invoiceNo || 'N/A'}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shrink-0 ${getStatusColor(sale.status)}`}>
                    {sale.status || 'Pending'}
                  </span>
                </div>

                <div className="flex justify-between items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-700 truncate">
                      {sale.customer || 'Walk-in Customer'}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {formatTs(sale)}
                      {sale.cashier ? ` · ${sale.cashier}` : ''}
                    </p>
                  </div>
                  <span className="font-bold text-[#1a2a4a] text-sm whitespace-nowrap shrink-0">
                    KES {(sale.total || sale.amount || 0).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: table */}
          <div className="hidden lg:block overflow-x-auto max-h-125 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10 shadow-[0_1px_0_0_rgb(226,232,240)]">
                <tr className="text-left text-slate-500">
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Invoice</th>
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Customer</th>
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider">Cashier</th>
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider text-right">Amount</th>
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider text-center">Date &amp; Time</th>
                  <th className="px-4 py-3 font-semibold text-[10px] uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((sale) => (
                  <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[#1a2a4a]">
                      {sale.invoice_no || sale.invoiceNo || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-slate-700 max-w-32 truncate text-sm">
                      {sale.customer || 'Walk-in Customer'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm truncate max-w-32">
                      {sale.cashier || 'Unknown'}
                    </td>
                    <td className="px-4 py-3 font-semibold text-[#1a2a4a] text-right text-sm whitespace-nowrap">
                      KES {(sale.total || sale.amount || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-center text-xs whitespace-nowrap">
                      {formatTs(sale)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${getStatusColor(sale.status)}`}>
                        {sale.status || 'Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default RecentSales;