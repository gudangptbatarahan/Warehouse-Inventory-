import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  Boxes, 
  Search, 
  Plus, 
  Printer, 
  FileSpreadsheet, 
  Edit3, 
  Trash2, 
  ExternalLink, 
  Dices,
  QrCode,
  AlertTriangle,
  Package,
  CheckCircle2
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { InventoryItem, ContractType, ProcurementStatus } from '../types/inventory';
import { LocationPicker } from '../components/common/LocationPicker';
import { NumericQuantityInput } from '../components/common/NumericQuantityInput';
import { 
  padTo18Digits, 
  generateRandom18DigitCode, 
  STANDARD_UNITS, 
  CATEGORIES,
  isValid18DigitMaterial 
} from '../utils/materialUtils';

export const ItemsPage: React.FC = () => {
  const { items, addItem, updateItem, deleteItem, clearAllData } = useInventory();
  const { canManageMaster, canDeleteMaster } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedContract, setSelectedContract] = useState<string>('ALL');
  const [selectedStockFilter, setSelectedStockFilter] = useState<string>(
    searchParams.get('filter') === 'critical' ? 'CRITICAL' : 'ALL'
  );

  // Notification feedback
  const [notificationMsg, setNotificationMsg] = useState('');

  // Delete Single Item Modal
  const [deletingItemTarget, setDeletingItemTarget] = useState<InventoryItem | null>(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form State
  const [formMaterialNo, setFormMaterialNo] = useState('');
  const [formName, setFormName] = useState('');
  const [formSpec, setFormSpec] = useState('');
  const [formCategory, setFormCategory] = useState<string>(CATEGORIES[0]);
  const [formUnit, setFormUnit] = useState<string>(STANDARD_UNITS[0]);
  const [formContract, setFormContract] = useState<ContractType>('NON_FPA');
  const [formLocation, setFormLocation] = useState('1.01.01.01A');
  const [formCurrentStock, setFormCurrentStock] = useState<number>(0);
  const [formMinStock, setFormMinStock] = useState<number>(0);
  const [formMaxStock, setFormMaxStock] = useState<number>(0);
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-selection for Batch Print
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  // Check URL query action=new and search query
  useEffect(() => {
    if (searchParams.get('action') === 'new' && canManageMaster) {
      handleOpenCreate();
      searchParams.delete('action');
      setSearchParams(searchParams, { replace: true });
    }
    const q = searchParams.get('search');
    if (q !== null) {
      setSearchTerm(q);
    }
  }, [searchParams, canManageMaster]);

  // Handle open create modal
  const handleOpenCreate = () => {
    setEditingItem(null);
    setFormMaterialNo(generateRandom18DigitCode());
    setFormName('');
    setFormSpec('');
    setFormCategory(CATEGORIES[0]);
    setFormUnit(STANDARD_UNITS[0]);
    setFormContract('NON_FPA');
    setFormLocation('1.01.01.01A');
    setFormCurrentStock(0);
    setFormMinStock(0);
    setFormMaxStock(0);
    setFormNotes('');
    setFormError('');
    setIsModalOpen(true);
  };

  // Handle open edit modal
  const handleOpenEdit = (item: InventoryItem) => {
    setEditingItem(item);
    setFormMaterialNo(item.material_no);
    setFormName(item.name);
    setFormSpec(item.specification || '');
    setFormCategory(item.category);
    setFormUnit(item.unit);
    setFormContract(item.contract_type);
    setFormLocation(item.location);
    setFormCurrentStock(item.current_stock);
    setFormMinStock(item.min_stock);
    setFormMaxStock(item.max_stock);
    setFormNotes(item.notes || '');
    setFormError('');
    setIsModalOpen(true);
  };

  // Filtered Items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const s = searchTerm.toLowerCase().trim();
      const sPadded = padTo18Digits(s);
      const matchesSearch = 
        !s ||
        item.name.toLowerCase().includes(s) ||
        item.material_no.includes(s) ||
        (sPadded && item.material_no.includes(sPadded)) ||
        item.location.toLowerCase().includes(s) ||
        (item.specification && item.specification.toLowerCase().includes(s));

      if (!matchesSearch) return false;

      if (selectedCategory !== 'ALL' && item.category !== selectedCategory) {
        return false;
      }

      if (selectedContract !== 'ALL' && item.contract_type !== selectedContract) {
        return false;
      }

      if (selectedStockFilter === 'CRITICAL') {
        return item.current_stock <= item.min_stock;
      }
      if (selectedStockFilter === 'OUT_OF_STOCK') {
        return item.current_stock <= 0;
      }
      if (selectedStockFilter === 'SAFE') {
        return item.current_stock > item.min_stock;
      }

      return true;
    });
  }, [items, searchTerm, selectedCategory, selectedContract, selectedStockFilter]);

  const handleMaterialBlur = () => {
    if (formMaterialNo) {
      setFormMaterialNo(padTo18Digits(formMaterialNo));
    }
  };

  const handleRandomizeCode = () => {
    setFormMaterialNo(generateRandom18DigitCode());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const paddedNo = padTo18Digits(formMaterialNo);
    if (!isValid18DigitMaterial(paddedNo)) {
      setFormError('Nomor Material harus tepat 18 angka digit SAP (contoh: 031007000000000235).');
      return;
    }

    if (!formName.trim()) {
      setFormError('Nama barang wajib diisi.');
      return;
    }

    const curStock = Number(formCurrentStock);
    const minStock = Number(formMinStock);
    const maxStock = Number(formMaxStock);

    if (isNaN(curStock) || curStock < 0) {
      setFormError('Kuantitas stok saat ini harus berupa angka >= 0.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingItem) {
        const res = await updateItem(editingItem.id, {
          material_no: paddedNo,
          name: formName.trim(),
          specification: formSpec.trim(),
          category: formCategory,
          unit: formUnit,
          contract_type: formContract,
          location: formLocation,
          current_stock: curStock,
          min_stock: minStock,
          max_stock: maxStock,
          notes: formNotes.trim()
        });
        if (!res.success) {
          setFormError(res.message);
          return;
        }
      } else {
        const res = await addItem({
          material_no: paddedNo,
          name: formName.trim(),
          specification: formSpec.trim(),
          category: formCategory,
          unit: formUnit,
          contract_type: formContract,
          location: formLocation,
          current_stock: curStock,
          min_stock: minStock,
          max_stock: maxStock,
          procurement_status: curStock <= minStock ? 'MINIMUM' : 'NORMAL',
          notes: formNotes.trim()
        });
        if (!res.success) {
          setFormError(res.message);
          return;
        }
      }
      setIsModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Terjadi kesalahan sistem.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedItemIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedItemIds.length === filteredItems.length) {
      setSelectedItemIds([]);
    } else {
      setSelectedItemIds(filteredItems.map(i => i.id));
    }
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-12 max-w-7xl mx-auto">
      {/* Top Header Matching Screenshot 4 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              Daftar Barang & Inventaris Fisik
            </h1>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {items.length} Total Barang
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Cari nomor material, cetak stiker label QR, dan kelola mutasi stok
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {canManageMaster && (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md shadow-blue-900/10 transition cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Barang</span>
            </button>
          )}

          <button
            onClick={() => navigate('/import')}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Import Excel / CSV</span>
          </button>

          <button
            onClick={() => {
              const exportRows = filteredItems.map((item, idx) => ({
                No: idx + 1,
                'Material Number': item.material_no,
                'Nama Barang': item.name,
                'Spesifikasi': item.specification || '-',
                'Kategori': item.category,
                'Kontrak': item.contract_type,
                'Lokasi Rak': item.location,
                'Saldo Fisik': item.current_stock,
                'Satuan': item.unit,
                'Min Stock': item.min_stock,
                'Max Stock': item.max_stock,
                'Status': item.procurement_status
              }));
              const ws = XLSX.utils.json_to_sheet(exportRows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, 'Master Barang');
              XLSX.writeFile(wb, `MASTER_BARANG_${Date.now()}.xlsx`);
            }}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Ekspor Excel (.xlsx)</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar Matching Screenshot 4 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
          <div className="lg:col-span-4 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari kode, nama, atau BIN..."
              className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="ALL">Semua Kategori ({CATEGORIES.length})</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedContract}
              onChange={(e) => setSelectedContract(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="ALL">Klasifikasi: Semua (FPA & Non-FP...</option>
              <option value="FPA">FPA (Fixed Price Agreement)</option>
              <option value="NON_FPA">Non-FPA (Reguler)</option>
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={selectedStockFilter}
              onChange={(e) => setSelectedStockFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="ALL">Status Stok: Semua</option>
              <option value="SAFE">Stok Aman (&gt; min)</option>
              <option value="CRITICAL">Stok Kritis (&le; min)</option>
              <option value="OUT_OF_STOCK">Stok Habis (0)</option>
            </select>
          </div>

          <div className="lg:col-span-2 flex items-center gap-1.5">
            <select
              className="flex-1 px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-medium cursor-pointer"
            >
              <option value="code">Urutkan: Kode</option>
              <option value="name">Urutkan: Nama</option>
              <option value="stock">Urutkan: Stok</option>
            </select>
            <button
              type="button"
              title="Arah Urutan"
              className="p-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
            >
              ⇅
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-2.5 mt-2 border-t border-slate-100">
          <label className="flex items-center gap-2 cursor-pointer hover:text-slate-800">
            <input
              type="checkbox"
              checked={filteredItems.length > 0 && selectedItemIds.length === filteredItems.length}
              onChange={handleSelectAll}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>Pilih Semua Halaman ({filteredItems.length})</span>
          </label>
          <div>
            Menampilkan <strong className="text-slate-800">{filteredItems.length}</strong> dari {items.length} master barang
          </div>
        </div>
      </div>

      {/* Items Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredItems.length > 0 && selectedItemIds.length === filteredItems.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-300 text-blue-600"
                  />
                </th>
                <th className="py-3.5 px-3 whitespace-nowrap">MATERIAL NUMBER & TIPE</th>
                <th className="py-3.5 px-4 min-w-[240px]">NAMA BARANG & SPESIFIKASI</th>
                <th className="py-3.5 px-3 whitespace-nowrap">KATEGORI</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">LOKASI RAK</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">SALDO FISIK</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">SATUAN</th>
                <th className="py-3.5 px-3 text-right whitespace-nowrap">MIN STOCK</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">STATUS</th>
                <th className="py-3.5 px-3 text-center whitespace-nowrap">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center">
                    {items.length === 0 ? (
                      <div className="max-w-md mx-auto space-y-3.5 p-4">
                        <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
                          <Package className="w-8 h-8 text-blue-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-black text-slate-900 tracking-tight">
                            Gudang Masih Kosong (0 Barang)
                          </h3>
                          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                            Seluruh data inventaris bersih dan siap digunakan. Anda dapat langsung mengunggah file spreadsheet Excel / CSV data master asli perusahaan Anda atau mendaftarkan barang manual.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                          <button
                            onClick={() => navigate('/import')}
                            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer"
                          >
                            <FileSpreadsheet className="w-4 h-4" />
                            <span>Upload / Drop File Excel Asli</span>
                          </button>
                          {canManageMaster && (
                            <button
                              onClick={handleOpenCreate}
                              className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Tambah Barang Manual</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 py-6">
                        <Search className="w-8 h-8 text-slate-300 mx-auto" />
                        <p className="font-bold text-slate-600 text-sm">Tidak ada barang yang cocok dengan filter</p>
                        <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau reset filter kategori.</p>
                      </div>
                    )}
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                const isCritical = item.current_stock <= item.min_stock;
                const isOutOfStock = item.current_stock <= 0;
                const isSelected = selectedItemIds.includes(item.id);
                const specText = item.specification || item.description || '-';

                return (
                  <tr 
                    key={item.id} 
                    className={`hover:bg-slate-50/80 transition ${
                      isSelected ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded border-slate-300 text-blue-600 cursor-pointer"
                      />
                    </td>

                    {/* material_code */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div 
                        onClick={() => navigate(`/bin-card/${item.id}`)}
                        className="font-mono font-bold text-blue-700 text-xs tracking-wider cursor-pointer hover:underline"
                        title="Buka Bin Card"
                      >
                        {item.material_no}
                      </div>
                      <div className="mt-0.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {item.contract_type === 'NON_FPA' ? 'Non-FPA' : 'FPA'}
                        </span>
                      </div>
                    </td>

                    {/* name & specification under it */}
                    <td className="py-3.5 px-4 max-w-md">
                      <div 
                        onClick={() => navigate(`/bin-card/${item.id}`)}
                        className="font-black text-slate-900 hover:text-blue-700 cursor-pointer text-xs uppercase"
                        title={item.name}
                      >
                        {item.name}
                      </div>
                      <div 
                        className="text-[11px] text-slate-500 font-mono mt-0.5 leading-relaxed break-words line-clamp-2 hover:line-clamp-none"
                        title={specText}
                      >
                        {specText}
                      </div>
                    </td>

                    {/* category */}
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap font-medium text-xs">
                      {item.category}
                    </td>

                    {/* location */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-800 border border-slate-200 rounded-md font-mono font-bold text-[11px]">
                        {item.location}
                      </span>
                    </td>

                    {/* initial_stock / current_stock */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono">
                      <span className={`text-sm font-extrabold ${
                        isOutOfStock ? 'text-rose-600' : isCritical ? 'text-amber-600' : 'text-slate-900'
                      }`}>
                        {item.current_stock}
                      </span>
                    </td>

                    {/* unit */}
                    <td className="py-3 px-3 text-center whitespace-nowrap font-mono font-bold text-slate-600 text-xs">
                      {item.unit}
                    </td>

                    {/* min_stock */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono text-slate-500 font-semibold text-xs">
                      {item.min_stock}
                    </td>

                    {/* Status */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {isOutOfStock ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          HABIS (0)
                        </span>
                      ) : isCritical ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          MENIPIS
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          AMAN
                        </span>
                      )}
                    </td>

                    {/* Aksi */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => navigate(`/bin-card/${item.id}`)}
                          title="Buka Bin Card"
                          className="p-1.5 hover:bg-slate-100 text-blue-600 rounded-lg transition cursor-pointer"
                        >
                          <QrCode className="w-4 h-4" />
                        </button>

                        {canManageMaster && (
                          <button
                            onClick={() => handleOpenEdit(item)}
                            title="Edit Barang"
                            className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {canDeleteMaster && (
                          <button
                            onClick={() => setDeletingItemTarget(item)}
                            title="Hapus Barang"
                            className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Tambah & Edit Barang */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl my-8 relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Boxes className="w-5 h-5 text-blue-600" />
                {editingItem ? 'Edit Master Barang' : 'Registrasi Barang Baru (SAP 18-Digit)'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700">
                    Nomor Material SAP (Tepat 18 Digit Angka) *
                  </label>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-mono font-bold ${
                      formMaterialNo.length === 18 ? 'text-emerald-600' : 'text-amber-600'
                    }`}>
                      {formMaterialNo.length}/18 Digit
                    </span>
                    <button
                      type="button"
                      onClick={handleRandomizeCode}
                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 font-semibold underline cursor-pointer"
                    >
                      <Dices className="w-3.5 h-3.5" />
                      Acak Kode
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={formMaterialNo}
                  onChange={(e) => setFormMaterialNo(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  onBlur={handleMaterialBlur}
                  placeholder="Contoh: 031007000000000235"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm text-slate-900 tracking-wider focus:outline-none focus:bg-white focus:border-blue-500 font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nama Barang / Material Deskripsi *
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Ball Valve 2 Inch ANSI 150# Flanged SS316"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Spesifikasi Teknis / Part Number / Ukuran
                </label>
                <textarea
                  rows={2}
                  value={formSpec}
                  onChange={(e) => setFormSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Kategori *
                  </label>
                  <input
                    type="text"
                    list="items-category-list"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    placeholder="Kategori barang..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-semibold"
                    required
                  />
                  <datalist id="items-category-list">
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Satuan / Unit *
                  </label>
                  <input
                    type="text"
                    list="items-unit-list"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value.toUpperCase())}
                    placeholder="Contoh: PCS, SET, UNIT..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono font-bold uppercase"
                    required
                  />
                  <datalist id="items-unit-list">
                    {STANDARD_UNITS.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Jenis Kontrak *
                  </label>
                  <select
                    value={formContract}
                    onChange={(e) => setFormContract(e.target.value as ContractType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none font-bold cursor-pointer"
                  >
                    <option value="NON_FPA">NON-FPA</option>
                    <option value="FPA">FPA (Fixed Price)</option>
                  </select>
                </div>
              </div>

              <LocationPicker
                value={formLocation}
                onChange={setFormLocation}
              />

              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                    Saldo Fisik Saat Ini *
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={formCurrentStock}
                    onChange={setFormCurrentStock}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-amber-700 mb-1">
                    Stok Minimum (Safety) *
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={formMinStock}
                    onChange={setFormMinStock}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500 mb-1">
                    Kapasitas Maksimum
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={formMaxStock}
                    onChange={setFormMaxStock}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-sm text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Catatan Tambahan
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Keterangan vendor, rak khusus, atau instruksi handling..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
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
                  className="px-5 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Menyimpan...' : editingItem ? 'Simpan Perubahan' : 'Daftarkan Barang Baru'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Single Item Modal */}
      {deletingItemTarget && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 tracking-tight">
                  Hapus Master Barang?
                </h3>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {deletingItemTarget.material_no}
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-1">
              <div className="font-bold text-slate-900">{deletingItemTarget.name}</div>
              <p className="text-[11px] text-slate-500">
                Stok saat ini: {deletingItemTarget.current_stock} {deletingItemTarget.unit}. Tindakan ini akan menghapus data barang dan mutasinya secara permanen.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setDeletingItemTarget(null)}
                disabled={isDeletingSingle}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingSingle}
                onClick={async () => {
                  setIsDeletingSingle(true);
                  const res = await deleteItem(deletingItemTarget.id);
                  setIsDeletingSingle(false);
                  setDeletingItemTarget(null);
                  if (res.success) {
                    setNotificationMsg('Barang berhasil dihapus secara instan.');
                    setTimeout(() => setNotificationMsg(''), 4000);
                  } else {
                    alert(res.message);
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                {isDeletingSingle ? (
                  <span>Menghapus...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {notificationMsg && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{notificationMsg}</span>
        </div>
      )}
    </div>
  );
};
