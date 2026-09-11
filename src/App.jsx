import { Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { useAuth } from './context/AuthContext';
import Layout from './components/layout/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Items from './pages/Items.jsx';
import Sales from './pages/Sales.jsx';
import Reports from './pages/Reports.jsx';
import Legal from './pages/Legal.jsx';
import Stock from './pages/Stock.jsx';
import Purchases from './pages/Purchases.jsx';
import Imports from './pages/Imports.jsx';
import DataManagement from './pages/DataManagement.jsx';
import Branches from './pages/Branches.jsx';
import Settings from './pages/Settings.jsx';
import Cashiers from './pages/Cashiers.jsx';
import Notices from './pages/Notices.jsx';
import Customers from './pages/Customers.jsx';
import PayPage from './pages/PayPage.jsx';   // ← NEW
import AdminRoute from './components/AdminRoute.jsx';

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 border-4 border-[#f47b20] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  return (
    <>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />

      <Routes>
        {/* Public — no auth, no layout */}
        <Route path="/login" element={<Login />} />
        <Route path="/pay/:invoice" element={<PayPage />} />   {/* ← NEW */}

        {/* Protected */}
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="items" element={<Items />} />
          <Route path="sales" element={<Sales />} />
          <Route path="stock" element={<Stock />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="imports" element={<Imports />} />
          <Route path="notices" element={<Notices />} />
          <Route path="customers" element={<Customers />} />
          <Route path="data" element={<DataManagement />} />
          <Route path="branches" element={<Branches />} />
          <Route path="settings" element={<Settings />} />
          <Route path="reports" element={<Reports />} />
          <Route path="legal" element={<Legal />} />
          <Route path="cashiers" element={<AdminRoute><Cashiers /></AdminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;