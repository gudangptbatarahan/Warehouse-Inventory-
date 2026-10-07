import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  ClipboardCheck, 
  Search, 
  Plus, 
  Download, 
  AlertTriangle
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { formatDateTime24 } from '../utils/materialUtils';
import { NumericQuantityInput } from '../components/common/NumericQuantityInput';

export const StockTakePage: React.FC = () => {
  const { items, stockTakes, addStockTake } = useInventory();
  const { canStockTake, canApproveVariance, currentGroup } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [shiftFilter, setShiftFilter] = useState<string>('ALL');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>(
    searchParams.get('item') || (items[0]?.id || '')
  );
  const [selectedShift, setSelectedShift] = useState<string>(currentGroup || 'Shift A');
  const [physicalStockInput, setPhysicalStockInput] = useState<string>('0');
  const [baNumber, setBaNumber] = useState<string>(
    `BA-STO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-01`
  );
  const [notes, setNotes] = useState<string>('');
  const [applyToStock, setApplyToStock] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const getShiftBadgeStyle = (grp: string) => {
    const g = (grp || '').toUpperCase();
    if (g.includes('A')) return 'bg-emerald-50 text-emerald-800 border-emerald-300 font-extrabold';
    if (g.includes('B')) return 'bg-blue-50 text-blue-800 border-blue-300 font-extrabold';
    if (g.includes('C')) return 'bg-amber-50 text-amber-800 border-amber-300 font-extrabold';
    if (g.includes('D')) return 'bg-purple-50 text-purple-800 border-purple-300 font-extrabold';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const matchesShift = (group: string, filter: string) => {
    if (filter === 'ALL') return true;
    const g = (group || '').toUpperCase();
    const f = filter.toUpperCase();
    if (f === 'A' || f === 'SHIFT A' || f === 'GROUP A') {
      return g.includes('A');
    }
    if (f === 'B' || f === 'SHIFT B' || f === 'GROUP B') {
      return g.includes('B');
    }
    if (f === 'C' || f === 'SHIFT C' || f === 'GROUP C') {
      return g.includes('C');
    }
    if (f === 'D' || f === 'SHIFT D' || f === 'GROUP D') {
      return g.includes('D');
    }
    return g.includes(f);
  };

  const activeItem = useMemo(() => {
    return items.find(i => i.id === selectedItemId);
  }, [items, selectedItemId]);

  const liveVariance = useMemo(() => {
    if (!activeItem || physicalStockInput === '') return 0;
    const phys = Number(physicalStockInput);
    if (isNaN(phys)) return 0;
    return phys - activeItem.current_stock;
  }, [activeItem, physicalStockInput]);

  const liveStatus = useMemo(() => {
    if (liveVariance === 0) return 'MATCH';
    if (liveVariance > 0) return 'SURPLUS';
    return 'DEFICIT';
  }, [liveVariance]);

  const filteredStockTakes = useMemo(() => {
    return stockTakes.filter((sto) => {
      if (statusFilter !== 'ALL' && sto.status !== statusFilter) {
        return false;
      }
      if (!matchesShift(sto.auditor_group, shiftFilter)) {
        return false;
      }
      const s = searchTerm.toLowerCase().trim();
      return !s ||
        (sto.item_name && sto.item_name.toLowerCase().includes(s)) ||
        sto.material_no.includes(s) ||
        sto.ba_number.toLowerCase().includes(s) ||
        sto.auditor_username.toLowerCase().includes(s) ||
        sto.auditor_group.toLowerCase().includes(s) ||
        sto.notes.toLowerCase().includes(s);
    });
  }, [stockTakes, statusFilter, shiftFilter, searchTerm]);

  const handleOpenModal = (preselectedItemId?: string) => {
    if (items.length === 0) {
      alert('Belum ada master barang di gudang. Silakan upload atau tambahkan barang terlebih dahulu sebelum melakukan audit fisik.');
      return;
    }
    const targetId = preselectedItemId || (items[0]?.id || '');
    setSelectedItemId(targetId);
    setSelectedShift(currentGroup || 'Shift A');
    setPhysicalStockInput('0');
    setBaNumber(`BA-STO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 90 + 10)}`);
    setNotes('');
    setApplyToStock(false);
    setErrorMsg('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) {
      setErrorMsg('Pilih barang terlebih dahulu.');
      return;
    }

    const phys = Number(physicalStockInput);
    if (isNaN(phys) || phys < 0) {
      setErrorMsg('Hasil hitung fisik riil harus berupa angka >= 0.');
      return;
    }

    if (!baNumber.trim()) {
      setErrorMsg('Nomor Berita Acara (BA-STO) wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await addStockTake({
        item_id: activeItem.id,
        physical_stock: phys,
        ba_number: baNumber.trim(),
        shift: selectedShift,
        notes: notes.trim(),
        applyToStock
      });

      if (!res.success) {
        setErrorMsg(res.message);
        return;
      }

      setIsModalOpen(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredStockTakes.map((sto, idx) => ({
      No: idx + 1,
      'Tanggal & Waktu (24 Jam)': formatDateTime24(sto.timestamp),
      'No. Berita Acara (BA)': sto.ba_number,
      'Nomor Material SAP': sto.material_no,
      'Nama Barang': sto.item_name || '-',
      'Lokasi Rak': sto.location || '-',
      'Stok Tercatat Sistem': sto.system_stock,
      'Stok Hitung Fisik Riil': sto.physical_stock,
      'Selisih (Variance)': sto.variance,
      'Status Audit': sto.status,
      'Diterapkan ke Sistem': sto.applied_to_stock ? 'YA' : 'TIDAK',
      'Auditor Lapangan': `${sto.auditor_username} (${sto.auditor_group})`,
      'Catatan Temuan': sto.notes
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laporan STO');
    XLSX.writeFile(wb, `LAPORAN_STOCK_OPNAME_${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-purple-600" />
            Stock Opname Fisik (STO)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Audit fisik berkala, penghitungan selisih (variance), dan penerbitan Berita Acara STO.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Ekspor Hasil STO</span>
          </button>

          {canStockTake && (
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-900/20 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Input Hasil Audit STO</span>
            </button>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari no material, nama barang, no. BA STO, auditor..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-purple-500"
            />
          </div>

          <div className="sm:col-span-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Semua Status Audit</option>
              <option value="MATCH">Akurat / Cocok (Variance 0)</option>
              <option value="SURPLUS">Surplus Fisik (+)</option>
              <option value="DEFICIT">Selisih Kurang (-)</option>
            </select>
          </div>

          <div className="sm:col-span-3">
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-bold focus:outline-none focus:bg-white focus:border-purple-500 cursor-pointer"
            >
              <option value="ALL">Semua Shift / Regu</option>
              <option value="A">Shift A (Regu A)</option>
              <option value="B">Shift B (Regu B)</option>
              <option value="C">Shift C (Regu C)</option>
              <option value="D">Shift D (Regu D)</option>
            </select>
          </div>
        </div>

        {/* Quick Shift Filter Pills Bar */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 border-t border-slate-100">
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0">
            Shift Tim STO:
          </span>
          {[
            { id: 'ALL', label: 'Semua Shift' },
            { id: 'A', label: 'Shift A' },
            { id: 'B', label: 'Shift B' },
            { id: 'C', label: 'Shift C' },
            { id: 'D', label: 'Shift D' },
          ].map((sh) => (
            <button
              key={sh.id}
              type="button"
              onClick={() => setShiftFilter(sh.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition shrink-0 cursor-pointer border ${
                shiftFilter === sh.id
                  ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
              }`}
            >
              {sh.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-mono font-extrabold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Waktu Audit</th>
                <th className="py-3 px-3">No. Berita Acara (BA)</th>
                <th className="py-3 px-3">Nomor Material & Barang</th>
                <th className="py-3 px-3 text-right">Stok Sistem</th>
                <th className="py-3 px-3 text-right">Fisik Riil</th>
                <th className="py-3 px-3 text-right">Selisih</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Diterapkan</th>
                <th className="py-3 px-3">Auditor & Shift</th>
                <th className="py-3 px-3">Keterangan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredStockTakes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    <ClipboardCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Belum ada riwayat Stock Opname (STO)</p>
                    <p className="text-xs text-slate-400 mt-1">Audit fisik yang diinput akan tercatat lengkap dengan Berita Acara dan shift kerja pemeriksa.</p>
                  </td>
                </tr>
              ) : (
                filteredStockTakes.map((sto) => (
                <tr key={sto.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3 whitespace-nowrap text-slate-800 font-semibold">
                    {formatDateTime24(sto.timestamp)}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap text-purple-700 font-bold">
                    {sto.ba_number}
                  </td>

                  <td className="py-3 px-3 max-w-xs">
                    <div 
                      onClick={() => navigate(`/bin-card/${sto.item_id}`)}
                      className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer"
                    >
                      {sto.material_no}
                    </div>
                    <div className="font-sans text-slate-500 truncate mt-0.5">
                      {sto.item_name}
                    </div>
                  </td>

                  <td className="py-3 px-3 text-right text-slate-600 font-bold whitespace-nowrap">
                    {sto.system_stock}
                  </td>

                  <td className="py-3 px-3 text-right text-slate-900 font-extrabold whitespace-nowrap text-sm">
                    {sto.physical_stock}
                  </td>

                  <td className={`py-3 px-3 text-right font-black whitespace-nowrap text-sm ${
                    sto.variance === 0 
                      ? 'text-emerald-600' 
                      : sto.variance > 0 
                      ? 'text-blue-600' 
                      : 'text-rose-600'
                  }`}>
                    {sto.variance > 0 ? `+${sto.variance}` : sto.variance}
                  </td>

                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      sto.status === 'MATCH'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : sto.status === 'SURPLUS'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {sto.status}
                    </span>
                  </td>

                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    {sto.applied_to_stock ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        YA (Update)
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">
                        Audit
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap text-slate-700 font-sans">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-800">{sto.auditor_username}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] border ${getShiftBadgeStyle(sto.auditor_group)}`}>
                        {sto.auditor_group.includes('Shift') ? sto.auditor_group : `Shift ${sto.auditor_group.replace('Group ', '')}`}
                      </span>
                    </div>
                  </td>

                  <td className="py-3 px-3 max-w-xs truncate text-slate-500 font-sans">
                    {sto.notes}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Input STO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl my-8 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-purple-600" />
                Input Pelaporan Fisik Stock Opname (STO)
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Pilih Material yang Diaudit *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => {
                    setSelectedItemId(e.target.value);
                    const it = items.find(i => i.id === e.target.value);
                    if (it) setPhysicalStockInput(String(it.current_stock));
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500 font-mono"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.material_no}] {i.name} (Sistem: {i.current_stock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              {activeItem && (
                <div className="grid grid-cols-3 gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Sistem</span>
                    <span className="text-base font-extrabold font-mono text-slate-800">
                      {activeItem.current_stock} {activeItem.unit}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-white border border-slate-200">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">Fisik Riil</span>
                    <span className="text-base font-extrabold font-mono text-purple-700">
                      {physicalStockInput !== '' ? physicalStockInput : '-'} {activeItem.unit}
                    </span>
                  </div>

                  <div className={`p-2 rounded-lg border ${
                    liveStatus === 'MATCH'
                      ? 'bg-emerald-50 border-emerald-200'
                      : liveStatus === 'SURPLUS'
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-rose-50 border-rose-200'
                  }`}>
                    <span className="text-[10px] uppercase font-mono text-slate-500 block">Selisih</span>
                    <span className={`text-base font-extrabold font-mono ${
                      liveStatus === 'MATCH' ? 'text-emerald-700' : liveStatus === 'SURPLUS' ? 'text-blue-700' : 'text-rose-700'
                    }`}>
                      {liveVariance > 0 ? `+${liveVariance}` : liveVariance}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Hasil Hitung Fisik Aktual di Rak *
                </label>
                <NumericQuantityInput
                  min={0}
                  value={Number(physicalStockInput) || 0}
                  onChange={(val) => setPhysicalStockInput(String(val))}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-lg font-black text-slate-900 focus:outline-none focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nomor Berita Acara STO (BA-STO) *
                </label>
                <input
                  type="text"
                  value={baNumber}
                  onChange={(e) => setBaNumber(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                  Shift / Regu Kerja Pemeriksa STO *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {['Shift A', 'Shift B', 'Shift C', 'Shift D'].map((sh) => (
                    <button
                      key={sh}
                      type="button"
                      onClick={() => setSelectedShift(sh)}
                      className={`py-2 px-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        selectedShift === sh
                          ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {sh}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Catatan Temuan Lapangan
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-purple-500"
                />
              </div>

              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToStock}
                    onChange={(e) => setApplyToStock(e.target.checked)}
                    disabled={!canApproveVariance}
                    className="mt-0.5 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-purple-900 block">
                      Otorisasi Penyesuaian Saldo Sistem (Auto-Update Saldo Bin Card)
                    </span>
                    <span className="text-slate-500 text-[11px] block mt-0.5">
                      {canApproveVariance 
                        ? 'Jika dicentang, saldo fisik sistem akan disesuaikan ke hasil hitung riil dan dicatat sebagai mutasi STO di Bin Card.'
                        : 'Memerlukan otorisasi Supervisor / Admin.'}
                    </span>
                  </div>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Laporan STO'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
