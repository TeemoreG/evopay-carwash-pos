import ItemList from './ItemList';

const ItemManagement = ({ 
  items, 
  loading, 
  onEdit, 
  onDelete,
  onSyncToVSCU
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[#1a2a4a]">Service List</h2>
          <p className="text-xs text-gray-400 mt-0.5">Car wash services with KRA eTIMS sync</p>
        </div>
        <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full font-medium">
          {items.length} {items.length === 1 ? 'service' : 'services'}
        </span>
      </div>

      <ItemList 
        items={items} 
        loading={loading}
        onEdit={onEdit}
        onDelete={onDelete}
        onSyncToVSCU={onSyncToVSCU}
      />
    </div>
  );
};

export default ItemManagement;