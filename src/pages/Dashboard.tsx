import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  ScanLine, 
  Plus, 
  FileSpreadsheet, 
  Search, 
  ShieldCheck, 
  Download, 
  Boxes, 
  AlertTriangle, 
  Clock, 
  ArrowDownLeft, 
  ArrowUpRight, 
  CheckCircle2, 
  Edit3, 
  Check, 
  X,
  ExternalLink,
  ChevronRight,
  MapPin,
  Minimize2,
  Maximize2,
  Trash2,
  FileText,
  Tag,
  Package
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { InventoryItem, ProcurementStatus } from '../types/inventory';
import { formatDateTime24, padTo18Digits } from '../utils/materialUtils';

export const Dashboard: React.FC = () => {
  const { items, transactions, updateItem, deleteItem } = useInventory();
  const { currentUser, canManageMaster, canDeleteMaster, canManagePR, isSupervisor } = useAuth();
  const navigate = useNavigate();

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Status Filter
  const [selectedFilter, setSelectedFilter] = useState<'ALL' | 'PR_REQUEST' | 'DIPROSES'>('ALL');
  const [isPrTableMinimized, setIsPrTableMinimized] = useState(false);

  // Inline edit state for Evaluator notes
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [tempNotesText, setTempNotesText] = useState<string>('');

  // Delete item from PR Request modal state (Supervisor only)
  const [deletingPrItem, setDeletingPrItem] = useState<InventoryItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deleteItemFeedback, setDeleteItemFeedback] = useState<string>('');

  // Close search dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search Results across ALL inventory items for the dropdown
  const liveSearchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];

    const qPadded = padTo18Digits(q);
    return items.filter(item => 
      item.material_no.includes(q) ||
      (qPadded && item.material_no.includes(qPadded)) ||
      item.name.toLowerCase().includes(q) ||
      item.location.toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.specification && item.specification.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [items, searchQuery]);

  // Compute metrics
  const totalSkuCount = items.length;
  const prRequestItems = useMemo(() => {
    return items.filter(
      i => i.current_stock <= i.min_stock || 
           i.procurement_status === 'PR_REQUIRED' || 
           i.procurement_status === 'PR_PROCESSED' ||
           i.procurement_status === 'MINIMUM'
    );
  }, [items]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayTxs = transactions.filter(t => t.timestamp.startsWith(todayStr));
  const todayInQty = todayTxs.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.quantity, 0);
  const todayOutQty = todayTxs.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.quantity, 0);

  // Filtered items for Table (Searches across all inventory when searchQuery has value)
  const displayedItems = useMemo(() => {
    return items.filter((item) => {
      const q = searchQuery.toLowerCase().trim();
      const qPadded = padTo18Digits(q);
      const matchesSearch = 
        !q ||
        item.material_no.includes(q) ||
        (qPadded && item.material_no.includes(qPadded)) ||
        item.name.toLowerCase().includes(q) ||
        item.location.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.specification && item.specification.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      // When searching specifically, show all matching inventory items
      if (q) return true;

      if (selectedFilter === 'PR_REQUEST') {
        return item.procurement_status === 'PR_REQUIRED' || item.procurement_status === 'MINIMUM';
      }
      if (selectedFilter === 'DIPROSES') {
        return item.procurement_status === 'PR_PROCESSED' || item.procurement_status === 'ARRIVED';
      }

      return true;
    });
  }, [items, searchQuery, selectedFilter]);

  const handleUpdateStatus = async (item: InventoryItem, newStatus: ProcurementStatus) => {
    await updateItem(item.id, {
      procurement_status: newStatus
    });
  };

  const handleSaveNotes = async (item: InventoryItem) => {
    await updateItem(item.id, {
      notes: tempNotesText.trim() || 'Belum ada keterangan'
    });
    setEditingNotesId(null);
  };

  const handleTriggerSearch = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;

    if (liveSearchResults.length === 1) {
      navigate(`/bin-card/${liveSearchResults[0].id}`);
    } else {
      navigate(`/items?search=${encodeURIComponent(q)}`);
    }
    setShowSearchResults(false);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleTriggerSearch();
    }
  };

  const handleExportExcel = () => {
    const exportRows = displayedItems.map((item, idx) => ({
      No: idx + 1,
      'Material Number': item.material_no,
      'Tipe Kontrak': item.contract_type,
      'Nama Barang': item.name,
      'Lokasi BIN': item.location,
      'Kategori': item.category,
      'Unrestricted Stock': `${item.current_stock} ${item.unit}`,
      'ROP / Safety': `${item.min_stock} ${item.unit}`,
      'Status Pengadaan': item.procurement_status === 'PR_PROCESSED' ? 'Hijau: Sudah Diproses' : 'Merah: PR Request',
      'Keterangan Evaluator': item.notes || 'Belum ada keterangan',
      'Terakhir Diperbarui': `${item.updated_by}, ${formatDateTime24(item.updated_at)}`
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'PR Request');
    XLSX.writeFile(wb, `WMS_INVENTORY_REPORT_${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-4 sm:space-y-5 pb-24 lg:pb-12 max-w-7xl mx-auto">
      {/* 1. HERO HEADER CARD */}
      <div 
        className="rounded-3xl p-5 sm:p-8 text-white shadow-xl relative overflow-visible bg-[#0B192C] border border-slate-800"
        style={{ backgroundColor: '#0B192C' }}
      >
        <div className="relative z-10 space-y-3 sm:space-y-4">
          <div>
            <span className="inline-block px-3 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 mb-2 shadow-xs">
              SISTEM GUDANG AKTIF
            </span>
            <h1 className="text-xl sm:text-3xl font-black text-white tracking-tight leading-tight">
              Warehouse Management Inventory
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium mt-1">
              Sistem Manajemen Inventaris & Mutasi Stok Gudang • Standardisasi SAP 18-Digit
            </p>
          </div>

          {/* Interactive Search Bar with dedicated Search Button and instant Dropdown popup */}
          <div className="pt-2 relative max-w-2xl" ref={searchContainerRef}>
            <form onSubmit={handleTriggerSearch} className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchResults(true);
                  }}
                  onFocus={() => setShowSearchResults(true)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Cari nomor SAP 18 digit, nama, rak..."
                  className="w-full pl-9 sm:pl-11 pr-8 sm:pr-10 py-2.5 sm:py-3 bg-white text-slate-900 rounded-xl text-xs sm:text-sm font-medium placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setShowSearchResults(false);
                    }}
                    className="absolute right-2.5 sm:right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="submit"
                onClick={handleTriggerSearch}
                className="px-4 sm:px-5 py-2.5 sm:py-3 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <Search className="w-4 h-4" />
                <span>Cari</span>
              </button>
            </form>

            {/* Live Search Results Dropdown */}
            {showSearchResults && searchQuery.trim() && (
              <div className="absolute left-0 top-full mt-2 w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span className="font-semibold">Hasil Pencarian Barang ({liveSearchResults.length})</span>
                  <span className="text-[11px] text-blue-600 font-semibold cursor-pointer hover:underline" onClick={() => navigate(`/items?search=${encodeURIComponent(searchQuery)}`)}>
                    Lihat di Master Barang &rarr;
                  </span>
                </div>

                {liveSearchResults.length === 0 ? (
                  <div className="p-6 text-center text-slate-500 text-xs">
                    Tidak ditemukan barang dengan kata kunci "{searchQuery}"
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                    {liveSearchResults.map((it) => (
                      <div
                        key={it.id}
                        onClick={() => {
                          navigate(`/bin-card/${it.id}`);
                          setShowSearchResults(false);
                        }}
                        className="p-3 px-4 hover:bg-slate-50 cursor-pointer flex items-center justify-between transition group"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-mono text-xs font-black text-blue-600 group-hover:text-blue-800">
                            {it.material_no}
                          </div>
                          <div className="text-xs font-bold text-slate-900 truncate uppercase mt-0.5">
                            {it.name}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-400" />
                            <span>Rak: {it.location}</span>
                            <span>•</span>
                            <span>{it.category}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="font-mono font-bold text-sm text-slate-900 block">
                            {it.current_stock} <span className="text-xs text-slate-500 font-normal">{it.unit}</span>
                          </span>
                          <span className="text-[10px] text-blue-600 font-semibold group-hover:underline flex items-center justify-end gap-0.5">
                            Buka Bin Card <ChevronRight className="w-3 h-3" />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. SECONDARY PROFILE & ACTION BAR */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3 sm:p-3.5 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-50 text-blue-600 border border-blue-200/80 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
          </div>
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-xs sm:text-sm text-slate-900 capitalize">
              {currentUser?.name || currentUser?.role || 'Supervisor'}
            </span>
            <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2 sm:px-2.5 py-0.5 text-[9px] sm:text-[10px] font-bold">
              Sesi Aktif
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 sm:gap-2.5 w-full sm:w-auto">
          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span className="truncate">Unduh Excel</span>
            <span className="bg-emerald-700/60 text-white text-[10px] px-1.5 py-0.2 rounded-md font-mono shrink-0">
              {displayedItems.length}
            </span>
          </button>

          <button
            onClick={handleExportExcel}
            className="flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="truncate">Export Semua</span>
          </button>
        </div>
      </div>

      {/* 3. ROW OF 3 KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: TOTAL ITEM BARANG */}
        <div 
          onClick={() => navigate('/items')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              TOTAL ITEM BARANG
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
              <Boxes className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl sm:text-4xl font-black text-slate-900">
              {totalSkuCount}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-2">
              SKU
            </span>
          </div>
        </div>

        {/* Card 2: PR REQUEST */}
        <div 
          onClick={() => setSelectedFilter(selectedFilter === 'PR_REQUEST' ? 'ALL' : 'PR_REQUEST')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              PR REQUEST
            </span>
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 border border-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl sm:text-4xl font-black text-amber-600">
              {prRequestItems.length}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-2">
              item
            </span>
          </div>
        </div>

        {/* Card 3: MUTASI HARI INI */}
        <div 
          onClick={() => navigate('/transactions')}
          className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs hover:border-slate-300 transition cursor-pointer"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              MUTASI HARI INI
            </span>
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-600 border border-slate-200 flex items-center justify-center">
              <Clock className="w-5 h-5 text-slate-600" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center text-emerald-600 font-black text-2xl">
              <ArrowDownLeft className="w-5 h-5 mr-1 stroke-[3]" />
              <span>+{todayInQty}</span>
            </div>
            <div className="flex items-center text-rose-600 font-black text-2xl">
              <ArrowUpRight className="w-5 h-5 mr-1 stroke-[3]" />
              <span>-{todayOutQty}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 4. MAIN INVENTORY & PR REQUEST TABLE CARD */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {searchQuery.trim() ? (
              <>
                <Search className="w-5 h-5 text-blue-600" />
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  HASIL PENCARIAN: "{searchQuery.trim()}"
                </h2>
                <span className="bg-blue-100 text-blue-800 rounded-full px-2.5 py-0.5 text-xs font-bold">
                  {displayedItems.length} barang
                </span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight">
                  PR REQUEST
                </h2>
                <span className="bg-amber-100 text-amber-800 rounded-full px-2.5 py-0.5 text-xs font-bold">
                  {displayedItems.length}
                </span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {searchQuery.trim() ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setShowSearchResults(false);
                }}
                className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition cursor-pointer flex items-center gap-1.5"
              >
                <span>Tutup Hasil Pencarian</span>
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <>
                <button
                  onClick={() => setSelectedFilter(selectedFilter === 'PR_REQUEST' ? 'ALL' : 'PR_REQUEST')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedFilter === 'PR_REQUEST'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFilter === 'PR_REQUEST' ? 'bg-white' : 'bg-rose-500'}`}></span>
                  <span>PR Request</span>
                </button>

                <button
                  onClick={() => setSelectedFilter(selectedFilter === 'DIPROSES' ? 'ALL' : 'DIPROSES')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
                    selectedFilter === 'DIPROSES'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${selectedFilter === 'DIPROSES' ? 'bg-white' : 'bg-emerald-500'}`}></span>
                  <span>Diproses</span>
                </button>

                {selectedFilter !== 'ALL' && (
                  <button
                    onClick={() => setSelectedFilter('ALL')}
                    className="text-xs text-slate-400 hover:text-slate-600 underline font-medium ml-1"
                  >
                    Reset
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setIsPrTableMinimized(!isPrTableMinimized)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 transition cursor-pointer ml-1"
              title={isPrTableMinimized ? 'Tampilkan Tabel Penuh' : 'Minimize / Sembunyikan Tabel'}
            >
              {isPrTableMinimized ? (
                <>
                  <Maximize2 className="w-3.5 h-3.5 text-blue-600" />
                  <span>Maximize</span>
                </>
              ) : (
                <>
                  <Minimize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Minimize</span>
                </>
              )}
            </button>
          </div>
        </div>

        {isPrTableMinimized ? (
          <div className="p-4 px-6 bg-slate-50/70 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <span className="text-slate-600 font-medium">
              Tabel PR Request diminimalkan (<strong>{displayedItems.length} item barang</strong> siap dipantau).
            </span>
            <button
              onClick={() => setIsPrTableMinimized(false)}
              className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer flex items-center gap-1"
            >
              <span>Perluas & Tampilkan Tabel</span>
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">MATERIAL NUMBER & TIPE</th>
                <th className="py-3.5 px-4">NAMA BARANG & LOKASI</th>
                <th className="py-3.5 px-4 text-center">UNRESTRICTED STOCK</th>
                <th className="py-3.5 px-4 text-center">ROP</th>
                <th className="py-3.5 px-4">STATUS PENGADAAN (EVALUATOR)</th>
                <th className="py-3.5 px-4 min-w-[340px]">NOMOR PR (PURCHASE REQUISITION) & KETERANGAN</th>
                <th className="py-3.5 px-4">TERAKHIR DIPERBARUI</th>
                <th className="py-3.5 px-4 text-center min-w-[100px]">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-14 text-center">
                    <div className="max-w-md mx-auto space-y-3">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
                        <Package className="w-6 h-6 text-blue-600" />
                      </div>
                      <p className="font-extrabold text-slate-800 text-sm">Inventaris Gudang Masih Kosong (0 Barang)</p>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Database inventaris bersih dan siap diisi. Anda dapat mengunggah file data master asli perusahaan Anda via Excel/CSV atau menambahkan item secara manual.
                      </p>
                      <div className="pt-1">
                        <button
                          onClick={() => navigate('/import')}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                        >
                          <FileSpreadsheet className="w-4 h-4" />
                          <span>Unggah / Drop File Data Asli</span>
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : displayedItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Tidak ada permintaan PR aktif</p>
                    <p className="text-xs text-slate-400 mt-1">Seluruh item inventaris berada dalam saldo normal aman.</p>
                  </td>
                </tr>
              ) : (
                displayedItems.map((item) => {
                  const isProcessed = item.procurement_status === 'PR_PROCESSED' || item.procurement_status === 'ARRIVED';
                  const isEditingNotes = editingNotesId === item.id;
                  const hasPrNotes = Boolean(item.notes && item.notes !== '-' && item.notes !== 'Belum ada keterangan');

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="inline-block p-2 rounded-xl bg-slate-50 border border-slate-200/90 shadow-2xs">
                          <div 
                            onClick={() => navigate(`/bin-card/${item.id}`)}
                            className="font-mono font-black text-slate-900 text-xs tracking-wider cursor-pointer hover:text-blue-600 flex items-center gap-1"
                          >
                            <span>{item.material_no}</span>
                            <ExternalLink className="w-3 h-3 text-slate-400 opacity-60" />
                          </div>
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                            <span className="text-[10px] font-bold text-slate-600">
                              {item.contract_type === 'NON_FPA' ? 'Non-FPA' : 'FPA'}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4 max-w-xs">
                        <div 
                          onClick={() => navigate(`/bin-card/${item.id}`)}
                          className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer text-xs uppercase"
                        >
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 font-medium">
                          Rak BIN: <span className="font-mono font-semibold">{item.location}</span> • {item.category}
                        </div>
                      </td>

                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <span className={`font-mono text-sm font-extrabold ${
                          item.current_stock <= 0 ? 'text-rose-600' : 'text-slate-800'
                        }`}>
                          {item.current_stock}
                        </span>
                        <span className="ml-1 text-[11px] font-bold text-rose-600">
                          {item.unit}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-center whitespace-nowrap font-mono text-slate-700 font-bold text-xs">
                        {item.min_stock} {item.unit}
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        {canManagePR ? (
                          <select
                            value={isProcessed ? 'PROCESSED' : 'PR_REQUIRED'}
                            onChange={(e) => {
                              const val = e.target.value === 'PROCESSED' ? 'PR_PROCESSED' : 'PR_REQUIRED';
                              handleUpdateStatus(item, val);
                            }}
                            className={`text-xs font-bold rounded-xl px-3 py-1.5 border transition cursor-pointer appearance-none pr-7 relative focus:outline-none ${
                              isProcessed
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : 'bg-rose-50 text-rose-800 border-rose-300'
                            }`}
                          >
                            <option value="PROCESSED">🟢 Hijau: Sudah Diproses</option>
                            <option value="PR_REQUIRED">🔴 Merah: PR Request</option>
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            isProcessed
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-50 text-rose-800 border border-rose-300'
                          }`}>
                            {isProcessed ? '🟢 Sudah Diproses' : '🔴 PR Request'}
                          </span>
                        )}
                      </td>

                      {/* Prominent PR Number Column */}
                      <td className="py-4 px-4 min-w-[340px]">
                        {isEditingNotes ? (
                          <div className="p-3.5 bg-blue-50/95 border-2 border-blue-500 rounded-2xl space-y-2.5 shadow-md animate-in zoom-in-95">
                            <label className="text-[11px] font-black uppercase text-blue-950 tracking-wider flex items-center gap-1.5">
                              <FileText className="w-4 h-4 text-blue-700" />
                              <span>Nomor PR (Purchase Requisition) SAP:</span>
                            </label>
                            <input
                              type="text"
                              value={tempNotesText}
                              onChange={(e) => setTempNotesText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveNotes(item);
                                if (e.key === 'Escape') setEditingNotesId(null);
                              }}
                              placeholder="Ketik Nomor PR (cth: PR-2026-0089 atau 10029381)..."
                              className="w-full text-xs sm:text-sm px-3.5 py-2.5 bg-white border-2 border-blue-400 focus:border-blue-600 rounded-xl font-mono font-black text-slate-900 shadow-inner focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400 placeholder:font-sans"
                              autoFocus
                            />
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleSaveNotes(item)}
                                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-black transition shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <Check className="w-4 h-4" />
                                <span>Simpan Nomor PR</span>
                              </button>
                              <button
                                onClick={() => setEditingNotesId(null)}
                                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                              >
                                Batal
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {hasPrNotes ? (
                              <div className="flex items-center justify-between gap-2 p-2 px-3 bg-blue-50 border-2 border-blue-200/90 rounded-xl shadow-2xs">
                                <div className="flex items-center gap-2 overflow-hidden">
                                  <FileText className="w-4 h-4 text-blue-700 shrink-0" />
                                  <span className="font-mono font-black text-xs sm:text-sm text-blue-950 tracking-wide truncate">
                                    {item.notes}
                                  </span>
                                </div>
                                {canManagePR && (
                                  <button
                                    onClick={() => {
                                      setEditingNotesId(item.id);
                                      setTempNotesText(item.notes || '');
                                    }}
                                    className="px-2 py-1 bg-white hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-lg text-[11px] font-bold transition flex items-center gap-1 shrink-0 cursor-pointer shadow-2xs"
                                    title="Ubah Nomor PR"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                    <span>Ubah</span>
                                  </button>
                                )}
                              </div>
                            ) : (
                              <div>
                                {canManagePR ? (
                                  <button
                                    onClick={() => {
                                      setEditingNotesId(item.id);
                                      setTempNotesText('');
                                    }}
                                    className="w-full py-2.5 px-3 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50/70 rounded-xl text-xs font-bold text-blue-700 flex items-center justify-center gap-1.5 transition cursor-pointer shadow-2xs group"
                                  >
                                    <Plus className="w-4 h-4 text-blue-600 group-hover:scale-110 transition" />
                                    <span>Isi Nomor Dokumen PR</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-slate-400 italic">Belum ada nomor PR</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap text-xs text-slate-600">
                        <div className="font-semibold text-slate-800 capitalize">
                          {item.updated_by || 'Supervisor'}
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {formatDateTime24(item.updated_at).slice(5, 16)}
                        </div>
                      </td>

                      {/* Supervisor Delete Button */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {(isSupervisor || canDeleteMaster || currentUser?.role === 'supervisor') ? (
                          <button
                            onClick={() => setDeletingPrItem(item)}
                            title="Hapus Item dari PR Request / Inventaris (Khusus Supervisor)"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer shadow-2xs"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            <span>Hapus</span>
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        )}
      </div>

      {/* Delete Item Feedback Toast */}
      {deleteItemFeedback && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{deleteItemFeedback}</span>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Item PR Request (Khusus Supervisor) dengan 2 Pilihan Jelas */}
      {deletingPrItem && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl space-y-5 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-extrabold text-slate-900">
                  Kelola / Hapus Item PR Request
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hak Akses Khusus: <strong className="text-slate-800">Supervisor</strong>
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1">
              <div className="font-mono font-bold text-xs text-blue-900">
                [{deletingPrItem.material_no}]
              </div>
              <div className="font-bold text-slate-900 text-sm">
                {deletingPrItem.name}
              </div>
              <div className="text-xs text-slate-500">
                Stok Fisik: <strong>{deletingPrItem.current_stock} {deletingPrItem.unit}</strong> • ROP: <strong>{deletingPrItem.min_stock} {deletingPrItem.unit}</strong>
              </div>
            </div>

            <div className="space-y-2.5">
              {/* Option 1: Remove from PR Request only */}
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={async () => {
                  setIsDeletingItem(true);
                  await updateItem(deletingPrItem.id, {
                    procurement_status: 'NORMAL',
                    notes: 'Dikeluarkan dari PR Request oleh Supervisor'
                  });
                  setIsDeletingItem(false);
                  setDeleteItemFeedback('Item berhasil dikeluarkan dari daftar PR Request.');
                  setDeletingPrItem(null);
                  setTimeout(() => setDeleteItemFeedback(''), 4000);
                }}
                className="w-full p-3.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-2xl text-left transition flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-xl bg-amber-200 text-amber-800 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  1
                </div>
                <div>
                  <div className="text-xs font-extrabold text-amber-950 group-hover:text-amber-900">
                    Keluarkan dari PR Request (Reset ke Normal)
                  </div>
                  <div className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                    Barang tidak akan muncul lagi di daftar PR Request, tetapi data master barang & riwayat stok tetap aman tersimpan di gudang.
                  </div>
                </div>
              </button>

              {/* Option 2: Delete Entire Item from Database */}
              <button
                type="button"
                disabled={isDeletingItem}
                onClick={async () => {
                  setIsDeletingItem(true);
                  const res = await deleteItem(deletingPrItem.id);
                  setIsDeletingItem(false);
                  if (res.success) {
                    setDeleteItemFeedback('Item dan seluruh riwayat berhasil dihapus permanen.');
                    setDeletingPrItem(null);
                    setTimeout(() => setDeleteItemFeedback(''), 4000);
                  } else {
                    alert(res.message);
                  }
                }}
                className="w-full p-3.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-2xl text-left transition flex items-start gap-3 cursor-pointer group"
              >
                <div className="w-7 h-7 rounded-xl bg-rose-200 text-rose-800 flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  2
                </div>
                <div>
                  <div className="text-xs font-extrabold text-rose-950 group-hover:text-rose-900">
                    Hapus Total Item Permanen dari Database
                  </div>
                  <div className="text-[11px] text-rose-800 mt-0.5 leading-relaxed">
                    Menghapus barang secara permanen dari master inventaris, kartu bin card, dan database Cloud SQL & Firebase.
                  </div>
                </div>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setDeletingPrItem(null)}
                disabled={isDeletingItem}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
