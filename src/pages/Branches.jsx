import { useState, useEffect } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { getBranches, saveBranch, getBranchesFromVSCU, checkVSCUStatus, getSyncStatus } from '../api/vscuApi';
import axiosInstance from '../api/axiosConfig';

const Branches = () => {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [vscuOnline, setVscuOnline] = useState(false);
  const [branchPendingCount, setBranchPendingCount] = useState(0);
  const [syncMessage, setSyncMessage] = useState('');
  const [fetchingFromVSCU, setFetchingFromVSCU] = useState(false);
  const [lastSyncDate, setLastSyncDate] = useState('');
  const [activeTab, setActiveTab] = useState('branches');
  const [selectedBranchId, setSelectedBranchId] = useState('00');

  const [branchUsers, setBranchUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [branchInsurance, setBranchInsurance] = useState([]);
  const [loadingInsurance, setLoadingInsurance] = useState(false);

  const [showUserForm, setShowUserForm] = useState(false);
  const [userData, setUserData] = useState({
    userId: '',
    userNm: '',
    userPwd: '',
    userTyCd: '01',
    useYn: 'Y'
  });
  const [savingUser, setSavingUser] = useState(false);

  const [showInsuranceForm, setShowInsuranceForm] = useState(false);
  const [insuranceData, setInsuranceData] = useState({
    isrccCd: '',
    isrccNm: '',
    isrccRate: '',
    useYn: 'Y'
  });
  const [savingInsurance, setSavingInsurance] = useState(false);

  const [formData, setFormData] = useState({
    bhf_id: '',
    bhf_name: '',
    bhf_stts_cd: '01',
    prvnc_nm: '',
    dstrt_nm: '',
    sctr_nm: '',
    loc_desc: '',
    mgr_nm: '',
    mgr_tel_no: '',
    mgr_email: '',
    hq_yn: 'N',
    address: '',
    phone: '',
    email: '',
    use_yn: 'Y'
  });

  const VITE_TIN = import.meta.env.VITE_VSCU_TIN || '';
  const VITE_BHF_ID = import.meta.env.VITE_VSCU_BHF_ID || '00';

  useEffect(() => {
    fetchBranches();
    checkVSCU();
    fetchBranchSyncStatus();
  }, []);

  useEffect(() => {
    if (activeTab === 'users' && selectedBranchId) {
      fetchBranchUsers(selectedBranchId);
    }
  }, [activeTab, selectedBranchId]);

  useEffect(() => {
    if (activeTab === 'insurance' && selectedBranchId) {
      fetchBranchInsurance(selectedBranchId);
    }
  }, [activeTab, selectedBranchId]);

  const checkVSCU = async () => {
    try {
      const response = await checkVSCUStatus();
      setVscuOnline(response.data?.online || false);
    } catch {
      setVscuOnline(false);
    }
  };

  const fetchBranches = async () => {
    try {
      setLoading(true);
      const response = await getBranches();
      setBranches(response.data || []);
      if (response.data && response.data.length > 0) {
        setSelectedBranchId(response.data[0].bhf_id || response.data[0].bhfId || '00');
      }
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      toast.error('Error loading branches');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchUsers = async (bhfId) => {
    setLoadingUsers(true);
    try {
      const response = await axiosInstance.get(`/api/branches/${bhfId}/users`);
      setBranchUsers(response.data || []);
    } catch (error) {
      console.error('Failed to fetch branch users:', error);
      setBranchUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  };

  const fetchBranchInsurance = async (bhfId) => {
    setLoadingInsurance(true);
    try {
      const response = await axiosInstance.get(`/api/branches/${bhfId}/insurance`);
      setBranchInsurance(response.data || []);
    } catch (error) {
      console.error('Failed to fetch branch insurance:', error);
      setBranchInsurance([]);
    } finally {
      setLoadingInsurance(false);
    }
  };

  const fetchBranchSyncStatus = async () => {
    try {
      const response = await getSyncStatus();
      const byEndpoint = response.data?.byEndpoint || [];
      let count = 0;
      byEndpoint.forEach(item => {
        if (item.endpoint === '/branches/saveBrancheCustomers' || 
            item.endpoint === '/branches/saveBrancheUsers') {
          count += item.count;
        }
      });
      setBranchPendingCount(count);
    } catch (error) {
      console.error('Failed to fetch branch sync status:', error);
    }
  };

  const syncFromVSCU = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    setFetchingFromVSCU(true);
    setSyncMessage('Fetching branches from KRA...');
    try {
      const response = await getBranchesFromVSCU('20200101000000');

      if (response.data?.resultCd === '000') {
        const branchList = response.data?.data?.bhfList || [];

        if (branchList.length > 0) {
          await axiosInstance.post('/api/branches/bulk', branchList);
          await fetchBranches();
          setLastSyncDate(new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14));
          toast.success(`Synced ${branchList.length} branches from KRA`);
          setSyncMessage(`Synced ${branchList.length} branches`);
        } else {
          toast.info('No branches found in KRA');
          setSyncMessage('No new branches');
        }
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to sync branches');
        setSyncMessage('Sync failed');
      }
    } catch (error) {
      console.error('Sync failed:', error);
      toast.error('Failed to sync branches from VSCU');
      setSyncMessage('Sync failed');
    } finally {
      setFetchingFromVSCU(false);
      setTimeout(() => setSyncMessage(''), 5000);
    }
  };

  const sendUserToKRA = async (user) => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    const payload = {
      tin: VITE_TIN,
      bhfId: selectedBranchId || '00',
      userId: user.user_id,
      userNm: user.user_name || user.full_name || user.user_id,
      pwd: '12345678',
      adrs: null,
      cntc: null,
      authCd: null,
      remark: null,
      useYn: user.use_yn || 'Y',
      regrNm: 'Admin',
      regrId: 'Admin',
      modrNm: 'Admin',
      modrId: 'Admin'
    };

    try {
      const response = await axiosInstance.post('/api/branches/saveBrancheUsers', payload);
      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success(`User ${user.user_id} sent to KRA successfully`);
        await fetchBranchUsers(selectedBranchId);
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to send user to KRA');
      }
    } catch (error) {
      console.error('Failed to send user to KRA:', error);
      toast.error('Failed to send user to KRA');
    }
  };

  const sendInsuranceToKRA = async (ins) => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    const payload = {
      tin: VITE_TIN,
      bhfId: selectedBranchId || '00',
      isrccCd: ins.isrcc_cd,
      isrccNm: ins.isrcc_nm,
      isrcRt: ins.isrc_rt || 0,
      regrNm: 'Admin',
      regrId: 'Admin',
      modrNm: 'Admin',
      modrId: 'Admin',
      useYn: ins.use_yn || 'Y',
      remark: null
    };

    try {
      const response = await axiosInstance.post('/api/branches/saveBrancheInsurances', payload);
      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success(`Insurance ${ins.isrcc_cd} sent to KRA successfully`);
        await fetchBranchInsurance(selectedBranchId);
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to send insurance to KRA');
      }
    } catch (error) {
      console.error('Failed to send insurance to KRA:', error);
      toast.error('Failed to send insurance to KRA');
    }
  };

  const saveBranchUser = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    if (!userData.userId || !userData.userNm) {
      toast.error('User ID and Name are required');
      return;
    }

    if (!userData.userPwd || userData.userPwd.length < 4) {
      toast.error('Password must be at least 4 characters');
      return;
    }

    setSavingUser(true);
    try {
      const payload = {
        tin: VITE_TIN,
        bhfId: selectedBranchId || '00',
        userId: userData.userId,
        userNm: userData.userNm,
        pwd: userData.userPwd,
        adrs: null,
        cntc: null,
        authCd: null,
        remark: null,
        useYn: userData.useYn || 'Y',
        regrNm: 'Admin',
        regrId: 'Admin',
        modrNm: 'Admin',
        modrId: 'Admin'
      };

      const response = await axiosInstance.post('/api/branches/saveBrancheUsers', payload);

      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success(`User "${userData.userNm}" synced to KRA successfully`);
        setShowUserForm(false);
        setUserData({ userId: '', userNm: '', userPwd: '', userTyCd: '01', useYn: 'Y' });
        await fetchBranchUsers(selectedBranchId);
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to sync user');
      }
    } catch (error) {
      console.error('Failed to save branch user:', error);
      toast.error('Failed to sync user to KRA');
    } finally {
      setSavingUser(false);
    }
  };

  const saveBranchInsurance = async () => {
    if (!vscuOnline) {
      toast.error('VSCU is offline. Please start VSCU first.');
      return;
    }

    if (!insuranceData.isrccCd || !insuranceData.isrccNm) {
      toast.error('Insurance Code and Name are required');
      return;
    }

    if (!insuranceData.isrccRate || parseFloat(insuranceData.isrccRate) <= 0) {
      toast.error('Insurance rate is required and must be greater than 0');
      return;
    }

    setSavingInsurance(true);
    try {
      const payload = {
        tin: VITE_TIN,
        bhfId: selectedBranchId || '00',
        isrccCd: insuranceData.isrccCd,
        isrccNm: insuranceData.isrccNm,
        isrcRt: parseFloat(insuranceData.isrccRate) || 0,
        regrNm: 'Admin',
        regrId: 'Admin',
        modrNm: 'Admin',
        modrId: 'Admin',
        useYn: insuranceData.useYn || 'Y',
        remark: null
      };

      const response = await axiosInstance.post('/api/branches/saveBrancheInsurances', payload);

      if (response.data?.resultCd === '000' || response.data?.resultCd === '00') {
        toast.success(`Insurance "${insuranceData.isrccNm}" synced to KRA successfully`);
        setShowInsuranceForm(false);
        setInsuranceData({ isrccCd: '', isrccNm: '', isrccRate: '', useYn: 'Y' });
        await fetchBranchInsurance(selectedBranchId);
      } else {
        toast.warning(response.data?.resultMsg || 'Failed to sync insurance');
        console.error('VSCU Error:', response.data);
      }
    } catch (error) {
      console.error('Failed to save branch insurance:', error);
      const errorMsg = error.response?.data?.error || 
                       error.response?.data?.resultMsg || 
                       error.response?.data?.message ||
                       'Failed to sync insurance to KRA';
      toast.error(errorMsg);
      if (error.response?.data) {
        console.error('VSCU Error Details:', JSON.stringify(error.response.data, null, 2));
      }
    } finally {
      setSavingInsurance(false);
    }
  };

  const handleAdd = () => {
    setEditingBranch(null);
    setFormData({
      bhf_id: '',
      bhf_name: '',
      bhf_stts_cd: '01',
      prvnc_nm: '',
      dstrt_nm: '',
      sctr_nm: '',
      loc_desc: '',
      mgr_nm: '',
      mgr_tel_no: '',
      mgr_email: '',
      hq_yn: 'N',
      address: '',
      phone: '',
      email: '',
      use_yn: 'Y'
    });
    setShowForm(true);
  };

  const handleEdit = (branch) => {
    setEditingBranch(branch);
    setFormData({
      bhf_id: branch.bhf_id || branch.bhfId || '',
      bhf_name: branch.bhf_name || branch.bhfNm || '',
      bhf_stts_cd: branch.bhf_stts_cd || branch.bhfSttsCd || '01',
      prvnc_nm: branch.prvnc_nm || branch.prvncNm || '',
      dstrt_nm: branch.dstrt_nm || branch.dstrtNm || '',
      sctr_nm: branch.sctr_nm || branch.sctrNm || '',
      loc_desc: branch.loc_desc || branch.locDesc || '',
      mgr_nm: branch.mgr_nm || branch.mgrNm || '',
      mgr_tel_no: branch.mgr_tel_no || branch.mgrTelNo || '',
      mgr_email: branch.mgr_email || branch.mgrEmail || '',
      hq_yn: branch.hq_yn || branch.hqYn || 'N',
      address: branch.address || '',
      phone: branch.phone || '',
      email: branch.email || '',
      use_yn: branch.use_yn || branch.useYn || 'Y'
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bhf_id || !formData.bhf_name) {
      toast.error('Branch ID and Name are required');
      return;
    }

    try {
      const payload = {
        bhf_id: formData.bhf_id,
        bhf_name: formData.bhf_name,
        bhf_stts_cd: formData.bhf_stts_cd || '01',
        prvnc_nm: formData.prvnc_nm || null,
        dstrt_nm: formData.dstrt_nm || null,
        sctr_nm: formData.sctr_nm || null,
        loc_desc: formData.loc_desc || null,
        mgr_nm: formData.mgr_nm || null,
        mgr_tel_no: formData.mgr_tel_no || null,
        mgr_email: formData.mgr_email || null,
        hq_yn: formData.hq_yn || 'N',
        address: formData.address || null,
        phone: formData.phone || null,
        email: formData.email || null,
        use_yn: formData.use_yn || 'Y'
      };

      await saveBranch(payload);
      toast.success(editingBranch ? 'Branch updated successfully' : 'Branch added successfully');
      setShowForm(false);
      fetchBranches();
      fetchBranchSyncStatus();
    } catch (error) {
      console.error('Failed to save branch:', error);
      toast.error('Error saving branch');
    }
  };

  const getStatusBadge = (useYn) => {
    if (useYn === 'Y' || useYn === 'y') {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Active</span>;
    }
    return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">Inactive</span>;
  };

  const getHqBadge = (hqYn) => {
    if (hqYn === 'Y' || hqYn === 'y') {
      return <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">HQ</span>;
    }
    return <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium">Branch</span>;
  };

  const getSyncedBadge = (synced) => {
    if (synced === 1) {
      return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Synced</span>;
    }
    return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Local Only</span>;
  };

  return (
    <div className="p-4">
      <ToastContainer position="top-right" autoClose={3000} />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1a2a4a]">Branches</h1>
          <p className="text-gray-500 text-sm">Manage branch locations, users, and insurance</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={syncFromVSCU}
            disabled={fetchingFromVSCU || !vscuOnline}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              fetchingFromVSCU || !vscuOnline
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white'
            }`}
            title={vscuOnline ? 'Sync branches from KRA' : 'VSCU Offline'}
          >
            {fetchingFromVSCU ? (
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
              {fetchingFromVSCU ? 'Syncing...' : syncMessage || 'Sync from KRA'}
            </span>
          </button>

          <button
            onClick={() => setShowUserForm(true)}
            disabled={!vscuOnline || !selectedBranchId}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              !vscuOnline || !selectedBranchId
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white'
            }`}
            title={vscuOnline ? 'Sync user to KRA' : 'VSCU Offline'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span className="text-sm font-medium">Add User</span>
          </button>

          <button
            onClick={() => setShowInsuranceForm(true)}
            disabled={!vscuOnline || !selectedBranchId}
            className={`px-4 py-2 rounded-lg transition flex items-center gap-2 ${
              !vscuOnline || !selectedBranchId
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-[#1a2a4a] hover:bg-[#2a3a5a] text-white'
            }`}
            title={vscuOnline ? 'Sync insurance to KRA' : 'VSCU Offline'}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-sm font-medium">Add Insurance</span>
          </button>

          <button
            onClick={handleAdd}
            className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-4 py-2 rounded-lg transition flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Branch
          </button>

          <button
            onClick={fetchBranches}
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

      <div className="flex items-center gap-3 mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border border-gray-100">
        <span className={`inline-block w-2 h-2 rounded-full ${vscuOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
        <span className="text-xs font-medium text-gray-600">
          VSCU: {vscuOnline ? 'Online' : 'Offline'}
        </span>
        <div className="h-4 w-px bg-gray-200"></div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {branchPendingCount > 0 ? (
              <span className="text-yellow-600 font-medium">{branchPendingCount} branches pending sync</span>
            ) : (
              <span className="text-green-600">All branches synced</span>
            )}
          </span>
        </div>
        {lastSyncDate && (
          <>
            <div className="h-4 w-px bg-gray-200"></div>
            <span className="text-xs text-gray-400">Last sync: {lastSyncDate}</span>
          </>
        )}
        {!vscuOnline && branchPendingCount > 0 && (
          <span className="text-xs text-yellow-600">(Auto-sync when online)</span>
        )}
        <span className="text-xs text-gray-400 ml-auto">
          {branches.length} branches
        </span>
      </div>

      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setActiveTab('branches')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'branches'
              ? 'border-b-2 border-[#f47b20] text-[#f47b20]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Branches
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'users'
              ? 'border-b-2 border-[#f47b20] text-[#f47b20]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Users ({branchUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('insurance')}
          className={`px-4 py-2 text-sm font-medium transition ${
            activeTab === 'insurance'
              ? 'border-b-2 border-[#f47b20] text-[#f47b20]'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Insurance ({branchInsurance.length})
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <h2 className="text-lg font-semibold text-[#1a2a4a] mb-4">
            {editingBranch ? 'Edit Branch' : 'Add New Branch'}
          </h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch ID *</label>
                <input
                  type="text"
                  value={formData.bhf_id}
                  onChange={(e) => setFormData({ ...formData, bhf_id: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., 00, 01, 02"
                  required
                  disabled={editingBranch}
                />
                {editingBranch && (
                  <p className="text-xs text-gray-400 mt-1">ID cannot be changed</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  value={formData.bhf_name}
                  onChange={(e) => setFormData({ ...formData, bhf_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., Head Office, Branch 01"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Province</label>
                <input
                  type="text"
                  value={formData.prvnc_nm}
                  onChange={(e) => setFormData({ ...formData, prvnc_nm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., Nairobi"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">District</label>
                <input
                  type="text"
                  value={formData.dstrt_nm}
                  onChange={(e) => setFormData({ ...formData, dstrt_nm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., Westlands District"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sector</label>
                <input
                  type="text"
                  value={formData.sctr_nm}
                  onChange={(e) => setFormData({ ...formData, sctr_nm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., Westlands"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager Name</label>
                <input
                  type="text"
                  value={formData.mgr_nm}
                  onChange={(e) => setFormData({ ...formData, mgr_nm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager Phone</label>
                <input
                  type="text"
                  value={formData.mgr_tel_no}
                  onChange={(e) => setFormData({ ...formData, mgr_tel_no: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., +254 700 000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Manager Email</label>
                <input
                  type="email"
                  value={formData.mgr_email}
                  onChange={(e) => setFormData({ ...formData, mgr_email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., manager@evopay.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Headquarters</label>
                <select
                  value={formData.hq_yn}
                  onChange={(e) => setFormData({ ...formData, hq_yn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="Y">Yes (Headquarters)</option>
                  <option value="N">No (Branch)</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={formData.use_yn}
                  onChange={(e) => setFormData({ ...formData, use_yn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="Y">Active</option>
                  <option value="N">Inactive</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., Nairobi, Kenya"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., +254 700 000000"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., branch@evopay.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Location Description</label>
                <input
                  type="text"
                  value={formData.loc_desc}
                  onChange={(e) => setFormData({ ...formData, loc_desc: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., 3rd Floor, Westlands Tower"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                type="submit"
                className="bg-[#f47b20] hover:bg-[#e06d1a] text-white px-6 py-2 rounded-lg transition"
              >
                {editingBranch ? 'Update' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="border border-gray-300 hover:bg-gray-50 px-4 py-2 rounded-lg transition"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'branches' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Province</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">District</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sector</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manager</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">HQ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center">
                      <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </td>
                  </tr>
                ) : branches.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="px-4 py-8 text-center text-gray-400">
                      No branches found. Click "Add Branch" to create one or "Sync from KRA" to fetch.
                    </td>
                  </tr>
                ) : (
                  branches.map((branch) => (
                    <tr 
                      key={branch.bhf_id || branch.bhfId} 
                      className={`border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer ${
                        (branch.bhf_id || branch.bhfId) === selectedBranchId ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => {
                        setSelectedBranchId(branch.bhf_id || branch.bhfId);
                        if (activeTab === 'users') fetchBranchUsers(branch.bhf_id || branch.bhfId);
                        if (activeTab === 'insurance') fetchBranchInsurance(branch.bhf_id || branch.bhfId);
                      }}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">
                        {branch.bhf_id || branch.bhfId}
                      </td>
                      <td className="px-4 py-3 font-medium text-[#1a2a4a]">
                        {branch.bhf_name || branch.bhfNm}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {branch.prvnc_nm || branch.prvncNm || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {branch.dstrt_nm || branch.dstrtNm || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {branch.sctr_nm || branch.sctrNm || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {branch.mgr_nm || branch.mgrNm || '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-600">
                        {branch.mgr_tel_no || branch.mgrTelNo || branch.phone || '-'}
                      </td>
                      <td className="px-4 py-3">
                        {getHqBadge(branch.hq_yn || branch.hqYn)}
                      </td>
                      <td className="px-4 py-3">
                        {getStatusBadge(branch.use_yn || branch.useYn)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEdit(branch); }}
                          className="text-[#1a2a4a] hover:text-[#0f1a33] text-xs mr-3"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Delete this branch?')) {
                              toast.info('Delete function coming soon');
                            }
                          }}
                          className="text-red-600 hover:text-red-800 text-xs"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Users for Branch: <span className="text-[#1a2a4a]">{selectedBranchId}</span>
            </span>
            <span className="text-xs text-gray-500">{branchUsers.length} users</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">User ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sync</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center">
                      <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </td>
                  </tr>
                ) : branchUsers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                      No users found for this branch. Click "Add User" to create one.
                    </td>
                  </tr>
                ) : (
                  branchUsers.map((user) => (
                    <tr key={user.user_id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-[#1a2a4a]">{user.user_id}</td>
                      <td className="px-4 py-3 text-[#1a2a4a]">{user.full_name || user.user_name || '-'}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                          user.role === 'manager' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {user.role || 'cashier'}
                        </span>
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(user.use_yn)}</td>
                      <td className="px-4 py-3">{getSyncedBadge(user.synced)}</td>
                      <td className="px-4 py-3">
                        {user.synced !== 1 && (
                          <button
                            onClick={() => sendUserToKRA(user)}
                            disabled={!vscuOnline}
                            className={`text-xs px-2 py-1 rounded ${
                              vscuOnline
                                ? 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            Send to KRA
                          </button>
                        )}
                        {user.synced === 1 && (
                          <span className="text-xs text-green-600 font-medium">Synced</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'insurance' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">
              Insurance for Branch: <span className="text-[#1a2a4a]">{selectedBranchId}</span>
            </span>
            <span className="text-xs text-gray-500">{branchInsurance.length} insurance providers</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rate (%)</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sync</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                </tr>
              </thead>
              <tbody>
                {loadingInsurance ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center">
                      <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    </td>
                  </tr>
                ) : branchInsurance.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-400">
                      No insurance providers found for this branch. Click "Add Insurance" to create one.
                    </td>
                  </tr>
                ) : (
                  branchInsurance.map((ins) => (
                    <tr key={ins.id} className="border-b border-gray-50 hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono text-xs font-medium text-[#1a2a4a]">{ins.isrcc_cd}</td>
                      <td className="px-4 py-3 text-[#1a2a4a]">{ins.isrcc_nm}</td>
                      <td className="px-4 py-3 text-gray-600">{ins.isrc_rt}%</td>
                      <td className="px-4 py-3">{getStatusBadge(ins.use_yn)}</td>
                      <td className="px-4 py-3">{getSyncedBadge(ins.synced)}</td>
                      <td className="px-4 py-3">
                        {ins.synced !== 1 && (
                          <button
                            onClick={() => sendInsuranceToKRA(ins)}
                            disabled={!vscuOnline}
                            className={`text-xs px-2 py-1 rounded ${
                              vscuOnline
                                ? 'bg-[#f47b20] hover:bg-[#e06d1a] text-white'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            }`}
                          >
                            Send to KRA
                          </button>
                        )}
                        {ins.synced === 1 && (
                          <span className="text-xs text-green-600 font-medium">Synced</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showUserForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1a2a4a]">Sync Branch User to KRA</h2>
              <button
                onClick={() => setShowUserForm(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <input
                  type="text"
                  value={selectedBranchId}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User ID *</label>
                <input
                  type="text"
                  value={userData.userId}
                  onChange={(e) => setUserData({ ...userData, userId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., cashier01"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User Name *</label>
                <input
                  type="text"
                  value={userData.userNm}
                  onChange={(e) => setUserData({ ...userData, userNm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., John Doe"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
                <input
                  type="password"
                  value={userData.userPwd}
                  onChange={(e) => setUserData({ ...userData, userPwd: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="Enter password (min 4 chars)"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={userData.useYn}
                  onChange={(e) => setUserData({ ...userData, useYn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="Y">Active</option>
                  <option value="N">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowUserForm(false)}
                className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveBranchUser}
                disabled={savingUser || !userData.userId || !userData.userNm || !userData.userPwd}
                className={`px-5 py-2 text-sm bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg transition font-medium flex items-center gap-2 ${
                  (savingUser || !userData.userId || !userData.userNm || !userData.userPwd) ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {savingUser ? 'Syncing...' : 'Sync to KRA'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showInsuranceForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full">
            <div className="flex justify-between items-center p-5 border-b">
              <h2 className="text-lg font-semibold text-[#1a2a4a]">Sync Branch Insurance to KRA</h2>
              <button
                onClick={() => setShowInsuranceForm(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Branch</label>
                <input
                  type="text"
                  value={selectedBranchId}
                  disabled
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Code *</label>
                <input
                  type="text"
                  value={insuranceData.isrccCd}
                  onChange={(e) => setInsuranceData({ ...insuranceData, isrccCd: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., INS001"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Unique insurance provider code</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Insurance Name *</label>
                <input
                  type="text"
                  value={insuranceData.isrccNm}
                  onChange={(e) => setInsuranceData({ ...insuranceData, isrccNm: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., NHIF Cover, RSSB Insurance"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rate (%) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={insuranceData.isrccRate}
                  onChange={(e) => setInsuranceData({ ...insuranceData, isrccRate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                  placeholder="e.g., 2.5"
                  required
                />
                <p className="text-xs text-gray-400 mt-1">Insurance contribution rate as percentage (e.g., 2.5 for 2.5%)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={insuranceData.useYn}
                  onChange={(e) => setInsuranceData({ ...insuranceData, useYn: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f47b20] focus:border-transparent"
                >
                  <option value="Y">Active</option>
                  <option value="N">Inactive</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowInsuranceForm(false)}
                className="px-5 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 transition font-medium"
              >
                Cancel
              </button>
              <button
                onClick={saveBranchInsurance}
                disabled={
                  savingInsurance || 
                  !insuranceData.isrccCd || 
                  !insuranceData.isrccNm || 
                  !insuranceData.isrccRate || 
                  parseFloat(insuranceData.isrccRate) <= 0
                }
                className={`px-5 py-2 text-sm bg-[#f47b20] hover:bg-[#e06d1a] text-white rounded-lg transition font-medium flex items-center gap-2 ${
                  (savingInsurance || !insuranceData.isrccCd || !insuranceData.isrccNm || !insuranceData.isrccRate || parseFloat(insuranceData.isrccRate) <= 0) 
                    ? 'opacity-50 cursor-not-allowed' 
                    : ''
                }`}
              >
                {savingInsurance ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.418 0V4h-5m5.582 0A9 9 0 1112 3" />
                    </svg>
                    Syncing...
                  </>
                ) : (
                  'Sync to KRA'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Branches;