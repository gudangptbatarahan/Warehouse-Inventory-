/**
 * Application Entry with React Router v6 & Protected Routes
 * WMS Gudang Presisi: Digital Bin Card, SAP 18-Digit Standard, Real-Time Dual Persistence.
 */
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { InventoryProvider } from './context/InventoryContext';
import { Navbar } from './components/layout/Navbar';
import { MobileNav } from './components/layout/MobileNav';

// Pages
import { Dashboard } from './pages/Dashboard';
import { ItemsPage } from './pages/ItemsPage';
import { BinCardPage } from './pages/BinCardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { StockTakePage } from './pages/StockTakePage';
import { ScannerPage } from './pages/ScannerPage';
import { ImportExportPage } from './pages/ImportExportPage';
import { BatchQrLabelsPage } from './pages/BatchQrLabelsPage';
import { LoginPage } from './pages/LoginPage';

// Protected Route Guard
const ProtectedLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-dot-pattern text-slate-900 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
      <MobileNav />
    </div>
  );
};

const RootRedirect: React.FC = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

export default function App() {
  return (
    <AuthProvider>
      <InventoryProvider>
        <BrowserRouter>
          <Routes>
            {/* Public Auth Route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected Routes */}
            <Route
              path="/dashboard"
              element={
                <ProtectedLayout>
                  <Dashboard />
                </ProtectedLayout>
              }
            />

            <Route
              path="/items"
              element={
                <ProtectedLayout>
                  <ItemsPage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/bin-card/:id"
              element={
                <ProtectedLayout>
                  <BinCardPage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/transactions"
              element={
                <ProtectedLayout>
                  <TransactionsPage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/stock-take"
              element={
                <ProtectedLayout>
                  <StockTakePage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/scanner"
              element={
                <ProtectedLayout>
                  <ScannerPage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/import"
              element={
                <ProtectedLayout>
                  <ImportExportPage />
                </ProtectedLayout>
              }
            />

            <Route
              path="/qr-labels"
              element={
                <ProtectedLayout>
                  <BatchQrLabelsPage />
                </ProtectedLayout>
              }
            />

            {/* Root & Fallback Redirect */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<RootRedirect />} />
          </Routes>
        </BrowserRouter>
      </InventoryProvider>
    </AuthProvider>
  );
}
