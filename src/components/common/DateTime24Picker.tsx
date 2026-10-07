import React, { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

interface DateTime24PickerProps {
  value: string; // ISO string or 'YYYY-MM-DD HH:mm:ss'
  onChange: (isoString: string) => void;
  label?: string;
  className?: string;
}

export const DateTime24Picker: React.FC<DateTime24PickerProps> = ({
  value,
  onChange,
  label = 'Tanggal & Waktu Mutasi',
  className = ''
}) => {
  const [dateStr, setDateStr] = useState<string>('');
  const [hourStr, setHourStr] = useState<string>('08');
  const [minuteStr, setMinuteStr] = useState<string>('00');

  useEffect(() => {
    try {
      const d = value ? new Date(value) : new Date();
      if (!isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        setDateStr(`${y}-${m}-${day}`);
        setHourStr(String(d.getHours()).padStart(2, '0'));
        setMinuteStr(String(d.getMinutes()).padStart(2, '0'));
      }
    } catch {
      // fallback
    }
  }, [value]);

  const updateDateTime = (newDate: string, newH: string, newM: string) => {
    const [y, m, d] = newDate.split('-').map(Number);
    const dateObj = new Date();
    dateObj.setFullYear(y, (m || 1) - 1, d || 1);
    dateObj.setHours(Number(newH) || 0, Number(newM) || 0, 0, 0);
    onChange(dateObj.toISOString());
  };

  const handleSetNow = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const h = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');

    setDateStr(`${y}-${m}-${day}`);
    setHourStr(h);
    setMinuteStr(min);
    onChange(now.toISOString());
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
            {label}
          </label>
          <button
            type="button"
            onClick={handleSetNow}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold underline flex items-center gap-1 cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            Set Sekarang
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
        <div className="sm:col-span-7 relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Calendar className="w-4 h-4" />
          </div>
          <input
            type="date"
            value={dateStr}
            onChange={(e) => {
              setDateStr(e.target.value);
              updateDateTime(e.target.value, hourStr, minuteStr);
            }}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
          />
        </div>

        <div className="sm:col-span-3 flex items-center gap-1">
          <select
            value={hourStr}
            onChange={(e) => {
              setHourStr(e.target.value);
              updateDateTime(dateStr, e.target.value, minuteStr);
            }}
            className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
          >
            {Array.from({ length: 24 }).map((_, i) => {
              const h = String(i).padStart(2, '0');
              return (
                <option key={h} value={h}>
                  {h}:00
                </option>
              );
            })}
          </select>
          <span className="text-slate-400 font-mono">:</span>
        </div>

        <div className="sm:col-span-2">
          <select
            value={minuteStr}
            onChange={(e) => {
              setMinuteStr(e.target.value);
              updateDateTime(dateStr, hourStr, e.target.value);
            }}
            className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
          >
            {Array.from({ length: 60 }).map((_, i) => {
              const m = String(i).padStart(2, '0');
              return (
                <option key={m} value={m}>
                  {m}
                </option>
              );
            })}
          </select>
        </div>
      </div>
      <p className="text-[11px] text-slate-400 font-mono">
        Tersimpan: {dateStr} {hourStr}:{minuteStr}:00
      </p>
    </div>
  );
};
