import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Boxes, 
  ArrowLeftRight, 
  QrCode, 
  ShieldCheck, 
  LogOut, 
  ChevronDown, 
  ClipboardCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Navbar: React.FC = () => {
  const { currentUser, logout, isReviewer } = useAuth();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-18">
          {/* Left Brand: Amber Hexagon Logo + App Title */}
          <div 
            className="flex items-center gap-2.5 sm:gap-3 cursor-pointer shrink-0 min-w-0" 
            onClick={() => navigate('/dashboard')}
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#0B192C] flex items-center justify-center p-2 shadow-sm border border-slate-800 shrink-0">
              <svg 
                className="w-5 h-5 sm:w-6 sm:h-6 text-amber-500" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.2L18.8 8 12 11.8 5.2 8 12 4.2zM5 9.4l6 3.3v6.7l-6-3.3V9.4zm8 10v-6.7l6-3.3v6.7l-6 3.3z" />
              </svg>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight leading-none truncate">
                Warehouse Inventory
              </h1>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium mt-1 truncate max-w-[190px] sm:max-w-none">
                Sistem Manajemen Inventaris & Mutasi Stok Gudang
              </p>
            </div>
          </div>

          {/* Center Navigation Tabs (Dashboard, Manajemen Barang, Riwayat Mutasi, Stock Opname) */}
          <nav className="hidden lg:flex items-center gap-1.5">
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                }`
              }
            >
              <LayoutDashboard className="w-4 h-4 text-slate-700" />
              <span>Dashboard</span>
            </NavLink>

            <NavLink
              to="/items"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                }`
              }
            >
              <Boxes className="w-4 h-4 text-slate-700" />
              <span>Manajemen Barang</span>
            </NavLink>

            <NavLink
              to="/transactions"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                }`
              }
            >
              <ArrowLeftRight className="w-4 h-4 text-slate-700" />
              <span>Riwayat Mutasi</span>
            </NavLink>

            <NavLink
              to="/stock-take"
              className={({ isActive }) =>
                `flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition ${
                  isActive
                    ? 'bg-slate-200 text-slate-900'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold'
                }`
              }
            >
              <ClipboardCheck className="w-4 h-4 text-slate-700" />
              <span>Stock Opname</span>
            </NavLink>
          </nav>

          {/* Right Controls: Scan QR (hidden on mobile since MobileNav has it), Supervisor Profile Pill, Logout */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => navigate('/scanner')}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 bg-[#10B981] hover:bg-emerald-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <QrCode className="w-4 h-4" />
              <span>Scan QR</span>
            </button>

            {/* User Profile Pill */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 text-blue-900 transition cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 shrink-0" />
                <span className="text-xs font-bold truncate max-w-[90px] sm:max-w-none">
                  {currentUser?.name || 'Supervisor'}
                </span>
                <ChevronDown className="w-3 h-3 text-blue-600 shrink-0" />
              </button>

              {/* Clean User Dropdown without quick switcher */}
              {showUserMenu && (
                <div 
                  className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 animate-in fade-in"
                  onClick={() => setShowUserMenu(false)}
                >
                  <div className="px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-black text-slate-900">{currentUser?.name || 'Supervisor'}</p>
                    <p className="text-[11px] text-blue-600 font-semibold mt-0.5">
                      Role: <span className="capitalize">{currentUser?.name || currentUser?.role}</span>
                    </p>
                  </div>

                  <div className="p-1">
                    <button
                      onClick={() => {
                        logout();
                        navigate('/login');
                      }}
                      className="w-full text-left px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 rounded-xl flex items-center gap-2 transition font-semibold"
                    >
                      <LogOut className="w-4 h-4" />
                      Keluar / Logout
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Keluar dari sistem"
              className="hidden sm:block p-2 text-slate-400 hover:text-slate-700 transition cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
