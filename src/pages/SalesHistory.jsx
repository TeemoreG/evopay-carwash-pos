import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  Search, RefreshCw, Download, Calendar, Filter, X,
  ChevronDown, TrendingUp, Banknote, Users, Receipt as ReceiptIcon,
} from 'lucide-react';
import SalesHistoryTable from '../components/sales/SalesHistory';
import ThermalReceipt, { generateThermalReceipt } from '../components/sales/ThermalReceipt';
import {
  getSales, retrySale, sendReceiptSms, getSale,
} from '../api/vscuApi';

const todayISO = () => new Date().toISOString().split('T')[0];

const SalesHistoryPage = () => {
  const navigate = useNavigate();

  // Data
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState('');
  const [dateRange, setDateRange] = useState('today'); // 'today' | '7d' | '30d' | 'all' | 'custom'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [methodFilter, setMethodFilter] = useState('all'); // 'all' | '01' | '03' | '02'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'synced' | 'pending'

  // UI
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsSending, setSmsSending] = useState(false);

  const fetchData = async () => {
    try {
      const r = await getSales().catch(() => ({ data: [] }));
      const list = (r.data || []).filter(Boolean)
        .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
      setSales(list);
    } catch (e) {
      console.error('Sales fetch error:', e);
      toast.error('Failed to load sales');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  // Apply date range
  const dateFiltered = useMemo(() => {
    const now = new Date();
    let start = null;
    let end = null;

    if (dateRange === 'today') {
      const d = todayISO();
      start = new Date(d + 'T00:00:00');
      end = new Date(d + 'T23:59:59');
    } else if (dateRange === '7d') {
      start = new Date(now); start.setDate(now.getDate() - 7);
    } else if (dateRange === '30d') {
      start = new Date(now); start.setDate(now.getDate() - 30);
    } else if (dateRange === 'custom') {
      if (customStart) start = new Date(customStart + 'T00:00:00');
      if (customEnd) end = new Date(customEnd + 'T23:59:59');
    }

    return sales.filter((s) => {
      const ts = s.created_at || s.date;
      if (!ts) return dateRange === 'all';
      const t = new Date(ts).getTime();
      if (start && t < start.getTime()) return false;
      if (end && t > end.getTime()) return false;
      return true;
    });
  }, [sales, dateRange, customStart, customEnd]);

  // Apply search + method + status
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return dateFiltered.filter((s) => {
      if (q) {
        const inv = String(s.invoice_no || '').toLowerCase();
        const cust = String(s.customer || '').toLowerCase();
        const cash = String(s.cashier || '').toLowerCase();
        if (!inv.includes(q) && !cust.includes(q) && !cash.includes(q)) return false;
      }
      if (methodFilter !== 'all' && s.payment_method !== methodFilter) return false;
      if (statusFilter === 'synced' && s.synced !== 1) return false;
      if (statusFilter === 'pending' && s.synced === 1) return false;
      return true;
    });
  }, [dateFiltered, search, methodFilter, statusFilter]);

  // Summary stats (from filtered set)
  const summary = useMemo(() => {
    const totalAmount = filtered.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalTax = filtered.reduce((sum, s) => sum + (s.tax || 0), 0);
    const uniqueCustomers = new Set(filtered.map((s) => s.customer).filter(Boolean)).size;
    const avg = filtered.length ? Math.round(totalAmount / filtered.length) : 0;
    return { totalAmount, totalTax, uniqueCustomers, avg, count: filtered.length };
  }, [filtered]);

  // Reset filters
  const clearFilters = () => {
    setSearch('');
    setDateRange('today');
    setCustomStart('');
    setCustomEnd('');
    setMethodFilter('all');
    setStatusFilter('all');
  };

  const activeFilterCount = [
    dateRange !== 'today' ? 1 : 0,
    methodFilter !== 'all' ? 1 : 0,
    statusFilter !== 'all' ? 1 : 0,
    search.trim() ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  // Export CSV
  const handleExportCsv = () => {
    if (!filtered.length) return toast.info('No sales to export');
    const headers = ['Invoice', 'Customer', 'Cashier', 'Total', 'Tax', 'Payment', 'Date', 'Status', 'Synced'];
    const rows = filtered.map((s) => [
      s.invoice_no || '',
      s.customer || '',
      s.cashier || '',
      s.total || 0,
      s.tax || 0,
      s.payment_method || '',
      s.created_at || s.date || '',
      s.status || '',
      s.synced === 1 ? 'yes' : 'no',
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${todayISO()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    toast.success('CSV exported');
  };

  // Retry sync
  const handleRetry = async (saleId) => {
    try {
      const r = await retrySale(saleId);
      if (r.data?.synced) toast.success('Synced to KRA');
      else toast.warn('Still pending — VSCU offline');
      fetchData();
    } catch {
      toast.error('Retry failed');
    }
  };

  // Download receipt
  const handleDownload = async (sale) => {
    try {
      let fullSale = sale;
      if (!sale.items || sale.items.length === 0) {
        const r = await getSale(sale.id);
        fullSale = r.data || sale;
      }
      const doc = await generateThermalReceipt(fullSale, null);
      if (!doc) throw new Error('PDF generation failed');
      const blob = doc.output('blob');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipt-${sale.invoice_no || sale.id}.pdf`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      toast.success('Receipt downloaded');
    } catch (e) {
      console.error(e);
      toast.error('Download failed');
    }
  };

  // Open sale details
  const handleOpenSale = async (sale) => {
    let full = sale;
    if (!sale.items || sale.items.length === 0) {
      try {
        const r = await getSale(sale.id);
        full = r.data || sale;
      } catch {}
    }
    setSelectedSale(full);
    setSmsPhone('');
  };

  const handleSendSms = async () => {
    if (!selectedSale?.invoice_no) return;
    const digits = (smsPhone || '').replace(/\D/g, '');
    if (digits.length !== 10 || !/^0[17]/.test(digits)) {
      return toast.error('Enter valid phone (07XX or 01XX)');
    }
    setSmsSending(true);
    try {
      await sendReceiptSms(selectedSale.invoice_no, digits);
      toast.success('SMS sent');
      setSmsPhone('');
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Failed to send SMS');
    } finally {
      setSmsSending(false);
    }
  };

  const rangeLabel = {
    today: 'Today',
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    all: 'All time',
    custom: 'Custom range',
  }[dateRange];

  return (
    <div className="min-h-screen bg-[#f8fafc] p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-4">

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3 sm:p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div>
            <h1 className="text-lg sm:text-2xl font-bold text-[#1a2a4a]">Sales History</h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              {summary.count} sale{summary.count !== 1 ? 's' : ''} · {rangeLabel}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200/60"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200/60 disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => navigate('/sales')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-[#f47b20] hover:bg-[#e06d1a] rounded-lg"
            >
              New Sale
            </button>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Revenue</p>
            <div className="p-1.5 bg-orange-50 rounded-md">
              <Banknote className="w-4 h-4 text-[#f47b20]" />
            </div>
          </div>
          <h3 className="text-lg sm:text-2xl font-extrabold text-[#1a2a4a] mt-1.5 tabular-nums leading-tight break-words">
            KES {summary.totalAmount.toLocaleString()}
          </h3>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Sales</p>
            <div className="p-1.5 bg-orange-50 rounded-md">
              <ReceiptIcon className="w-4 h-4 text-[#f47b20]" />
            </div>
          </div>
          <h3 className="text-lg sm:text-2xl font-extrabold text-[#1a2a4a] mt-1.5 tabular-nums">
            {summary.count}
          </h3>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Ticket</p>
            <div className="p-1.5 bg-emerald-50 rounded-md">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-lg sm:text-2xl font-extrabold text-[#1a2a4a] mt-1.5 tabular-nums">
            KES {summary.avg.toLocaleString()}
          </h3>
        </div>
        <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400">Customers</p>
            <div className="p-1.5 bg-slate-100 rounded-md">
              <Users className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <h3 className="text-lg sm:text-2xl font-extrabold text-[#1a2a4a] mt-1.5 tabular-nums">
            {summary.uniqueCustomers}
          </h3>
        </div>
      </div>

      {/* Filters bar */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-3 sm:p-4 space-y-3">

        {/* Search + Filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search invoice, customer or cashier..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`lg:hidden flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition ${
              showFilters || activeFilterCount
                ? 'bg-[#f47b20] text-white border-[#f47b20]'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 bg-white/30 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>

        {/* Filter controls — always visible on lg, collapsible on mobile */}
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block space-y-3 lg:space-y-0 lg:flex lg:flex-wrap lg:items-center lg:gap-2`}>

          {/* Date pills */}
          <div className="flex flex-wrap gap-1 bg-slate-100 rounded-lg p-0.5">
            {[
              { id: 'today', label: 'Today' },
              { id: '7d', label: '7d' },
              { id: '30d', label: '30d' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom' },
            ].map((opt) => (
              <button
                key={opt.id}
                onClick={() => setDateRange(opt.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  dateRange === opt.id
                    ? 'bg-white text-[#1a2a4a] shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Custom date inputs */}
          {dateRange === 'custom' && (
            <div className="flex flex-col sm:flex-row gap-2 lg:items-center">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
                />
              </div>
              <span className="hidden sm:inline text-slate-400 text-xs">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
              />
            </div>
          )}

          {/* Payment method */}
          <div className="relative">
            <select
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value)}
              className="appearance-none px-3 py-1.5 pr-8 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
            >
              <option value="all">All methods</option>
              <option value="01">Cash</option>
              <option value="03">M-Pesa</option>
              <option value="02">Card</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Sync status */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="appearance-none px-3 py-1.5 pr-8 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
            >
              <option value="all">All statuses</option>
              <option value="synced">Synced to KRA</option>
              <option value="pending">Pending sync</option>
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Clear */}
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 px-2 py-1.5"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Sales list — reuses the shared component */}
      <SalesHistoryTable
        sales={filtered}
        loading={loading}
        onRetry={handleRetry}
        onDownloadReceipt={handleDownload}
        onViewDetails={handleOpenSale}
      />

      {filtered.length === 0 && !loading && (
        <div className="text-center py-6 text-sm text-slate-500">
          No sales match your filters. <button onClick={clearFilters} className="text-[#f47b20] font-semibold hover:underline">Clear filters</button>
        </div>
      )}

      {/* Sale detail modal */}
      {selectedSale && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[95vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-[#1a2a4a]">{selectedSale.invoice_no}</h2>
                <p className="text-xs text-slate-400">
                  {new Date(selectedSale.created_at || selectedSale.date).toLocaleString('en-KE')}
                </p>
              </div>
              <button onClick={() => setSelectedSale(null)} className="text-slate-400 hover:text-slate-700 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-slate-400 text-[10px] uppercase">Customer</p>
                  <p className="font-semibold text-slate-700 truncate">{selectedSale.customer || 'Walk-in'}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-slate-400 text-[10px] uppercase">Cashier</p>
                  <p className="font-semibold text-slate-700 truncate">{selectedSale.cashier || '—'}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-slate-400 text-[10px] uppercase">Payment</p>
                  <p className="font-semibold text-slate-700">
                    {selectedSale.payment_method === '01' ? 'Cash' :
                     selectedSale.payment_method === '03' ? 'M-Pesa' :
                     selectedSale.payment_method === '02' ? 'Card' : '—'}
                  </p>
                </div>
                <div className="p-2 bg-slate-50 rounded-lg">
                  <p className="text-slate-400 text-[10px] uppercase">Sync</p>
                  <p className={`font-semibold ${selectedSale.synced === 1 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {selectedSale.synced === 1 ? 'Synced' : 'Pending'}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-2">Items</p>
                <div className="space-y-1.5">
                  {(selectedSale.items || []).map((it, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="text-slate-700 truncate">{it.item_name}</p>
                        <p className="text-[10px] text-slate-400">{it.quantity} × {Number(it.price).toLocaleString()}</p>
                      </div>
                      <span className="font-semibold text-slate-800 ml-2">
                        KES {Number(it.total).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-slate-200 pt-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>KES {Number(selectedSale.subtotal || 0).toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">VAT</span><span>KES {Number(selectedSale.tax || 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-[#1a2a4a] text-base pt-1"><span>Total</span><span>KES {Number(selectedSale.total || 0).toFixed(2)}</span></div>
              </div>

              {selectedSale.status === 'Pending' && (
                <button
                  onClick={() => { handleRetry(selectedSale.id); setSelectedSale(null); }}
                  className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-sm font-semibold"
                >
                  Retry KRA Sync
                </button>
              )}
            </div>

            <div className="p-4 border-t border-slate-200 space-y-3">
              <div className="flex gap-2">
                <input
                  type="tel"
                  inputMode="numeric"
                  value={smsPhone}
                  onChange={(e) => setSmsPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  placeholder="07XX XXX XXX"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f47b20]"
                />
                <button
                  onClick={handleSendSms}
                  disabled={smsSending || smsPhone.length !== 10}
                  className="px-4 py-2 bg-[#1a2a4a] hover:bg-[#0f1a33] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                >
                  {smsSending ? '...' : 'Send SMS'}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleDownload(selectedSale)}
                  className="flex-1 py-2.5 bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg text-sm font-semibold"
                >
                  Download Receipt
                </button>
                <button
                  onClick={() => setSelectedSale(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SalesHistoryPage;