const RecentSales = ({ sales, loading, onViewAll }) => {
  const getStatusColor = (status) => {
    const colors = {
      Completed: 'bg-emerald-100 text-emerald-700',
      Pending: 'bg-amber-100 text-amber-700',
      Cancelled: 'bg-rose-100 text-rose-700',
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
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6">
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-base font-bold text-[#1a2a4a]">Recent Sales</h2>
          <p className="text-[10px] text-slate-400">Latest transactions</p>
        </div>
        <button onClick={onViewAll} className="text-xs text-[#f47b20] hover:underline font-semibold">
          View All →
        </button>
      </div>

      {sales.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">No sales recorded yet.</div>
      ) : (
        <div className="overflow-x-auto max-h-125 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left text-slate-500 border-b border-slate-200">
                <th className="pb-3 pr-3 font-semibold text-xs uppercase tracking-wider">Invoice</th>
                <th className="pb-3 pr-3 font-semibold text-xs uppercase tracking-wider">Customer</th>
                <th className="pb-3 pr-3 font-semibold text-xs uppercase tracking-wider hidden md:table-cell">Cashier</th>
                <th className="pb-3 font-semibold text-xs uppercase tracking-wider text-right">Amount</th>
                <th className="pb-3 font-semibold text-xs uppercase tracking-wider text-center hidden sm:table-cell">Date &amp; Time</th>
                <th className="pb-3 font-semibold text-xs uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sales.slice(0, 10).map((sale) => (
                <tr key={sale.id} className="border-b border-slate-100 hover:bg-slate-50 transition cursor-pointer">
                  <td className="py-3 pr-3 font-mono text-xs font-semibold text-[#1a2a4a]">
                    {sale.invoice_no || sale.invoiceNo || 'N/A'}
                  </td>
                  <td className="py-3 pr-3 text-slate-700 max-w-25 truncate text-sm">
                    {sale.customer || 'N/A'}
                  </td>
                  <td className="py-3 pr-3 text-slate-500 hidden md:table-cell text-sm">
                    {sale.cashier || 'Unknown'}
                  </td>
                  <td className="py-3 font-semibold text-[#1a2a4a] text-right text-sm">
                    KES {(sale.total || sale.amount || 0).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-500 hidden sm:table-cell text-center text-xs">
                    {formatTs(sale)}
                  </td>
                  <td className="py-3 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold ${getStatusColor(sale.status)}`}>
                      {sale.status || 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default RecentSales;