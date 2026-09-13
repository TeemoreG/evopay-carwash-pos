const StatsCards = ({ stats, loading }) => {
  const cards = [
    {
      label: 'Total Items',
      value: stats.totalItems,
      color: 'text-[#1a2a4a]',
      bg: 'bg-slate-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: 'Total Sales',
      value: stats.totalSales,
      color: 'text-indigo-600',
      bg: 'bg-indigo-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      label: 'Revenue',
      value: `KES ${stats.totalRevenue.toLocaleString()}`,
      color: 'text-[#f47b20]',
      bg: 'bg-orange-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Stock Value',
      value: `KES ${stats.stockValue.toLocaleString()}`,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white p-3 sm:p-4 lg:p-5 rounded-xl shadow-sm border border-slate-200/80 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <p className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-slate-400 truncate">
              {card.label}
            </p>
            <div className={`p-1.5 sm:p-2 rounded-lg ${card.bg} ${card.color} shrink-0`}>
              <div className="w-3.5 h-3.5 sm:w-4 sm:h-4">
                {card.icon}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="h-6 sm:h-7 lg:h-8 w-20 sm:w-24 bg-slate-200 animate-pulse rounded" />
          ) : (
            <p className={`text-lg sm:text-xl lg:text-2xl font-extrabold ${card.color} truncate leading-tight`}>
              {card.value}
            </p>
          )}
        </div>
      ))}
    </div>
  );
};

export default StatsCards;