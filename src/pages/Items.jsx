import { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';
import ItemManagement from '../components/items/ItemManagement';
import AddItemForm from '../components/items/AddItemForm';
import { 
  getItems, 
  saveItem, 
  deleteItem, 
  bulkImportItems, 
  checkVSCUStatus,
  sendItem,
  getItemInfo,
  sendItemComposition,
  getSettings,
  updateSettings
} from '../api/vscuApi';
import { useAuth } from '../context/AuthContext';

// Helper to map service to VSCU payload format (KRA compliant)
const mapServiceToVSCUPayload = (item) => {
  return {
    tin: item.tin || import.meta.env.VITE_VSCU_TIN,
    bhfId: item.bhfId || import.meta.env.VITE_VSCU_BHF_ID,
    itemCd: item.itemCd || item.item_cd,
    itemClsCd: item.itemClsCd || item.item_cls_cd || '5059690809',
    itemTyCd: item.itemTyCd || (item.item_type === 'product' ? '1' : '2'),
    itemNm: item.itemNm || item.item_name,
    itemStdNm: item.itemStdNm || null,
    orgnNatCd: item.orgnNatCd || item.orgn_nat_cd || 'KE',
    pkgUnitCd: item.pkgUnitCd || item.pkg_unit_cd || 'NT',
    qtyUnitCd: item.qtyUnitCd || item.qty_unit_cd || 'U',
    taxTyCd: item.taxTyCd || item.tax_type || 'B',
    btchNo: item.btchNo || null,
    bcd: item.bcd || null,
    dftPrc: item.dftPrc || item.price || 0,
    grpPrcL1: item.grpPrcL1 || item.price || 0,
    grpPrcL2: item.grpPrcL2 || item.price || 0,
    grpPrcL3: item.grpPrcL3 || item.price || 0,
    grpPrcL4: item.grpPrcL4 || item.price || 0,
    grpPrcL5: item.grpPrcL5 || null,
    addInfo: item.addInfo || null,
    sftyQty: item.sftyQty || item.sfty_qty || 0,
    isrcAplcbYn: item.isrcAplcbYn || 'N',
    useYn: item.useYn || item.use_yn || 'Y',
    regrNm: item.regrNm || 'Admin',
    regrId: item.regrId || 'Admin',
    modrNm: item.modrNm || 'Admin',
    modrId: item.modrId || 'Admin'
  };
};

// Service Categories
const SERVICE_CATEGORIES = [
  { id: 'basic', name: 'Basic Wash', color: 'bg-blue-100 text-blue-700',},
  { id: 'standard', name: 'Standard Wash', color: 'bg-green-100 text-green-700', },
  { id: 'premium', name: 'Premium Wash', color: 'bg-purple-100 text-purple-700', },
  { id: 'vip', name: 'VIP Wash', color: 'bg-amber-100 text-amber-700',},
  { id: 'interior', name: 'Interior', color: 'bg-cyan-100 text-cyan-700',},
  { id: 'addon', name: 'Add-ons', color: 'bg-gray-100 text-gray-700',},
];

// Bulk Import Modal
const BulkImportModal = ({ isOpen, onClose, onImport }) => {
  const [csvData, setCsvData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        toast.error('CSV must have header row and data rows');
        return;
      }

      const headerRow = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
      setHeaders(headerRow);

      const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        return headerRow.reduce((obj, header, index) => {
          obj[header] = values[index] || '';
          return obj;
        }, {});
      });

      setCsvData(rows);
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (csvData.length === 0) {
      toast.warning('No data to import');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      onImport(csvData);
      setIsLoading(false);
      onClose();
      setCsvData([]);
      setHeaders([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b">
          <h2 className="text-lg font-semibold text-[#1a2a4a]">Bulk Import Services</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center mb-4 hover:border-[#f47b20] transition">
            <svg className="w-14 h-14 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-gray-600 font-medium">Upload CSV file</p>
            <p className="text-xs text-gray-400 mt-1">Required: itemCd, itemNm, dftPrc, taxTyCd</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2.5 file:px-5 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-[#f47b20] file:text-white hover:file:bg-[#e06d1a] file:cursor-pointer"
            />
          </div>

          {csvData.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">{csvData.length} services ready</p>
              <div className="overflow-x-auto max-h-48 border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {headers.map((h, i) => (
                        <th key={i} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.slice(0, 10).map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {headers.map((h, j) => (
                          <td key={j} className="px-3 py-1.5 text-xs text-gray-600">{row[h] || '-'}</td>
                        ))}
                      </tr>
                    ))}
                    {csvData.length > 10 && (
                      <tr>
                        <td colSpan={headers.length} className="px-3 py-2 text-xs text-gray-400 text-center">
                          ... and {csvData.length - 10} more
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={csvData.length === 0 || isLoading}
            className="px-5 py-2 text-sm bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
          >
            {isLoading ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {isLoading ? 'Importing...' : `Import ${csvData.length} Services`}
          </button>
        </div>
      </div>
    </div>
  );
};

const Items = () => {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('all');

  const barcodeInputRef = useRef(null);

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  useEffect(() => {
    checkVSCU();
    fetchItems();
    
    const interval = setInterval(checkVSCU, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && barcodeInputRef.current) {
        const barcode = barcodeInputRef.current.value.trim();
        if (barcode) {
          const foundItem = items.find(item => 
            item.itemCd === barcode || 
            item.bcd === barcode
          );
          if (foundItem) {
            setSelectedItem(foundItem);
            setShowForm(true);
          }
          barcodeInputRef.current.value = '';
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [items]);

  const fetchItems = async () => {
    try {
      setLoading(true);
      const [itemsRes, settingsRes] = await Promise.all([
        getItems(),
        getSettings()
      ]);
      
      const data = itemsRes.data || [];
      setItems(data);
      setLastUpdated(new Date().toLocaleString());
      
      if (settingsRes.data?.items_last_sync) {
        const dateStr = settingsRes.data.items_last_sync;
        const date = new Date(
          dateStr.slice(0, 4) + '-' +
          dateStr.slice(4, 6) + '-' +
          dateStr.slice(6, 8) + ' ' +
          dateStr.slice(8, 10) + ':' +
          dateStr.slice(10, 12) + ':' +
          dateStr.slice(12, 14)
        );
        setLastSyncDate(date.toLocaleString());
      }
    } catch (error) {
      console.error('Failed to fetch services:', error);
      toast.error('Failed to load services');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const syncItemsFromVSCU = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setSyncing(true);
    try {
      const settingsRes = await getSettings();
      const lastSync = settingsRes.data?.items_last_sync || '20200101000000';
      
      const payload = {
        tin: import.meta.env.VITE_VSCU_TIN,
        bhfId: import.meta.env.VITE_VSCU_BHF_ID,
        lastReqDt: lastSync
      };

      const response = await getItemInfo(payload);
      
      if (response.data?.resultCd === '000' && response.data?.data?.itemList) {
        const vscuItems = response.data.data.itemList;
        
        for (const item of vscuItems) {
          await saveItem(item);
        }
        
        const now = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
        await updateSettings({ items_last_sync: now });
        
        await fetchItems();
        toast.success(`Synced ${vscuItems.length} items from VSCU`);
      } else {
        toast.info('No new items from VSCU');
      }
    } catch (error) {
      console.error('VSCU sync failed:', error);
      toast.error('Failed to sync from VSCU');
    } finally {
      setSyncing(false);
    }
  };

  const handleSendItemToVSCU = async (item) => {
    if (!item || !item.itemCd || !item.itemCd.trim()) return;
    if (!item.itemNm || !item.itemNm.trim()) return;
    
    if (!vscuOnline) {
      toast.info('VSCU offline. Service will be queued for sync.');
      return;
    }

    try {
      const payload = mapServiceToVSCUPayload({
        ...item,
        tin: import.meta.env.VITE_VSCU_TIN,
        bhfId: import.meta.env.VITE_VSCU_BHF_ID
      });

      await sendItem(payload);
      toast.success(`Service ${item.itemCd} sent to VSCU`);
      
      await saveItem({ ...item, synced: 1 });
      await fetchItems();
    } catch (error) {
      console.error('Send service to VSCU failed:', error);
      toast.warning(`Service ${item.itemCd} saved locally but VSCU sync failed.`);
      await saveItem({ ...item, synced: 0 });
      throw error;
    }
  };

  const handleSendComposition = async (payload) => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    try {
      const fixedPayload = {
        ...payload,
        tin: import.meta.env.VITE_VSCU_TIN || '',
        bhfId: import.meta.env.VITE_VSCU_BHF_ID || '00'
      };
      await sendItemComposition(fixedPayload);
      toast.success(`Composition sent for ${payload.itemCd}`);
    } catch (error) {
      console.error('Send composition failed:', error);
      toast.error('Failed to send composition');
    }
  };

  const handleAddItem = async (newItem) => {
    if (!newItem.itemCd || !newItem.itemCd.trim()) {
      toast.error('Service Code is required');
      return;
    }
    
    if (!newItem.itemNm || !newItem.itemNm.trim()) {
      toast.error('Service Name is required');
      return;
    }

    const existingItem = items.find(item => 
      item.itemCd === newItem.itemCd || item.item_cd === newItem.itemCd
    );
    if (existingItem) {
      toast.error(`Service code "${newItem.itemCd}" already exists!`);
      return;
    }

    setSaving(true);
    try {
      const serviceData = {
        ...newItem,
        item_type: newItem.item_type || 'service',
        itemTyCd: newItem.itemTyCd || '2',
      };
      
      const response = await saveItem(serviceData);
      const savedItem = response.data || serviceData;
      const serviceName = savedItem.itemNm || savedItem.item_name || savedItem.itemCd || savedItem.item_cd || 'Service';
      
      setItems(prev => [...prev, savedItem]);
      setShowForm(false);
      setLastUpdated(new Date().toLocaleString());
      
      if (vscuOnline) {
        try {
          await handleSendItemToVSCU(savedItem);
          toast.success(`"${serviceName}" saved and synced to KRA`);
        } catch (syncError) {
          toast.warning(`"${serviceName}" saved but VSCU sync failed.`);
        }
      } else {
        toast.info(`"${serviceName}" saved locally. Will sync when VSCU is online.`);
      }
      
      await fetchItems();
    } catch (error) {
      console.error('Failed to add service:', error);
      toast.error('Error saving service. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleEditItem = async (updatedItem) => {
    if (!updatedItem.itemCd || !updatedItem.itemCd.trim()) {
      toast.error('Service Code is required');
      return;
    }
    
    if (!updatedItem.itemNm || !updatedItem.itemNm.trim()) {
      toast.error('Service Name is required');
      return;
    }

    setSaving(true);
    try {
      const serviceData = {
        ...updatedItem,
        item_type: newItem.item_type || 'service',
        itemTyCd: newItem.itemTyCd || '2',
      };
      
      await saveItem(serviceData);
      const serviceName = serviceData.itemNm || serviceData.item_name || serviceData.itemCd || serviceData.item_cd || 'Service';
      
      setItems(prev => prev.map(item => 
        (item.itemCd === serviceData.itemCd || item.item_cd === serviceData.itemCd) ? serviceData : item
      ));
      setSelectedItem(null);
      setLastUpdated(new Date().toLocaleString());
      
      if (vscuOnline) {
        try {
          await handleSendItemToVSCU(serviceData);
          toast.success(`"${serviceName}" updated and synced to KRA`);
        } catch (syncError) {
          toast.warning(`"${serviceName}" updated but VSCU sync failed.`);
        }
      } else {
        toast.info(`"${serviceName}" updated locally. Will sync when VSCU is online.`);
      }
      
      await fetchItems();
    } catch (error) {
      console.error('Failed to update service:', error);
      toast.error('Error updating service. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (itemCd) => {
    if (!window.confirm('Delete this service?')) return;
    try {
      await deleteItem(itemCd);
      setItems(prev => prev.filter(item => 
        item.itemCd !== itemCd && item.item_cd !== itemCd
      ));
      setLastUpdated(new Date().toLocaleString());
      toast.success('Service deleted');
    } catch (error) {
      console.error('Failed to delete service:', error);
      toast.error('Error deleting service');
    }
  };

  const handleBulkSync = async () => {
    const unsynced = items.filter(item => item.synced === 0);
    if (unsynced.length === 0) {
      toast.info('All services are synced');
      return;
    }
    
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    if (!confirm(`Sync ${unsynced.length} services to VSCU?`)) return;
    
    setSyncing(true);
    let success = 0, failed = 0;

    for (const item of unsynced) {
      try {
        await handleSendItemToVSCU(item);
        success++;
      } catch {
        failed++;
      }
    }
    
    await fetchItems();
    toast.success(`Synced ${success} services, ${failed} failed`);
    setSyncing(false);
  };

  const handleBulkImport = async (importedData) => {
    try {
      await bulkImportItems(importedData);
      await fetchItems();
      toast.success(`Imported ${importedData.length} services`);
      
      if (vscuOnline) {
        const newItems = items.filter(i => i.synced === 0);
        if (newItems.length > 0) {
          await handleBulkSync();
        }
      }
    } catch (error) {
      console.error('Bulk import failed:', error);
      toast.error('Import failed');
    }
  };

  const getFilteredItems = () => {
    let filtered = items;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        (item.item_name || item.itemNm || '').toLowerCase().includes(term) ||
        (item.item_cd || item.itemCd || '').toLowerCase().includes(term)
      );
    }
    if (categoryFilter !== 'all') {
      filtered = filtered.filter(item => (item.category || 'addon') === categoryFilter);
    }
    return filtered;
  };

  const filteredItems = getFilteredItems();

  const stats = {
    total: items.length,
    avgPrice: items.length > 0 
      ? items.reduce((sum, i) => sum + Number(i.price || i.dftPrc || 0), 0) / items.length 
      : 0,
    synced: items.filter(i => i.synced === 1).length,
    local: items.filter(i => i.synced === 0).length,
    active: items.filter(i => (i.use_yn || i.useYn || 'Y') === 'Y').length,
  };

  return (
    <div>
      <input ref={barcodeInputRef} type="text" className="hidden" aria-hidden="true" />
      
      <BulkImportModal
        isOpen={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImport={handleBulkImport}
      />

      {/* Header */}
      <div className="mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">
            {selectedItem ? 'Edit Service' : 'Service Management'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {selectedItem 
              ? `Editing ${selectedItem.item_name || selectedItem.itemNm}` 
              : 'Manage car wash services with KRA eTIMS integration'}
          </p>
        </div>
        
        {/* VSCU Status */}
        <div className="flex items-center gap-3 bg-white px-3 py-2 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center gap-2">
            <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'} ${vscuOnline ? 'animate-pulse' : ''}`}></span>
            <span className="text-xs font-medium text-gray-600">
              VSCU: <span className={vscuOnline ? 'text-green-600' : 'text-red-600'}>
                {vscuOnline ? 'Online' : 'Offline'}
              </span>
            </span>
          </div>
          {stats.local > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span className="text-xs text-amber-600 font-medium">{stats.local} pending</span>
            </>
          )}
        </div>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-6 bg-white p-3 rounded-xl shadow-sm border border-gray-200">
        <div className="flex-1 min-w-50 relative">
          <input
            type="text"
            placeholder="Search services..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] bg-gray-50"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] bg-gray-50"
        >
          <option value="all">All Categories</option>
          {SERVICE_CATEGORIES.map(cat => (
            <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
          ))}
        </select>

        <button
          onClick={syncItemsFromVSCU}
          disabled={syncing || !vscuOnline}
          className={`px-3 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-medium ${
            syncing || !vscuOnline ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#1a2a4a] hover:bg-[#0f1a33] text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
          </svg>
          {syncing ? 'Syncing...' : 'Get from VSCU'}
        </button>

        <button
          onClick={() => setShowBulkImport(true)}
          className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-3 py-2 rounded-lg text-sm transition flex items-center gap-1.5 font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Bulk Import
        </button>

        {!selectedItem && (
          <button
            onClick={() => setShowForm(!showForm)}
            className={`px-4 py-2 rounded-lg text-sm transition flex items-center gap-2 font-medium ${
              showForm ? 'bg-gray-200 hover:bg-gray-300 text-gray-700' : 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
            }`}
          >
            {showForm ? 'Cancel' : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                </svg>
                Add Service
              </>
            )}
          </button>
        )}
      </div>

      {/* Secondary Actions Row */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <button
          onClick={handleBulkSync}
          disabled={syncing || stats.local === 0 || !vscuOnline}
          className={`px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 font-medium ${
            syncing || stats.local === 0 || !vscuOnline ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
          }`}
        >
          Send to VSCU ({stats.local})
        </button>

        {lastSyncDate && (
          <span className="text-xs text-gray-400 ml-auto">
            Last sync: {lastSyncDate}
          </span>
        )}
      </div>

      {/* Form */}
      {showForm && !selectedItem && (
        <div className="mb-6">
          <AddItemForm onSave={handleAddItem} onCancel={() => setShowForm(false)} isSaving={saving} />
        </div>
      )}

      {selectedItem && (
        <div className="mb-6">
          <AddItemForm 
            item={selectedItem} 
            onSave={handleEditItem} 
            onCancel={() => setSelectedItem(null)} 
            isSaving={saving}
          />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total Services</p>
          <p className="text-xl font-bold text-[#1a2a4a] mt-1">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Active</p>
          <p className="text-xl font-bold text-emerald-500 mt-1">{stats.active}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Avg Price</p>
          <p className="text-xl font-bold text-[#f47b20] mt-1">
            KES {Math.round(stats.avgPrice).toLocaleString()}
          </p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">VSCU Sync</p>
          <div className="flex items-center gap-4 mt-1">
            <span className="flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
              <span className="font-medium text-[#1a2a4a]">{stats.synced}</span>
            </span>
            <span className="flex items-center gap-1.5 text-sm">
              <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
              <span className="font-medium text-[#1a2a4a]">{stats.local}</span>
            </span>
          </div>
        </div>
      </div>

      {/* List View - Only */}
      {!showForm && !selectedItem && (
        <ItemManagement
          items={filteredItems}
          loading={loading}
          onEdit={setSelectedItem}
          onDelete={handleDeleteItem}
          onSyncToVSCU={handleSendItemToVSCU}
        />
      )}
    </div>
  );
};

export default Items;