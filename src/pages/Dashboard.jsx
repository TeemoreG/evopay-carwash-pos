import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart, Line, BarChart, Bar,
} from 'recharts';
import {
  TrendingUp, Package, AlertTriangle, RefreshCw, CheckCircle2, XCircle,
  ArrowUpRight, Plus, FileText, Search, Activity, Clock, Calendar,
  Award, Zap, BarChart3, PieChart as PieChartIcon, Car, Droplets,
  Timer, Gauge, Users, Banknote, CreditCard, Smartphone, Sparkles,
  Trophy, Target, ArrowDownRight,
} from 'lucide-react';

import RecentSales from '../components/dashboard/RecentSales';
import { getSales, getItems, getStock, checkVSCUStatus } from '../api/vscuApi';

const PIE_COLORS = ['#f47b20', '#1a2a4a', '#10b981', '#8b5cf6', '#ec4899'];

const Dashboard = () => {
  const navigate = useNavigate();

  const [stats, setStats] = useState({
    totalServices: 0, totalProducts: 0, totalSales: 0, totalRevenue: 0,
    stockValue: 0, pendingSales: 0, todaySales: 0, totalTax: 0,
    todayRevenue: 0, avgOrderValue: 0, growthRate: 0,
    totalCustomers: 0, activeCashiers: 0,
    revenuePerCar: 0, peakHour: '—', peakHourCount: 0,
    carsPerHour: 0, openHours: 0,
    topService: '—', weekRevenue: 0, monthRevenue: 0,
  });
  const [recentSales, setRecentSales] = useState([]);
  const [topServices, setTopServices] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [salesByPayment, setSalesByPayment] = useState([]);
  const [repeatCustomerRate, setRepeatCustomerRate] = useState(0);
  const [oldestPending, setOldestPending] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [vscuStatus, setVscuStatus] = useState({ connected: false, checking: true });
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('7d');
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
    checkVSCU();
    intervalRef.current = setInterval(checkVSCU, 5000);
    const onVis = () => document.visibilityState === 'visible' && checkVSCU();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const checkVSCU = async () => {
    try {
      setVscuStatus(p => ({ ...p, checking: true }));
      const r = await checkVSCUStatus();
      setVscuStatus({ connected: r.data?.online === true, checking: false });
    } catch {
      setVscuStatus({ connected: false, checking: false });
    }
  };

  const getTs = (s) => s.created_at || s.date || '';

  const calculateTopServices = (salesData) => {
    const map = {};
    salesData.forEach(sale => {
      (sale.items || []).forEach(item => {
        const key = item.item_cd || item.itemCd || 'UNKNOWN';
        if (!map[key]) map[key] = { name: item.item_name || item.itemNm || 'Unknown', sold: 0, revenue: 0 };
        map[key].sold += item.quantity || 0;
        map[key].revenue += (item.quantity || 0) * (item.price || 0);
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  };

  const calculateSalesByPayment = (salesData) => {
    const labels = { '01': 'Cash', '02': 'Card', '03': 'M-Pesa', '04': 'Airtel', cash: 'Cash', card: 'Card', mpesa: 'M-Pesa', airtel_money: 'Airtel' };
    const map = {};
    salesData.forEach(s => {
      const label = labels[s.payment_method] || s.payment_method || 'Other';
      if (!map[label]) map[label] = { name: label, value: 0 };
      map[label].value += s.total || 0;
    });
    return Object.values(map);
  };

  const calculatePeakHour = (salesData) => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
    salesData.forEach(s => {
      const d = new Date(getTs(s));
      if (!isNaN(d.getTime())) buckets[d.getHours()].count += 1;
    });
    const sorted = [...buckets].sort((a, b) => b.count - a.count);
    const top = sorted[0];
    if (!top || top.count === 0) return { label: '—', count: 0 };
    const h = top.hour;
    const label = `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'am' : 'pm'}`;
    return { label, count: top.count };
  };

  const calculateHourlyData = (salesData) => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? 'a' : 'p'}`,
      count: 0,
    }));
    salesData.forEach(s => {
      const d = new Date(getTs(s));
      if (!isNaN(d.getTime())) buckets[d.getHours()].count += 1;
    });
    return buckets.filter(b => b.hour >= 6 && b.hour <= 22);
  };

  const calculateRepeatCustomerRate = (salesData) => {
    const counts = {};
    salesData.forEach(s => { if (s.customer) counts[s.customer] = (counts[s.customer] || 0) + 1; });
    const arr = Object.values(counts);
    if (!arr.length) return 0;
    return Math.round((arr.filter(c => c > 1).length / arr.length) * 100);
  };

  const calculateOldestPending = (salesData) => {
    const pending = salesData.filter(s => s.status === 'Pending' && getTs(s))
      .sort((a, b) => new Date(getTs(a)) - new Date(getTs(b)));
    if (!pending.length) return null;
    const diffH = Math.floor((Date.now() - new Date(getTs(pending[0])).getTime()) / 3600000);
    if (diffH < 1) return 'Just now';
    if (diffH < 24) return `${diffH}h ago`;
    return `${Math.floor(diffH / 24)}d ago`;
  };

  const processChartData = (salesData, range) => {
    const days = range === '90d' ? 90 : range === '30d' ? 30 : 7;
    const dates = [...Array(days)].map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (days - 1 - i));
      return d.toISOString().split('T')[0];
    });
    return dates.map(dateStr => {
      const daySales = salesData.filter(s => getTs(s).slice(0, 10) === dateStr);
      const completed = daySales.filter(s => s.status === 'Completed');
      const label = new Date(dateStr).toLocaleDateString('en-KE', {
        weekday: range === '7d' ? 'short' : 'numeric',
        month: range === '90d' ? 'short' : undefined,
      });
      return {
        date: label,
        revenue: completed.reduce((sum, s) => sum + (s.total || 0), 0),
        tax: completed.reduce((sum, s) => sum + (s.tax || 0), 0),
        salesCount: daySales.length,
      };
    });
  };

  const fetchDashboardData = async () => {
    try {
      setRefreshing(true);
      const [salesRes, itemsRes, stockRes] = await Promise.all([
        getSales().catch(() => ({ data: [] })),
        getItems().catch(() => ({ data: [] })),
        getStock().catch(() => ({ data: [] })),
      ]);
      const sales = salesRes.data || [];
      const items = itemsRes.data || [];
      const stock = stockRes.data || [];

      const completed = sales.filter(s => s.status === 'Completed');
      const totalRevenue = completed.reduce((s, x) => s + (x.total || 0), 0);
      const totalTax = completed.reduce((s, x) => s + (x.tax || 0), 0);
      const pendingSales = sales.filter(s => s.status === 'Pending').length;

      const todayStr = new Date().toISOString().split('T')[0];
      const todayArr = sales.filter(s => getTs(s).slice(0, 10) === todayStr);
      const todayRevenue = todayArr.filter(s => s.status === 'Completed').reduce((s, x) => s + (x.total || 0), 0);

      const now = new Date();
      const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
      const monthAgo = new Date(now); monthAgo.setDate(now.getDate() - 30);
      const weekRevenue = completed
        .filter(s => new Date(getTs(s)) >= weekAgo)
        .reduce((sum, s) => sum + (s.total || 0), 0);
      const monthRevenue = completed
        .filter(s => new Date(getTs(s)) >= monthAgo)
        .reduce((sum, s) => sum + (s.total || 0), 0);

      const productStock = stock.filter(s => s.item_type === 'product' || s.item_ty_cd === '1');
      const stockValue = productStock.reduce((s, x) => s + (x.price || 0) * (x.stock || 0), 0);

      const avgOrderValue = completed.length ? totalRevenue / completed.length : 0;
      const revenuePerCar = avgOrderValue;

      const services = items.filter(i => (i.item_type || '').toLowerCase() === 'service');
      const products = items.filter(i => (i.item_type || '').toLowerCase() === 'product');
      const uniqueCustomers = new Set(sales.map(s => s.customer).filter(Boolean));
      const uniqueCashiers = new Set(sales.map(s => s.cashier).filter(Boolean));

      const l7 = new Date(now); l7.setDate(now.getDate() - 7);
      const p7 = new Date(l7); p7.setDate(l7.getDate() - 7);
      const sum = (arr) => arr.reduce((s, x) => s + (x.total || 0), 0);
      const last7 = sum(sales.filter(s => s.status === 'Completed' && new Date(getTs(s)) >= l7));
      const prev7 = sum(sales.filter(s => s.status === 'Completed' && new Date(getTs(s)) >= p7 && new Date(getTs(s)) < l7));
      const growthRate = prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : 0;

      const peak = calculatePeakHour(sales);
      const todayCompleted = todayArr.filter(s => s.status === 'Completed').length;
      const currentHour = new Date().getHours();
      const openHours = Math.max(currentHour - 7, 1);
      const carsPerHour = todayCompleted > 0 ? (todayCompleted / openHours).toFixed(1) : 0;

      const topSvcList = calculateTopServices(sales);
      const topSvc = topSvcList[0]?.name || '—';

      const allItemSales = calculateTopServices(sales);
      const serviceItems = allItemSales.filter(x => 
        services.some(svc => (svc.item_name || svc.itemNm) === x.name)
      );
      const productItems = allItemSales.filter(x =>
        products.some(prd => (prd.item_name || prd.itemNm) === x.name)
      );

      setStats({
        totalServices: services.length, totalProducts: products.length,
        totalSales: sales.length, totalRevenue, stockValue, pendingSales,
        todaySales: todayArr.length, totalTax, todayRevenue, avgOrderValue,
        growthRate, totalCustomers: uniqueCustomers.size, activeCashiers: uniqueCashiers.size,
        revenuePerCar: Math.round(revenuePerCar),
        peakHour: peak.label, peakHourCount: peak.count,
        carsPerHour, openHours,
        topService: topSvc,
        weekRevenue, monthRevenue,
      });

      const sorted = [...sales].sort((a, b) => new Date(getTs(b)) - new Date(getTs(a)));
      setRecentSales(sorted.slice(0, 10));
      setTopServices(serviceItems.slice(0, 5));
      setTopProducts(productItems.slice(0, 5));
      setChartData(processChartData(sales, timeRange));
      setHourlyData(calculateHourlyData(sales));
      setSalesByPayment(calculateSalesByPayment(sales));
      setRepeatCustomerRate(calculateRepeatCustomerRate(sales));
      setOldestPending(calculateOldestPending(sales));
      setLastUpdated(new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('Dashboard fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const filteredSales = useMemo(() => {
    if (!searchQuery) return recentSales;
    const q = searchQuery.toLowerCase();
    return recentSales.filter(s =>
      (s.invoice_no || '').toLowerCase().includes(q) ||
      (s.customer || '').toLowerCase().includes(q)
    );
  }, [recentSales, searchQuery]);

  const todayFormatted = new Date().toLocaleDateString('en-KE', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric',
  });

  const TrendTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
        <p className="text-sm font-semibold text-slate-500">{label}</p>
        {payload.map((e, i) => (
          <p key={i} className="text-base font-bold" style={{ color: e.color }}>
            {e.name}: {e.name === 'Washes' ? e.value : `KES ${e.value.toLocaleString()}`}
          </p>
        ))}
      </div>
    );
  };

  const HourTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="bg-white p-2 rounded-lg shadow-lg border border-slate-200">
        <p className="text-xs font-semibold text-slate-500">{label}</p>
        <p className="text-sm font-bold text-[#f47b20]">{payload[0].value} washes</p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 p-3 sm:p-4 lg:p-6 space-y-3 sm:space-y-5">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 bg-white p-3 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1a2a4a]">Car Wash POS</h1>
          <p className="text-slate-500 text-sm mt-0.5">Live overview of your wash business</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium border ${
            stats.growthRate > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : stats.growthRate < 0 ? 'bg-rose-50 text-rose-700 border-rose-200'
            : 'bg-slate-50 text-slate-600 border-slate-200'
          }`}>
            {stats.growthRate < 0 ? <ArrowDownRight className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
            <span>{stats.growthRate > 0 ? '+' : ''}{stats.growthRate.toFixed(1)}%</span>
          </div>
          <button
            onClick={() => { fetchDashboardData(); checkVSCU(); }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200/60 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <div className="text-sm text-slate-600 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200 font-medium flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            <span className="truncate max-w-[140px] sm:max-w-none">{todayFormatted}</span>
          </div>
        </div>
      </div>

      {/* Hero Stats — 2x2 on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Today's Revenue */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Today</p>
            <div className="p-2 bg-orange-50 rounded-lg">
              <Banknote className="w-5 h-5 text-[#f47b20]" />
            </div>
          </div>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#1a2a4a] mt-2 tabular-nums break-words leading-tight">
            KES {stats.todayRevenue.toLocaleString()}
          </h3>
          <p className="text-sm text-slate-500 mt-2">
            Week: <span className="font-semibold text-slate-700">KES {stats.weekRevenue.toLocaleString()}</span>
          </p>
        </div>

        {/* Today's Washes */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Washes</p>
            <div className="p-2 bg-orange-50 rounded-lg">
              <Car className="w-5 h-5 text-[#f47b20]" />
            </div>
          </div>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#1a2a4a] mt-2 tabular-nums">
            {stats.todaySales}
          </h3>
          <p className="text-sm text-slate-500 mt-2">
            {stats.carsPerHour} <span className="text-slate-400">cars/hr</span>
          </p>
        </div>

        {/* Avg Ticket */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Avg Ticket</p>
            <div className="p-2 bg-emerald-50 rounded-lg">
              <Target className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <h3 className="text-2xl sm:text-4xl font-extrabold text-[#1a2a4a] mt-2 tabular-nums break-words leading-tight">
            KES {Math.round(stats.avgOrderValue).toLocaleString()}
          </h3>
          <p className="text-sm text-slate-500 mt-2 truncate">
            Peak: {stats.peakHour}
          </p>
        </div>

        {/* Pending */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-slate-400">Pending</p>
            <div className={`p-2 rounded-lg ${stats.pendingSales > 0 ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <AlertTriangle className={`w-5 h-5 ${stats.pendingSales > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
            </div>
          </div>
          <h3 className={`text-2xl sm:text-4xl font-extrabold mt-2 tabular-nums ${
            stats.pendingSales > 0 ? 'text-amber-600' : 'text-emerald-600'
          }`}>
            {stats.pendingSales}
          </h3>
          <button onClick={() => navigate('/sales')} className="text-sm text-[#f47b20] font-semibold mt-2 flex items-center gap-0.5">
            Resolve <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Revenue Trend + Hourly chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">

        <div className="lg:col-span-2 bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#f47b20]" />
                Revenue Trend
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">Daily revenue and wash count</p>
            </div>
            <div className="flex bg-slate-100 rounded-lg p-0.5 self-start sm:self-auto">
              {['7d', '30d', '90d'].map(r => (
                <button
                  key={r}
                  onClick={() => { setTimeRange(r); setTimeout(fetchDashboardData, 0); }}
                  className={`px-3 py-1 text-xs sm:text-sm font-medium rounded-md transition ${
                    timeRange === r ? 'bg-white text-[#1a2a4a] shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {r.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="h-52 sm:h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 5, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f47b20" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f47b20" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false}
                  tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip content={<TrendTooltip />} />
                <Area type="monotone" dataKey="revenue" stroke="#f47b20" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRev)" name="Revenue" />
                <Line type="monotone" dataKey="salesCount" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981', r: 4 }} name="Washes" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Hourly Activity */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2 mb-1">
            <Clock className="w-5 h-5 text-[#f47b20]" />
            Hourly Activity
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mb-3">Washes by hour of day</p>
          <div className="h-44 sm:h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip content={<HourTooltip />} cursor={{ fill: '#f47b20', opacity: 0.1 }} />
                <Bar dataKey="count" fill="#1a2a4a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Analytics grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">

        {/* Payment Methods */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2 mb-3">
            <PieChartIcon className="w-5 h-5 text-[#f47b20]" />
            Payment Methods
          </h2>
          {salesByPayment.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={salesByPayment} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">
                    {salesByPayment.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Legend iconType="circle" iconSize={8} verticalAlign="bottom"
                    formatter={(v) => <span className="text-xs sm:text-sm text-slate-600">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">No data yet</div>
          )}
        </div>

        {/* Business Health */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2 mb-3">
            <Activity className="w-5 h-5 text-[#f47b20]" />
            Business Health
          </h2>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100 mb-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-slate-600">Daily Target</span>
              <span className="text-base font-bold text-[#1a2a4a]">
                {Math.min(Math.round((stats.todayRevenue / 10000) * 100), 100)}%
              </span>
            </div>
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-linear-to-r from-[#f47b20] to-[#1a2a4a] transition-all duration-700"
                style={{ width: `${Math.min((stats.todayRevenue / 10000) * 100, 100)}%` }} />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              KES {stats.todayRevenue.toLocaleString()} / KES 10,000
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="text-center p-2 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Customers</p>
              <p className="font-bold text-slate-700 text-base">{stats.totalCustomers}</p>
            </div>
            <div className="text-center p-2 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Cashiers</p>
              <p className="font-bold text-slate-700 text-base">{stats.activeCashiers}</p>
            </div>
            <div className="text-center p-2 bg-slate-50 rounded-lg">
              <p className="text-xs text-slate-400 uppercase">Repeat</p>
              <p className="font-bold text-slate-700 text-base">{repeatCustomerRate}%</p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 p-2 bg-slate-50 rounded-lg">
            <span className="text-sm font-semibold text-slate-600">VSCU</span>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              vscuStatus.connected ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {vscuStatus.checking ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                : vscuStatus.connected ? <CheckCircle2 className="w-4 h-4" />
                : <XCircle className="w-4 h-4" />}
              {vscuStatus.checking ? 'Checking' : vscuStatus.connected ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200/80 shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2">
              <Trophy className="w-5 h-5 text-[#f47b20]" />
              Top Products
            </h2>
            <button onClick={() => navigate('/stock')} className="text-sm text-[#f47b20] font-semibold">
              All →
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : topProducts.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">No product sales yet</div>
          ) : (
            <div className="space-y-3">
              {topProducts.map((item, i) => (
                <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`flex items-center justify-center w-6 h-6 text-xs font-bold rounded-md shrink-0 ${
                      i === 0 ? 'bg-amber-100 text-amber-700'
                      : i === 1 ? 'bg-slate-100 text-slate-600'
                      : 'bg-orange-100 text-orange-700'
                    }`}>{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 truncate">{item.name}</p>
                      <p className="text-xs text-slate-400">{item.sold} sold</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[#1a2a4a] shrink-0 ml-2">
                    KES {item.revenue.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent + Top Services + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-5">

        {/* Recent */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#f47b20]" />
                Recent Washes
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">Latest transactions</p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#f47b20]"
              />
            </div>
          </div>
          <RecentSales sales={filteredSales} loading={loading} onViewAll={() => navigate('/sales')} />
        </div>

        {/* Right column */}
        <div className="space-y-3 sm:space-y-5">

          {/* Top Services */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] flex items-center gap-2">
                  <Award className="w-5 h-5 text-[#f47b20]" />
                  Top Services
                </h2>
                <p className="text-xs text-slate-400">By revenue</p>
              </div>
              <button onClick={() => navigate('/reports')} className="text-sm text-[#f47b20] font-semibold">
                Reports →
              </button>
            </div>
            {loading ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : topServices.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">No service records</div>
            ) : (
              <div className="space-y-3">
                {topServices.map((item, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`flex items-center justify-center w-6 h-6 text-xs font-bold rounded-md shrink-0 ${
                        i === 0 ? 'bg-amber-100 text-amber-700'
                        : i === 1 ? 'bg-slate-100 text-slate-600'
                        : 'bg-orange-100 text-orange-700'
                      }`}>{i + 1}</span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700 truncate">{item.name}</p>
                        <p className="text-xs text-slate-400">{item.sold} washes</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-[#1a2a4a] shrink-0 ml-2">
                      KES {item.revenue.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-4 sm:p-5">
            <h2 className="text-base sm:text-lg font-bold text-[#1a2a4a] mb-3 flex items-center gap-2">
              <Zap className="w-5 h-5 text-[#f47b20]" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-2.5">
              <button onClick={() => navigate('/sales')} className="flex items-center justify-center gap-2 bg-[#f47b20] hover:bg-[#e06d1a] text-white p-3 rounded-lg text-sm font-semibold transition">
                <Plus className="w-4 h-4" /> New Wash
              </button>
              <button onClick={() => navigate('/items')} className="flex items-center justify-center gap-2 bg-[#1a2a4a] hover:bg-[#0f1a33] text-white p-3 rounded-lg text-sm font-semibold transition">
                <Droplets className="w-4 h-4" /> Services
              </button>
              <button onClick={() => navigate('/reports')} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-lg text-sm font-semibold transition">
                <FileText className="w-4 h-4" /> Reports
              </button>
              <button onClick={() => navigate('/stock')} className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white p-3 rounded-lg text-sm font-semibold transition">
                <Package className="w-4 h-4" /> Products
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-col sm:flex-row justify-between items-center pt-3 border-t border-slate-200 text-xs sm:text-sm text-slate-400 gap-1 text-center sm:text-left">
        <span>Updated: <strong className="text-slate-600">{lastUpdated || '...'}</strong></span>
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Evopay Car Wash POS v1.0.0 | KRA eTIMS
        </span>
      </div>
    </div>
  );
};

export default Dashboard;