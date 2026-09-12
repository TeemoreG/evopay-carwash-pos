import { useState } from 'react';

const fmtTs = (s) => {
  const ts = s.created_at || s.date;
  if (!ts) return 'N/A';
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString('en-KE', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false
  });
};

const SalesHistory = ({ sales, loading, onRetry, onDownloadReceipt }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const getStatusColor = (status) => {
    const colors = {
      Completed: 'bg-emerald-100 text-emerald-700',
      Pending: 'bg-amber-100 text-amber-700',
      Failed: 'bg-rose-100 text-rose-700',
      Cancelled: 'bg-rose-100 text-rose-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const getSyncBadge = (status, synced) => {
    if (status === 'Completed' && synced === 1) return <span className="text-xs text-emerald-600 font-medium">Synced ✓</span>;
    if (status === 'Pending' || synced === 0) return <span className="text-xs text-amber-600 animate-pulse font-medium">Queued...</span>;
    if (status === 'Failed') return <span className="text-xs text-rose-600 font-medium">Failed ✗</span>;
    return <span className="text-xs text-gray-400">—</span>;
  };

  const getPaymentLabel = (code) => {
    const labels = { '01': 'Cash', '02': 'Card', '03': 'Mobile Money' };
    return labels[code] || code || 'N/A';
  };

  const getReceiptTypeLabel = (code) => {
    const labels = { NS: 'Normal Sale', NC: 'Credit Note', CS: 'Copy', PS: 'Proforma' };
    return labels[code] || code || 'N/A';
  };

  const totalPages = Math.ceil(sales.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentSales = sales.slice(startIndex, startIndex + itemsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4">
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  const totalSynced = sales.filter(s => s.synced === 1).length;
  const totalPending = sales.filter(s => s.synced === 0 || s.status === 'Pending').length;

  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3 sm:p-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a]">Sales History</h2>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
          <span className="text-slate-500 font-medium">Total: <span className="text-[#1a2a4a] font-bold">{sales.length}</span></span>
          <div className="h-4 w-px bg-slate-200"></div>
          <span className="text-emerald-600 font-medium">✓ {totalSynced} synced</span>
          {totalPending > 0 && (
            <>
              <div className="h-4 w-px bg-slate-200"></div>
              <span className="text-amber-600 font-medium">{totalPending} pending</span>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto -mx-3 sm:mx-0 px-3 sm:px-0">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-200">
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider">Invoice</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider">Customer</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider hidden sm:table-cell">Cashier</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider hidden md:table-cell">Receipt</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-right">Amount</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-right hidden sm:table-cell">Tax</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-center">Date &amp; Time</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-center">Status</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-center">Sync</th>
              <th className="pb-2.5 font-semibold text-[10px] uppercase tracking-wider text-center">Receipt</th>
            </tr>
          </thead>
          <tbody>
            {currentSales.length === 0 ? (
              <tr>
                <td colSpan="10" className="text-center py-8 text-slate-400 text-sm">No sales on this page.</td>
              </tr>
            ) : currentSales.map((sale, index) => (
              <tr key={sale.id || index} className="border-b border-slate-100 hover:bg-slate-50 transition">
                <td className="py-2.5 font-mono text-xs font-semibold text-[#1a2a4a] whitespace-nowrap">
                  {sale.invoice_no || sale.invoiceNo || 'N/A'}
                </td>
                <td className="py-2.5 text-slate-700 max-w-30 truncate text-sm">
                  {sale.customer || 'Walk-in Customer'}
                </td>
                <td className="py-2.5 text-slate-500 hidden sm:table-cell text-sm whitespace-nowrap">
                  {sale.cashier || 'Unknown'}
                </td>
                <td className="py-2.5 hidden md:table-cell">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {getReceiptTypeLabel(sale.receipt_type || sale.rcptTyCd)}
                  </span>
                </td>
                <td className="py-2.5 font-semibold text-[#1a2a4a] text-right text-sm whitespace-nowrap">
                  KES {(sale.total || 0).toLocaleString()}
                </td>
                <td className="py-2.5 text-[#f47b20] text-right hidden sm:table-cell text-sm whitespace-nowrap">
                  KES {(sale.tax || 0).toLocaleString()}
                </td>
                <td className="py-2.5 text-slate-500 text-center text-xs whitespace-nowrap">
                  {fmtTs(sale)}
                </td>
                <td className="py-2.5 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap ${getStatusColor(sale.status)}`}>
                    {sale.status || 'N/A'}
                  </span>
                </td>
                <td className="py-2.5 text-center">
                  <div className="flex items-center justify-center gap-1.5">
                    {getSyncBadge(sale.status, sale.synced)}
                    {sale.status === 'Failed' && onRetry && (
                      <button onClick={() => onRetry(sale.id)} className="text-[10px] text-[#f47b20] hover:underline font-medium" title="Retry sync">
                        Retry
                      </button>
                    )}
                  </div>
                </td>
                <td className="py-2.5 text-center">
                  <button
                    onClick={() => onDownloadReceipt && onDownloadReceipt(sale)}
                    className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white p-1.5 rounded-lg transition"
                    title="Download Receipt"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-slate-200">
          <span className="text-xs text-slate-500">Page {currentPage} of {totalPages}</span>
          <div className="flex gap-1 flex-wrap">
            <button onClick={() => goToPage(currentPage - 1)} disabled={currentPage === 1}
              className="px-2.5 sm:px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
              ←
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) pageNum = i + 1;
              else if (currentPage <= 3) pageNum = i + 1;
              else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
              else pageNum = currentPage - 2 + i;
              return (
                <button key={pageNum} onClick={() => goToPage(pageNum)}
                  className={`px-2.5 sm:px-3 py-1 text-sm border rounded-lg transition ${
                    currentPage === pageNum ? 'bg-[#f47b20] text-white border-[#f47b20]' : 'border-slate-300 hover:bg-slate-50'
                  }`}>
                  {pageNum}
                </button>
              );
            })}
            <button onClick={() => goToPage(currentPage + 1)} disabled={currentPage === totalPages}
              className="px-2.5 sm:px-3 py-1 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition">
              →
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesHistory;