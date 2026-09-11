const ItemList = ({ 
  items, 
  loading, 
  onEdit, 
  onDelete,
  onSyncToVSCU
}) => {
  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="h-6 w-6 border-2 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
        <p className="text-sm font-medium">No services found</p>
        <p className="text-xs mt-1">Click "Add Service" to create your first car wash service</p>
      </div>
    );
  }

  const getItemCd = (item) => item.item_cd || item.itemCd;
  const getItemName = (item) => item.item_name || item.itemNm;
  const getItemPrice = (item) => Number(item.price || item.dftPrc || 0);
  const getTaxType = (item) => item.tax_type || item.taxTyCd;
  const getItemClsCd = (item) => item.item_cls_cd || item.itemClsCd;
  const getDuration = (item) => item.sfty_qty || item.sftyQty || item.duration || 0;
  const getSynced = (item) => item.synced !== undefined ? item.synced : 0;
  const getCategory = (item) => item.category || 'addon';
  const isActive = (item) => (item.use_yn || item.useYn || 'Y') === 'Y';

  const categories = {
    basic: { name: 'Basic', color: 'bg-blue-50 text-blue-700' },
    standard: { name: 'Standard', color: 'bg-green-50 text-green-700' },
    premium: { name: 'Premium', color: 'bg-purple-50 text-purple-700' },
    vip: { name: 'VIP', color: 'bg-amber-50 text-amber-700' },
    interior: { name: 'Interior', color: 'bg-cyan-50 text-cyan-700' },
    addon: { name: 'Add-on', color: 'bg-gray-50 text-gray-700' },
  };

  return (
    <div className="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr className="text-left text-gray-500">
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Category</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Code</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider">Service Name</th>
            <th className="px-6 py-3 font-semibold text-xs uppercase tracking-wider text-right">Price</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden md:table-cell text-center">Duration</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">Tax</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider hidden lg:table-cell">KRA Class</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Status</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-center">Sync</th>
            <th className="px-4 py-3 font-semibold text-xs uppercase tracking-wider text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {items.map((item) => {
            const itemCd = getItemCd(item);
            const synced = getSynced(item);
            const duration = getDuration(item);
            const category = categories[getCategory(item)] || categories.addon;
            
            return (
              <tr 
                key={itemCd || Math.random()} 
                className={`hover:bg-gray-50 transition ${!isActive(item) ? 'opacity-50' : ''}`}
              >
                {/* Category Badge */}
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${category.color}`}>
                    <span>{category.icon}</span>
                    <span>{category.name}</span>
                  </span>
                </td>

                {/* Code */}
                <td className="px-4 py-3 text-gray-600 font-mono text-xs font-medium">
                  {itemCd || '-'}
                </td>

                {/* Service Name */}
                <td className="px-4 py-3">
                  <p className="font-medium text-[#1a2a4a] max-w-50 truncate" title={getItemName(item)}>
                    {getItemName(item)}
                  </p>
                  {(item.add_info || item.addInfo) && (
                    <p className="text-xs text-gray-400 max-w-50 truncate" title={item.add_info || item.addInfo}>
                      {item.add_info || item.addInfo}
                    </p>
                  )}
                </td>

                {/* Price */}
                <td className="px-4 py-4 text-right whitespace-nowrap">
                  <span className="text-[#f47b20] font-bold">
                     <span className="text-[#f47b20] font-bold whitespace-nowrap"></span>
                    KES {getItemPrice(item).toLocaleString()}
                  </span>
                </td>

                {/* Duration */}
                <td className="px-4 py-3 text-center hidden md:table-cell">
                  {duration > 0 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-600">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      {duration} min
                    </span>
                  ) : (
                    <span className="text-xs text-gray-300">-</span>
                  )}
                </td>

                {/* Tax Type */}
                <td className="px-4 py-3 hidden lg:table-cell">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    getTaxType(item) === 'B' ? 'bg-orange-100 text-orange-700' :
                    getTaxType(item) === 'A' ? 'bg-green-100 text-green-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>
                    {getTaxType(item) || 'B'}
                  </span>
                </td>

                {/* KRA Class */}
                <td className="px-4 py-3 text-gray-500 font-mono text-xs hidden lg:table-cell">
                  {getItemClsCd(item) || '-'}
                </td>

                {/* Status */}
                <td className="px-4 py-3 text-center">
                  {isActive(item) ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-gray-400 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                      Inactive
                    </span>
                  )}
                </td>

                {/* Sync Status */}
                <td className="px-4 py-3 text-center">
                  {synced === 1 ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                      </svg>
                      Synced
                    </span>
                  ) : (
                    <button
                      onClick={() => onSyncToVSCU && onSyncToVSCU(item)}
                      className="text-xs bg-amber-100 hover:bg-amber-200 text-amber-700 px-2.5 py-1 rounded-lg transition font-medium inline-flex items-center gap-1"
                      title="Sync to VSCU"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                      </svg>
                      Sync
                    </button>
                  )}
                </td>

                {/* Actions */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => onEdit(item)}
                      className="text-[#1a2a4a] hover:bg-gray-100 p-1.5 rounded-lg transition"
                      title="Edit service"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => onDelete(itemCd)}
                      className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition"
                      title="Delete service"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default ItemList;