import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { 
  getLocalImportItems, 
  getImportItemsFromVSCU, 
  updateImportItems, 
  getItems, 
  getSyncStatus, 
  processSync, 
  checkVSCUStatus 
} from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';

const Imports = () => {
  const [imports, setImports] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [selectedImport, setSelectedImport] = useState(null);
  const [selectedItem, setSelectedItem] = useState('');
  const [matching, setMatching] = useState(false);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [importPendingCount, setImportPendingCount] = useState(0);
  const [fetchingFromVSCU, setFetchingFromVSCU] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState('');

  useEffect(() => {
    fetchImports();
    fetchItems();
    checkVSCU();
    fetchImportSyncStatus();
  }, []);

  const fetchImports = async () => {
    try {
      setLoading(true);
      const response = await getLocalImportItems();
      setImports(response.data || []);
    } catch (error) {
      console.error('Failed to fetch imports:', error);
      toast.error('Error loading import records');
    } finally {
      setLoading(false);
    }
  };

  const fetchItems = async () => {
    try {
      const response = await getItems();
      setItems(response.data || []);
    } catch (error) {
      console.error('Failed to fetch items:', error);
    }
  };

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const fetchImportSyncStatus = async () => {
    try {
      const response = await getSyncStatus();
      const byEndpoint = response.data?.byEndpoint || [];
      let importCount = 0;
      byEndpoint.forEach(item => {
        if (item.endpoint === '/imports/updateImportItems') {
          importCount = item.count;
        }
      });
      setImportPendingCount(importCount);
    } catch (error) {
      console.error('Failed to fetch import sync status:', error);
    }
  };

  // Fetch imports from KRA VSCU - saves to database via backend
  const fetchImportsFromVSCU = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setFetchingFromVSCU(true);
    try {
      const response = await getImportItemsFromVSCU(lastSyncDate || '20200101000000');

      if (response.data?.resultCd === '000') {
        const importList = response.data?.data?.itemList || [];

        if (importList.length > 0) {
          await fetchImports();
          setLastSyncDate(new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14));
          toast.success(`Fetched ${importList.length} imports from KRA`);
        } else {
          toast.info('No new imports found from KRA');
        }
      } else {
        toast.warning(response.data?.resultMsg || 'No imports found');
      }
    } catch (error) {
      console.error('Failed to fetch imports from VSCU:', error);
      toast.error('Failed to fetch imports from KRA');
    } finally {
      setFetchingFromVSCU(false);
    }
  };

  const handleSync = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please try again later.');
      return;
    }

    setSyncing(true);
    setSyncMessage('Syncing imports...');

    try {
      const response = await processSync();

      if (response.data.success) {
        const { synced, failed } = response.data;
        if (synced > 0 && failed === 0) {
          setSyncMessage(`${synced} imports synced`);
          toast.success(`Synced ${synced} imports successfully`);
        } else if (synced > 0 && failed > 0) {
          setSyncMessage(`${synced} synced, ${failed} failed`);
          toast.warning(`Synced ${synced} imports, ${failed} failed`);
        } else if (synced === 0 && failed > 0) {
          setSyncMessage(`${failed} imports failed`);
          toast.error(`Sync failed: ${failed} imports`);
        } else {
          setSyncMessage('No imports to sync');
          toast.info('No pending imports to sync');
        }
      } else {
        setSyncMessage('Sync issue');
        toast.warning('Sync completed with issues');
      }

      fetchImportSyncStatus();
      checkVSCU();
      fetchImports();
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncMessage('Sync failed');
      toast.error('Sync failed. Please try again.');
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const handleMatch = (importRecord) => {
    setSelectedImport(importRecord);
    setSelectedItem('');
    setShowMatchModal(true);
  };

  const handleConfirmMatch = async () => {
    if (!selectedItem) {
      toast.error('Please select an item to match');
      return;
    }

    const taskCd = selectedImport.taskCd || selectedImport.task_cd;
    if (!taskCd) {
      toast.error('Task code not found for this import');
      return;
    }

    // Get the selected item details
    const selectedItemObj = items.find(i => i.item_cd === selectedItem);
    if (!selectedItemObj) {
      toast.error('Selected item not found');
      return;
    }

    setMatching(true);
    try {
      const payload = {
        tin: import.meta.env.VITE_VSCU_TIN || process.env.TIN,
        bhfId: import.meta.env.VITE_VSCU_BHF_ID || process.env.BHF_ID,
        taskCd: taskCd,
        dclDe: selectedImport.dclDe || new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 8),
        itemSeq: selectedImport.itemSeq || 1,
        hsCd: selectedImport.hsCd || selectedImport.hs_cd || '',
        itemClsCd: selectedItemObj.item_cls_cd || selectedItemObj.itemClsCd,
        itemCd: selectedItem,
        imptItemSttsCd: '1',
        modrNm: 'Admin',
        modrId: 'Admin'
      };

      console.log('Match payload:', payload);
      await updateImportItems(payload);

      toast.success('Import matched successfully!');
      setShowMatchModal(false);
      fetchImports();
      fetchImportSyncStatus();
    } catch (error) {
      console.error('Match failed:', error);
      toast.error(error.response?.data?.message || 'Failed to match import');
    } finally {
      setMatching(false);
    }
  };

  const getStatusBadge = (status) => {
    if (status === '1') {
      return { label: 'Matched', color: 'bg-green-100 text-green-700' };
    }
    return { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' };
  };

  const filteredImports = imports.filter(imp => {
    const search = searchTerm.toLowerCase();
    const itemName = imp.itemNm || imp.item_name || '';
    const taskCd = imp.taskCd || imp.task_cd || '';
    const hsCd = imp.hsCd || imp.hs_cd || '';

    const matchesSearch = itemName.toLowerCase().includes(search) ||
      taskCd.toLowerCase().includes(search) ||
      hsCd.toLowerCase().includes(search);

    if (filterStatus === 'all') return matchesSearch;
    if (filterStatus === 'matched') return matchesSearch && (imp.imptItemSttsCd === '1' || imp.impt_item_stts_cd === '1');
    if (filterStatus === 'pending') return matchesSearch && (imp.imptItemSttsCd === '0' || !imp.imptItemSttsCd || imp.impt_item_stts_cd === '0' || !imp.impt_item_stts_cd);
    return matchesSearch;
  });

  const stats = {
    total: imports.length,
    matched: imports.filter(i => i.imptItemSttsCd === '1' || i.impt_item_stts_cd === '1').length,
    pending: imports.filter(i => i.imptItemSttsCd === '0' || !i.imptItemSttsCd || i.impt_item_stts_cd === '0' || !i.impt_item_stts_cd).length,
  };

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">Imports Management</h1>
          <p className="text-gray-500 text-sm">Match customs import records to inventory items</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={fetchImportsFromVSCU}
            disabled={fetchingFromVSCU || !vscuOnline}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${fetchingFromVSCU || !vscuOnline
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-[#1a2a4a] hover:bg-[#0f1a33] text-white'
              }`}
            title={vscuOnline ? 'Fetch imports from KRA' : 'VSCU Offline'}
          >
            {fetchingFromVSCU ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            )}
            <span className="text-sm font-medium">
              {fetchingFromVSCU ? 'Fetching...' : 'Get from KRA'}
            </span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing || importPendingCount === 0}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${syncing || importPendingCount === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : vscuOnline
                ? 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
                : 'bg-yellow-500 hover:bg-yellow-600 text-white'
              }`}
            title={vscuOnline ? 'Sync imports to KRA' : 'VSCU Offline - Imports queued'}
          >
            {syncing ? (
              <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            ) : syncMessage ? (
              <span className="text-xs">{syncMessage}</span>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
              </svg>
            )}
            <span className="text-sm font-medium">
              {syncing ? 'Syncing...' : syncMessage || 'Sync to KRA'}
            </span>
            {importPendingCount > 0 && !syncMessage && (
              <span className="ml-1 bg-white/20 px-2 py-0.5 rounded-full text-xs">
                {importPendingCount}
              </span>
            )}
          </button>

          <button
            onClick={fetchImports}
            disabled={loading}
            className="bg-[#1a2a4a] hover:bg-[#0f1a33] text-white px-4 py-2 rounded-lg transition flex items-center gap-2 disabled:opacity-50"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Sync Status Bar */}
      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-xs font-medium text-gray-600">
            VSCU: {vscuOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="h-4 w-px bg-gray-200"></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {importPendingCount > 0 ? (
              <span className="text-yellow-600 font-medium">{importPendingCount} imports pending sync</span>
            ) : (
              <span className="text-green-600">All imports synced</span>
            )}
          </span>
        </div>
        {lastSyncDate && (
          <>
            <div className="h-4 w-px bg-gray-200"></div>
            <span className="text-xs text-gray-400">Last sync: {lastSyncDate}</span>
          </>
        )}
        {!vscuOnline && importPendingCount > 0 && (
          <span className="text-xs text-yellow-600">(Auto-sync when online)</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Total Imports</p>
          <p className="text-xl font-bold text-[#1a2a4a]">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Matched</p>
          <p className="text-xl font-bold text-green-600">{stats.matched}</p>
        </div>
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-xl font-bold text-yellow-600">{stats.pending}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6 bg-white p-3 rounded-xl shadow-sm border border-gray-100">
        <div className="flex-1 min-w-[200px] relative">
          <input
            type="text"
            placeholder="Search by task, HS code, or item name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 pl-9 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent bg-gray-50"
          />
          <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-[#f47b20] focus:border-transparent bg-gray-50"
        >
          <option value="all">All</option>
          <option value="pending">Pending</option>
          <option value="matched">Matched</option>
        </select>
      </div>

      {/* Imports Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Task Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HS Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item Name</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredImports.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-400">
                      No import records found. Click "Get from KRA" to fetch.
                    </td>
                  </tr>
                ) : (
                  filteredImports.map((imp) => {
                    const status = getStatusBadge(imp.imptItemSttsCd || imp.impt_item_stts_cd);
                    const isMatched = imp.imptItemSttsCd === '1' || imp.impt_item_stts_cd === '1';
                    return (
                      <tr key={imp.taskCd || imp.task_cd} className="border-b border-gray-50 hover:bg-gray-50 transition">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {imp.taskCd || imp.task_cd}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-600">
                          {imp.hsCd || imp.hs_cd || '-'}
                        </td>
                        <td className="px-4 py-3 text-[#1a2a4a]">
                          {imp.itemNm || imp.item_name || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {imp.qty || imp.quantity || 0}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                          {imp.dclDe || imp.dcl_de || '-'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                            {status.label}
                          </span>
                          {isMatched && imp.item_cd && (
                            <span className="ml-1 text-xs text-gray-400">
                              ({imp.item_cd})
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isMatched ? (
                            <span className="text-xs text-gray-400">Matched</span>
                          ) : (
                            <button
                              onClick={() => handleMatch(imp)}
                              className="text-xs bg-[#f47b20] hover:bg-[#e06d1a] text-white px-3 py-1 rounded-lg transition"
                            >
                              Match Item
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Match Modal */}
      {showMatchModal && selectedImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1a2a4a]">Match Import to Inventory</h2>
              <button
                onClick={() => setShowMatchModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-5">
              <div className="mb-4">
                <p className="text-sm text-gray-500">Import Record</p>
                <p className="font-medium text-[#1a2a4a]">{selectedImport.item_name || selectedImport.itemNm || 'Unknown'}</p>
                <p className="text-xs text-gray-400">Task: {selectedImport.task_cd || selectedImport.taskCd}</p>
                <p className="text-xs text-gray-400">HS Code: {selectedImport.hs_cd || selectedImport.hsCd || 'N/A'}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Inventory Item</label>
                <select
                  value={selectedItem}
                  onChange={(e) => setSelectedItem(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="">Select an item...</option>
                  {items.map((item) => (
                    <option key={item.item_cd} value={item.item_cd}>
                      {item.item_name} ({item.item_cd})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowMatchModal(false)}
                className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmMatch}
                disabled={!selectedItem || matching}
                className="px-5 py-2 text-sm bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {matching ? 'Matching...' : 'Confirm Match'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Imports;