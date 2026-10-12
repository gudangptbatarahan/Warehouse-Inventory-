import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Boxes, QrCode, ArrowLeftRight, ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const MobileNav: React.FC = () => {
  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/items', label: 'Barang', icon: Boxes },
    { to: '/scanner', label: 'Scan QR', icon: QrCode, highlight: true },
    { to: '/transactions', label: 'Mutasi', icon: ArrowLeftRight },
    { to: '/stock-take', label: 'STO', icon: ClipboardCheck },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe shadow-lg">
      <nav className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          if (item.highlight) {
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex flex-col items-center justify-center -mt-5 transition group`
                }
              >
                <div className="w-13 h-13 rounded-full bg-[#10B981] hover:bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-500/30 border-3 border-white active:scale-95 transition">
                  <Icon className="w-6 h-6 text-white" />
                </div>
                <span className="text-[10px] font-bold text-emerald-700 mt-0.5">
                  Scan QR
                </span>
              </NavLink>
            );
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center w-14 py-1 transition ${
                  isActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-5 h-5 mb-0.5" />
              <span className="text-[10px] tracking-tight">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};
