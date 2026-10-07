import React, { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import { parseLocation, formatLocation, ParsedLocation } from '../../utils/materialUtils';

interface LocationPickerProps {
  value: string;
  onChange: (formattedLoc: string) => void;
  label?: string;
  className?: string;
}

export const LocationPicker: React.FC<LocationPickerProps> = ({
  value,
  onChange,
  label = 'Lokasi Fisik Bin Card (Ruang.Rak.Baris.Tingkat)',
  className = ''
}) => {
  const [parsed, setParsed] = useState<ParsedLocation>(parseLocation(value || '1.01.01.01A'));
  const [isDirectInput, setIsDirectInput] = useState(true);
  const [directVal, setDirectVal] = useState(value || '1.01.01.01A');

  useEffect(() => {
    if (value) {
      setParsed(parseLocation(value));
      setDirectVal(value);
    }
  }, [value]);

  const handleSegmentChange = (field: keyof ParsedLocation, val: string) => {
    const updated = { ...parsed, [field]: val };
    setParsed(updated);
    const formatted = formatLocation(updated);
    setDirectVal(formatted);
    onChange(formatted);
  };

  const handleDirectChange = (input: string) => {
    setDirectVal(input);
    const p = parseLocation(input);
    setParsed(p);
    onChange(input);
  };

  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
          <MapPin className="w-3.5 h-3.5 text-blue-600" />
          {label}
        </label>
        <button
          type="button"
          onClick={() => setIsDirectInput(!isDirectInput)}
          className="text-xs text-blue-600 hover:text-blue-800 underline font-semibold cursor-pointer"
        >
          {isDirectInput ? 'Buka Pemilih Bertingkat' : 'Mode Teks Langsung'}
        </button>
      </div>

      {isDirectInput ? (
        <div className="space-y-1.5">
          <input
            type="text"
            value={directVal}
            onChange={(e) => handleDirectChange(e.target.value)}
            placeholder="Format: Ruang.Rak.Baris.Tingkat (contoh: 1.03.02.04B atau A-02-01)"
            className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-900 tracking-wider focus:outline-none focus:border-blue-500 font-bold"
          />
          <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-slate-500">
            <span>Pilihan cepat:</span>
            {['1.01.01.01A', '1.02.01.03A', '1.03.02.04B', '2.01.01.01A', '7.00.00.00'].map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => handleDirectChange(sample)}
                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 hover:text-blue-700 font-mono transition cursor-pointer"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          <div>
            <span className="block text-[10px] text-slate-500 uppercase font-mono mb-1">Ruang / Hall</span>
            <select
              value={parsed.room}
              onChange={(e) => handleSegmentChange('room', e.target.value)}
              className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
            >
              <option value="1">Ruang 1 (Utama)</option>
              <option value="2">Ruang 2 (Elektrik)</option>
              <option value="3">Ruang 3 (B3 & Kimia)</option>
              <option value="7">Ruang 7 (Yard/Store)</option>
            </select>
          </div>

          <div>
            <span className="block text-[10px] text-slate-500 uppercase font-mono mb-1">Rak (Aisle)</span>
            <select
              value={parsed.rack}
              onChange={(e) => handleSegmentChange('rack', e.target.value)}
              className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
            >
              {['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10'].map((rk) => (
                <option key={rk} value={rk}>
                  Rak {rk}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-[10px] text-slate-500 uppercase font-mono mb-1">Baris (Bay)</span>
            <select
              value={parsed.row}
              onChange={(e) => handleSegmentChange('row', e.target.value)}
              className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
            >
              {['00', '01', '02', '03', '04', '05', '06', '07', '08'].map((rw) => (
                <option key={rw} value={rw}>
                  Baris {rw}
                </option>
              ))}
            </select>
          </div>

          <div>
            <span className="block text-[10px] text-slate-500 uppercase font-mono mb-1">Tingkat (Tier)</span>
            <select
              value={parsed.level}
              onChange={(e) => handleSegmentChange('level', e.target.value)}
              className="w-full px-2 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono text-slate-800 focus:outline-none"
            >
              <option value="00">00 (Dasar)</option>
              <option value="01A">L1 (01A - Bawah)</option>
              <option value="02A">L2 (02A - Sedang)</option>
              <option value="03A">L3 (03A - Atas)</option>
              <option value="04B">L4 (04B - Puncak)</option>
            </select>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-1 text-xs">
        <span className="text-slate-500">Kode Posisi Rak:</span>
        <span className="px-2.5 py-0.5 rounded font-mono font-bold bg-blue-50 text-blue-900 border border-blue-200 text-xs tracking-wider">
          {formatLocation(parsed)}
        </span>
      </div>
    </div>
  );
};
