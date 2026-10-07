import React, { useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  ArrowLeftRight, 
  Search, 
  Download, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Edit3, 
  AlertTriangle, 
  FileText,
  Trash2,
  CheckCircle2
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { StockTransaction, TransactionType } from '../types/inventory';
import { DateTime24Picker } from '../components/common/DateTime24Picker';
import { NumericQuantityInput } from '../components/common/NumericQuantityInput';
import { formatDateTime24, padTo18Digits } from '../utils/materialUtils';

export const TransactionsPage: React.FC = () => {
  const { items, transactions, addTransaction, updateTransaction, deleteTransaction } = useInventory();
  const { currentUser, currentGroup, canMutateStock, canManageMaster, isSupervisor } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>(
    searchParams.get('type') || 'ALL'
  );

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [newTxType, setNewTxType] = useState<TransactionType>('IN');
  const [newTxQty, setNewTxQty] = useState<number>(0);
  const [newTxDocRef, setNewTxDocRef] = useState<string>('');
  const [newTxPic, setNewTxPic] = useState<string>(currentUser?.name || '');
  const [newTxNotes, setNewTxNotes] = useState<string>('');
  const [newTxTimestamp, setNewTxTimestamp] = useState<string>(new Date().toISOString());
  const [newTxError, setNewTxError] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<StockTransaction | null>(null);
  const [editQty, setEditQty] = useState<number>(0);
  const [editDocRef, setEditDocRef] = useState<string>('');
  const [editPic, setEditPic] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [editError, setEditError] = useState<string>('');

  // Delete modal state
  const [deletingTx, setDeletingTx] = useState<StockTransaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<string>('');

  const activeItem = useMemo(() => {
    return items.find(i => i.id === selectedItemId);
  }, [items, selectedItemId]);

  const handleOpenNewModal = (type: TransactionType = 'IN') => {
    if (items.length === 0) {
      alert('Gudang belum memiliki master barang. Silakan import file Excel atau daftarkan barang terlebih dahulu.');
      return;
    }
    setNewTxType(type);
    setSelectedItemId(items[0]?.id || '');
    setNewTxQty(0);
    setNewTxDocRef(type === 'IN' ? 'SJ-2026-' : 'WO-2026-');
    setNewTxPic(currentUser?.name || '');
    setNewTxNotes('');
    setNewTxTimestamp(new Date().toISOString());
    setNewTxError('');
    setIsNewModalOpen(true);
  };

  const handleOpenEditModal = (tx: StockTransaction) => {
    setEditingTx(tx);
    setEditQty(tx.quantity);
    setEditDocRef(tx.doc_ref);
    setEditPic(tx.pic_name);
    setEditNotes(tx.notes || '');
    setEditError('');
    setIsEditModalOpen(true);
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (selectedType !== 'ALL' && t.type !== selectedType) {
        return false;
      }
      const s = searchTerm.toLowerCase().trim();
      const sPadded = padTo18Digits(s);
      return !s ||
        (t.item_name && t.item_name.toLowerCase().includes(s)) ||
        t.material_no.includes(s) ||
        (sPadded && t.material_no.includes(sPadded)) ||
        t.doc_ref.toLowerCase().includes(s) ||
        t.pic_name.toLowerCase().includes(s) ||
        t.notes.toLowerCase().includes(s);
    });
  }, [transactions, selectedType, searchTerm]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeItem) {
      setNewTxError('Pilih barang terlebih dahulu.');
      return;
    }

    const qty = Number(newTxQty);
    if (isNaN(qty) || qty <= 0) {
      setNewTxError('Kuantitas harus lebih besar dari 0.');
      return;
    }

    if (!newTxDocRef.trim()) {
      setNewTxError('Nomor Dokumen Acuan wajib diisi.');
      return;
    }

    if (!newTxPic.trim()) {
      setNewTxError('Nama PIC wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    setNewTxError('');

    try {
      const res = await addTransaction({
        item_id: activeItem.id,
        type: newTxType,
        quantity: qty,
        doc_ref: newTxDocRef,
        pic_name: newTxPic,
        notes: newTxNotes,
        customTimestamp: newTxTimestamp
      });

      if (!res.success) {
        setNewTxError(res.message);
        return;
      }

      setIsNewModalOpen(false);
    } catch (err) {
      setNewTxError(err instanceof Error ? err.message : 'Terjadi kesalahan.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;

    const qty = Number(editQty);
    if (isNaN(qty) || qty <= 0) {
      setEditError('Kuantitas koreksi harus lebih besar dari 0.');
      return;
    }

    setIsSubmitting(true);
    setEditError('');

    try {
      const res = await updateTransaction(editingTx.id, {
        quantity: qty,
        doc_ref: editDocRef,
        pic_name: editPic,
        notes: editNotes
      });

      if (!res.success) {
        setEditError(res.message);
        return;
      }

      setIsEditModalOpen(false);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : 'Gagal memperbarui transaksi.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExportExcel = () => {
    const rows = filteredTransactions.map((t, idx) => ({
      No: idx + 1,
      'Waktu Transaksi (24 Jam)': formatDateTime24(t.timestamp),
      'Nomor Material SAP': t.material_no,
      'Nama Barang': t.item_name || '-',
      'Jenis Mutasi': t.type,
      'Kuantitas Masuk (IN)': t.type === 'IN' ? t.quantity : 0,
      'Kuantitas Keluar (OUT)': t.type === 'OUT' ? t.quantity : 0,
      'Saldo Akhir': t.balance_after,
      'No. Dokumen Acuan': t.doc_ref,
      'PIC': t.pic_name,
      'Operator': `${t.operator_username} (${t.operator_group})`,
      'Keterangan': t.notes
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jurnal Mutasi');
    XLSX.writeFile(wb, `MUTASI_STOK_WMS_${Date.now()}.xlsx`);
  };

  return (
    <div className="space-y-5 pb-24 lg:pb-12 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <ArrowLeftRight className="w-6 h-6 text-blue-600" />
            Buku Jurnal Mutasi Stok
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Kontrol keluar-masuk barang, validasi saldo fisik, referensi dokumen acuan, dan pencatatan PIC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-emerald-600" />
            <span>Ekspor Excel</span>
          </button>

          {canMutateStock && (
            <>
              <button
                onClick={() => handleOpenNewModal('IN')}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4" />
                <span>Input Barang Masuk (IN)</span>
              </button>
              <button
                onClick={() => handleOpenNewModal('OUT')}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-sm transition cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4" />
                <span>Input Barang Keluar (OUT)</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-8 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari no material 18 digit, nama barang, nomor dokumen (SJ/PO), nama PIC..."
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-blue-500"
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500"
            >
              <option value="ALL">Semua Jenis Mutasi</option>
              <option value="IN">Hanya Barang Masuk (IN)</option>
              <option value="OUT">Hanya Barang Keluar (OUT)</option>
              <option value="STO">Hanya Penyesuaian Opname (STO)</option>
            </select>
          </div>
        </div>

        <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span>Menampilkan <strong className="text-slate-800">{filteredTransactions.length}</strong> transaksi</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-mono font-extrabold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-3">Waktu</th>
                <th className="py-3 px-3">Tipe</th>
                <th className="py-3 px-3">Nomor Material & Barang</th>
                <th className="py-3 px-3">No. Dokumen Acuan</th>
                <th className="py-3 px-3 text-right">Kuantitas</th>
                <th className="py-3 px-3 text-right">Saldo Akhir</th>
                <th className="py-3 px-3">PIC Pengambil/Penerima</th>
                <th className="py-3 px-3">Operator</th>
                <th className="py-3 px-3 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    <ArrowLeftRight className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-slate-700 text-sm">Belum ada riwayat transaksi mutasi</p>
                    <p className="text-xs text-slate-400 mt-1">Seluruh barang masuk (IN), keluar (OUT), dan STO akan tercatat otomatis di sini.</p>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                  <td className="py-3 px-3 whitespace-nowrap text-slate-800 font-semibold">
                    {formatDateTime24(tx.timestamp)}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                      tx.type === 'IN'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : tx.type === 'OUT'
                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      {tx.type}
                    </span>
                  </td>

                  <td className="py-3 px-3 max-w-xs">
                    <div 
                      onClick={() => navigate(`/bin-card/${tx.item_id}`)}
                      className="font-bold text-blue-600 hover:text-blue-800 cursor-pointer tracking-wider"
                    >
                      {tx.material_no}
                    </div>
                    <div className="font-sans text-slate-800 truncate mt-0.5">
                      {tx.item_name}
                    </div>
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap text-slate-800 font-semibold">
                    {tx.doc_ref}
                  </td>

                  <td className={`py-3 px-3 text-right font-extrabold whitespace-nowrap text-sm ${
                    tx.type === 'IN' ? 'text-emerald-600' : tx.type === 'OUT' ? 'text-amber-600' : 'text-purple-600'
                  }`}>
                    {tx.type === 'IN' ? '+' : tx.type === 'OUT' ? '-' : ''}{tx.quantity}
                  </td>

                  <td className="py-3 px-3 text-right font-black text-slate-900 whitespace-nowrap text-sm">
                    {tx.balance_after}
                  </td>

                  <td className="py-3 px-3 font-sans whitespace-nowrap text-slate-800">
                    {tx.pic_name}
                  </td>

                  <td className="py-3 px-3 whitespace-nowrap text-slate-500">
                    {tx.operator_username} <span className="text-[10px]">({tx.operator_group})</span>
                  </td>

                  <td className="py-3 px-3 text-center whitespace-nowrap">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        onClick={() => navigate(`/bin-card/${tx.item_id}`)}
                        title="Buka Bin Card"
                        className="p-1.5 hover:bg-slate-100 text-blue-600 rounded-lg transition cursor-pointer"
                      >
                        <FileText className="w-4 h-4" />
                      </button>

                      {canManageMaster && (
                        <button
                          onClick={() => handleOpenEditModal(tx)}
                          title="Koreksi Transaksi"
                          className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-slate-800 rounded-lg transition cursor-pointer"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}

                      {/* Delete mutation: exclusively for Supervisor */}
                      {(isSupervisor || currentUser?.role === 'supervisor') && (
                        <button
                          onClick={() => setDeletingTx(tx)}
                          title="Hapus Transaksi (Khusus Supervisor)"
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Feedback Toast */}
      {deleteFeedback && (
        <div className="fixed bottom-6 right-6 z-50 p-4 bg-emerald-600 text-white rounded-2xl shadow-xl flex items-center gap-2 text-xs font-bold animate-in fade-in">
          <CheckCircle2 className="w-4 h-4" />
          <span>{deleteFeedback}</span>
        </div>
      )}

      {/* Modal Konfirmasi Hapus Transaksi (Khusus Supervisor) */}
      {deletingTx && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-extrabold text-slate-900">
                Hapus Riwayat Mutasi?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Transaksi <strong className="text-slate-900">{deletingTx.type}</strong> sebanyak <strong className="text-slate-900">{deletingTx.quantity}</strong> pada dokumen <strong className="text-slate-900">{deletingTx.doc_ref}</strong> akan dihapus permanen.
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-[11px] text-left mt-2">
                Saldo stok barang <span className="font-mono font-bold">{deletingTx.material_no}</span> akan otomatis dipulihkan ke saldo sebelum transaksi ({deletingTx.balance_before}).
              </div>
            </div>

            <div className="flex items-center gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTx(null)}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setIsDeleting(true);
                  const res = await deleteTransaction(deletingTx.id);
                  setIsDeleting(false);
                  if (res.success) {
                    setDeleteFeedback(res.message);
                    setDeletingTx(null);
                    setTimeout(() => setDeleteFeedback(''), 4000);
                  } else {
                    alert(res.message);
                  }
                }}
                disabled={isDeleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold rounded-xl transition shadow-md cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeleting ? 'Menghapus...' : 'Ya, Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal New Mutation */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl my-8 relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                Catat Transaksi Mutasi Stok
              </h2>
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {newTxError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{newTxError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setNewTxType('IN');
                    if (newTxDocRef.startsWith('WO-')) setNewTxDocRef('SJ-2026-');
                  }}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    newTxType === 'IN'
                      ? 'bg-[#10B981] text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowDownLeft className="w-4 h-4" />
                  Barang Masuk (IN)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNewTxType('OUT');
                    if (newTxDocRef.startsWith('SJ-')) setNewTxDocRef('WO-2026-');
                  }}
                  className={`py-2 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                    newTxType === 'OUT'
                      ? 'bg-amber-600 text-white shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Barang Keluar (OUT)
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Pilih Barang Inventaris *
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono"
                  required
                >
                  {items.map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.material_no}] {i.name} (Stok: {i.current_stock} {i.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Kuantitas *
                </label>
                <NumericQuantityInput
                  min={0}
                  max={newTxType === 'OUT' && activeItem ? activeItem.current_stock : undefined}
                  value={newTxQty}
                  onChange={setNewTxQty}
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nomor Dokumen Acuan (No. Surat Jalan / PO / SPK / Work Order) *
                </label>
                <input
                  type="text"
                  value={newTxDocRef}
                  onChange={(e) => setNewTxDocRef(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nama PIC *
                </label>
                <input
                  type="text"
                  value={newTxPic}
                  onChange={(e) => setNewTxPic(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <DateTime24Picker
                value={newTxTimestamp}
                onChange={setNewTxTimestamp}
              />

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Keterangan / Deskripsi
                </label>
                <input
                  type="text"
                  value={newTxNotes}
                  onChange={(e) => setNewTxNotes(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsNewModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-md cursor-pointer ${
                    newTxType === 'IN'
                      ? 'bg-[#10B981] hover:bg-emerald-600'
                      : 'bg-amber-600 hover:bg-amber-500'
                  }`}
                >
                  {isSubmitting ? 'Menyimpan...' : `Simpan Mutasi ${newTxType}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Edit Mutation */}
      {isEditModalOpen && editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                Koreksi Data Transaksi Mutasi
              </h2>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {editError && (
              <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <div className="font-mono text-blue-600 font-bold">{editingTx.material_no}</div>
                <div className="text-slate-800 font-medium truncate">{editingTx.item_name}</div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Kuantitas Mutasi (Koreksi) *
                </label>
                <NumericQuantityInput
                  min={0}
                  value={editQty}
                  onChange={setEditQty}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-base font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nomor Dokumen Acuan *
                </label>
                <input
                  type="text"
                  value={editDocRef}
                  onChange={(e) => setEditDocRef(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Nama PIC *
                </label>
                <input
                  type="text"
                  value={editPic}
                  onChange={(e) => setEditPic(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-700 mb-1">
                  Catatan Koreksi
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                >
                  {isSubmitting ? 'Menyimpan...' : 'Simpan Koreksi Transaksi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
