import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Printer, ArrowLeft, CheckSquare, Square } from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { QrCodeGenerator } from '../components/common/QrCodeGenerator';

export const BatchQrLabelsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items } = useInventory();

  const initialIds = useMemo(() => {
    const raw = searchParams.get('ids');
    if (!raw) return items.map(i => i.id);
    return raw.split(',').filter(Boolean);
  }, [searchParams, items]);

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  const [labelSize, setLabelSize] = useState<'standard' | 'compact'>('standard');

  const selectedItems = useMemo(() => {
    return items.filter(i => selectedIds.includes(i.id));
  }, [items, selectedIds]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === items.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(items.map(i => i.id));
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const getDirectUrl = (materialNo: string) => {
    return typeof window !== 'undefined' 
      ? `${window.location.origin}/bin-card/${materialNo}` 
      : materialNo;
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-12 max-w-6xl mx-auto">
      <div className="print:hidden space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <button
            onClick={() => navigate('/items')}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-slate-900 transition w-fit cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Kembali ke Master Barang</span>
          </button>

          <div className="flex items-center gap-3">
            <select
              value={labelSize}
              onChange={(e) => setLabelSize(e.target.value as 'standard' | 'compact')}
              className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none"
            >
              <option value="standard">Ukuran Standar Rak (3x5 cm)</option>
              <option value="compact">Ukuran Kompak Bin Box (2x4 cm)</option>
            </select>

            <button
              onClick={handlePrint}
              disabled={selectedItems.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak {selectedItems.length} Label Sekarang</span>
            </button>
          </div>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between text-xs text-slate-600 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={handleSelectAll}
              className="flex items-center gap-1.5 font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              {selectedIds.length === items.length ? (
                <CheckSquare className="w-4 h-4" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span>{selectedIds.length === items.length ? 'Batalkan Semua' : 'Pilih Semua Barang'}</span>
            </button>
            <span className="text-slate-300">|</span>
            <span className="font-semibold">{selectedItems.length} dari {items.length} label dipilih</span>
          </div>
          <span className="text-slate-400 hidden sm:inline">
            Siap dicetak pada kertas stiker / label rak barcode standar
          </span>
        </div>
      </div>

      {/* Label Sheet */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 print:grid-cols-2 print:gap-3 print:m-0 print:p-0">
        {selectedItems.map((item) => (
          <div
            key={item.id}
            onClick={() => handleToggleSelect(item.id)}
            className={`border-2 rounded-2xl p-4 bg-white text-slate-900 shadow-xs transition relative flex flex-col justify-between print:border-black print:rounded-lg print:shadow-none print:break-inside-avoid print:bg-white cursor-pointer ${
              selectedIds.includes(item.id) 
                ? 'border-blue-600 ring-2 ring-blue-500/10' 
                : 'border-slate-200 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-2 mb-2">
              <span className="text-[10px] font-black tracking-widest text-slate-700 font-mono uppercase">
                WMS BIN CARD TAG
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                {item.contract_type}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="shrink-0">
                <QrCodeGenerator
                  value={getDirectUrl(item.material_no)}
                  size={labelSize === 'compact' ? 80 : 100}
                  className="p-1 shadow-none border border-slate-200"
                />
              </div>

              <div className="min-w-0 flex-1 space-y-1">
                <div className="font-mono text-xs font-black tracking-wider text-slate-900 break-all">
                  {item.material_no}
                </div>
                <div className="font-bold text-xs text-slate-900 line-clamp-2 leading-tight">
                  {item.name}
                </div>
                <div className="text-[10px] text-slate-500 line-clamp-1">
                  {item.specification || item.category}
                </div>
                <div className="pt-1 flex items-center justify-between text-[11px] font-mono">
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 text-white font-bold">
                    RAK: {item.location}
                  </span>
                  <span className="text-slate-700 font-bold">
                    Min: {item.min_stock} {item.unit}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-1 border-t border-slate-100 text-[9px] text-slate-400 flex items-center justify-between font-mono">
              <span>SCAN QR KE KARTU DIGITAL</span>
              <span>18-DIGIT SAP</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
