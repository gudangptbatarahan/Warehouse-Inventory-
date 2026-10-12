import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Lock, 
  User, 
  KeyRound, 
  Eye, 
  EyeOff, 
  ArrowRight,
  CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const LoginPage: React.FC = () => {
  const { login, isAuthenticated, isReviewer, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      if (isReviewer || currentUser?.role === 'reviewer') {
        navigate('/items', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, isReviewer, currentUser, navigate]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const isReviewerTyped = username.trim().toLowerCase() === 'reviewer';

  const handleManualLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const success = login(username, password);
    if (success) {
      if (username.trim().toLowerCase() === 'reviewer') {
        navigate('/items');
      } else {
        navigate('/dashboard');
      }
    } else {
      setErrorMsg('Username akun atau kata sandi tidak valid.');
    }
  };

  return (
    <div className="min-h-screen bg-dot-pattern flex flex-col justify-between p-4 sm:p-8">
      {/* Top Header Bar matching Screenshot 1 */}
      <header className="max-w-7xl w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#0B192C] flex items-center justify-center p-2.5 shadow-md border border-slate-800">
            <svg 
              className="w-6 h-6 text-amber-500" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.2L18.8 8 12 11.8 5.2 8 12 4.2zM5 9.4l6 3.3v6.7l-6-3.3V9.4zm8 10v-6.7l6-3.3v6.7l-6 3.3z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight leading-tight">
              Warehouse Inventory
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Sistem Manajemen Inventaris & Mutasi Stok Gudang
            </p>
          </div>
        </div>

        <div className="bg-white/90 backdrop-blur border border-slate-200/90 rounded-full px-3.5 py-1.5 shadow-xs flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
          <span className="text-xs font-semibold text-slate-700">
            Sistem Siap
          </span>
        </div>
      </header>

      {/* Main Center Login Card - CLEAN WITHOUT QUICK ACCESS */}
      <main className="flex-1 flex items-center justify-center my-8">
        <div className="max-w-md w-full rounded-[28px] shadow-2xl shadow-slate-400/20 border border-slate-200/80 overflow-hidden bg-white">
          {/* Upper Half: Dark Navy Header with Amber Logo Icon */}
          <div className="bg-[#0B192C] p-8 text-center text-white relative">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-center text-amber-500 mb-3 shadow-inner p-3">
              <svg 
                className="w-8 h-8 text-amber-500" 
                viewBox="0 0 24 24" 
                fill="currentColor"
              >
                <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.2L18.8 8 12 11.8 5.2 8 12 4.2zM5 9.4l6 3.3v6.7l-6-3.3V9.4zm8 10v-6.7l6-3.3v6.7l-6 3.3z" />
              </svg>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
              Warehouse Inventory
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Silakan masuk dengan akun role terdaftar
            </p>
          </div>

          {/* Lower Half: Clean Form */}
          <div className="p-8 space-y-5 bg-white">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleManualLogin} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                  USERNAME AKUN
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Masukkan username (contoh: Supervisor)"
                    className="w-full pl-10 pr-3.5 py-3 bg-[#F8FAFF] border-2 border-slate-200 focus:border-[#5468FF] rounded-xl text-sm font-medium text-slate-900 focus:outline-none shadow-xs transition"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-800">
                    KATA SANDI (PASSWORD)
                  </label>
                  {isReviewerTyped && (
                    <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                      Bebas / Tanpa Password
                    </span>
                  )}
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={isReviewerTyped ? "Kosongkan kata sandi (login instan)..." : "Masukkan kata sandi..."}
                    className="w-full pl-10 pr-11 py-3 bg-[#E8EFF7] border border-slate-200/90 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
                    required={!isReviewerTyped}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isReviewerTyped && (
                  <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1.5 pt-0.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>Akun Reviewer dapat langsung masuk tanpa mengisi kata sandi.</span>
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 bg-[#1E3E8A] hover:bg-[#162f6b] active:scale-[0.99] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-900/20 transition flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <span>Masuk</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Akses Instan Akun Reviewer (Khusus Cari Barang & Scan QR) */}
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setUsername('Reviewer');
                  setPassword('');
                  const success = login('Reviewer', '');
                  if (success) {
                    navigate('/items');
                  }
                }}
                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5 text-slate-500" />
                <span>Masuk Cepat sebagai Reviewer (Tanpa Password)</span>
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer matching Screenshot 1 */}
      <footer className="text-center text-xs font-semibold text-slate-600 py-3">
        Warehouse Management System • Hak Cipta Terlindungi © 2026
      </footer>
    </div>
  );
};
