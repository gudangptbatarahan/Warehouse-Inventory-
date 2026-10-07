import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';
import { 
  ArrowLeft, 
  Printer, 
  Download, 
  MapPin, 
  FileText, 
  Boxes,
  AlertTriangle,
  Copy,
  Check,
  Edit,
  Trash2,
  ClipboardCheck,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  Lock,
  RotateCcw,
  Calendar,
  Clock,
  X,
  Sparkles,
  Info
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { QrCodeGenerator } from '../components/common/QrCodeGenerator';
import { LocationPicker } from '../components/common/LocationPicker';
import { NumericQuantityInput } from '../components/common/NumericQuantityInput';
import { formatDateTime24, parseLocation, padTo18Digits, isValid18DigitMaterial, CATEGORIES, STANDARD_UNITS } from '../utils/materialUtils';
import { TransactionType, ContractType, StockTransaction } from '../types/inventory';

export const BinCardPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { 
    items, 
    getItemById, 
    getItemByMaterialNo, 
    getItemTransactions, 
    addTransaction, 
    updateItem, 
    updateTransaction, 
    deleteTransaction 
  } = useInventory();
  const { 
    currentUser, 
    canMutateStock, 
    canStockTake, 
    canManageMaster, 
    canEditMutation, 
    canDeleteMutation,
    isSupervisor 
  } = useAuth();

  const item = useMemo(() => {
    if (!id) return undefined;
    return getItemById(id) || getItemByMaterialNo(id);
  }, [id, getItemById, getItemByMaterialNo, items]);

  const transactions = useMemo(() => {
    if (!item) return [];
    return getItemTransactions(item.id);
  }, [item, getItemTransactions]);

  // Aggregate stats
  const totalInQty = useMemo(() => {
    return transactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.quantity, 0);
  }, [transactions]);

  const totalOutQty = useMemo(() => {
    return transactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.quantity, 0);
  }, [transactions]);

  // Location segments
  const parsedLoc = useMemo(() => {
    if (!item) return { ruang: 'SPBI', rak: '01', baris: '01', tingkat: '01A' };
    const p = parseLocation(item.location);
    return {
      ruang: p.room || 'SPBI',
      rak: p.rack || '01',
      baris: p.row || '01',
      tingkat: p.level || '01A'
    };
  }, [item]);

  // Copied feedback
  const [copied, setCopied] = useState(false);

  // Mutasi Modal State
  const [isMutateModalOpen, setIsMutateModalOpen] = useState(false);
  const [mutateType, setMutateType] = useState<TransactionType>('OUT');
  const [mutateQty, setMutateQty] = useState<number>(0);
  const [mutateDocRef, setMutateDocRef] = useState<string>('');
  const [mutatePic, setMutatePic] = useState<string>('');
  const [mutateNotes, setMutateNotes] = useState<string>('');
  const [mutateDate, setMutateDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [mutateHour, setMutateHour] = useState<string>(() => String(new Date().getHours()).padStart(2, '0'));
  const [mutateMinute, setMutateMinute] = useState<string>(() => String(new Date().getMinutes()).padStart(2, '0'));
  const [mutateError, setMutateError] = useState<string>('');
  const [isMutating, setIsMutating] = useState(false);

  // Edit Master Item Modal State
  const [isEditMasterOpen, setIsEditMasterOpen] = useState(false);
  const [masterMaterialNo, setMasterMaterialNo] = useState('');
  const [masterName, setMasterName] = useState('');
  const [masterSpec, setMasterSpec] = useState('');
  const [masterCategory, setMasterCategory] = useState('');
  const [masterUnit, setMasterUnit] = useState('');
  const [masterContract, setMasterContract] = useState<ContractType>('NON_FPA');
  const [masterLocation, setMasterLocation] = useState('');
  const [masterMinStock, setMasterMinStock] = useState<number>(0);
  const [masterMaxStock, setMasterMaxStock] = useState<number>(0);
  const [masterNotes, setMasterNotes] = useState('');
  const [masterError, setMasterError] = useState('');
  const [isSavingMaster, setIsSavingMaster] = useState(false);

  // Edit Transaction (Koreksi Mutasi) State
  const [isEditTxModalOpen, setIsEditTxModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<StockTransaction | null>(null);
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxHour, setEditTxHour] = useState('00');
  const [editTxMinute, setEditTxMinute] = useState('00');
  const [editTxDocRef, setEditTxDocRef] = useState('');
  const [editTxPic, setEditTxPic] = useState('');
  const [editTxQty, setEditTxQty] = useState<number>(0);
  const [editTxNotes, setEditTxNotes] = useState('');
  const [editTxError, setEditTxError] = useState('');
  const [isSavingEditTx, setIsSavingEditTx] = useState(false);

  // Delete Transaction Confirm State
  const [isDeleteTxConfirmOpen, setIsDeleteTxConfirmOpen] = useState(false);
  const [deletingTx, setDeletingTx] = useState<StockTransaction | null>(null);
  const [isDeletingTx, setIsDeletingTx] = useState(false);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string>('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(''), 3500);
  };

  const handleOpenEditMaster = () => {
    if (!item) return;
    if (!canManageMaster) {
      alert('Akses Dibatasi: Hanya Supervisor yang berwenang mengubah data master barang.');
      return;
    }
    setMasterMaterialNo(item.material_no);
    setMasterName(item.name);
    setMasterSpec(item.specification || '');
    setMasterCategory(item.category);
    setMasterUnit(item.unit);
    setMasterContract(item.contract_type);
    setMasterLocation(item.location);
    setMasterMinStock(item.min_stock);
    setMasterMaxStock(item.max_stock);
    setMasterNotes(item.notes || '');
    setMasterError('');
    setIsEditMasterOpen(true);
  };

  const handleSaveMaster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setMasterError('');

    const paddedNo = padTo18Digits(masterMaterialNo);
    if (!isValid18DigitMaterial(paddedNo)) {
      setMasterError('Nomor Material harus tepat 18 angka digit SAP.');
      return;
    }
    if (!masterName.trim()) {
      setMasterError('Nama barang wajib diisi.');
      return;
    }

    setIsSavingMaster(true);
    try {
      const res = await updateItem(item.id, {
        material_no: paddedNo,
        name: masterName.trim(),
        specification: masterSpec.trim(),
        category: masterCategory,
        unit: masterUnit,
        contract_type: masterContract,
        location: masterLocation,
        min_stock: Number(masterMinStock),
        max_stock: Number(masterMaxStock),
        notes: masterNotes.trim()
      });

      if (!res.success) {
        setMasterError(res.message);
        return;
      }

      setIsEditMasterOpen(false);
      showToast('Data master barang berhasil diperbarui!');
    } catch (err) {
      setMasterError(err instanceof Error ? err.message : 'Gagal memperbarui data barang.');
    } finally {
      setIsSavingMaster(false);
    }
  };

  const handleOpenEditTx = (tx: StockTransaction) => {
    setEditingTx(tx);
    const d = new Date(tx.timestamp);
    setEditTxDate(tx.timestamp.slice(0, 10));
    setEditTxHour(String(d.getHours()).padStart(2, '0'));
    setEditTxMinute(String(d.getMinutes()).padStart(2, '0'));
    setEditTxDocRef(tx.doc_ref);
    setEditTxPic(tx.pic_name);
    setEditTxQty(tx.quantity);
    setEditTxNotes(tx.notes || '');
    setEditTxError('');
    setIsEditTxModalOpen(true);
  };

  const handleSaveEditTx = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    setEditTxError('');

    if (editTxQty <= 0) {
      setEditTxError('Kuantitas mutasi harus lebih besar dari 0.');
      return;
    }
    if (!editTxDocRef.trim()) {
      setEditTxError('No. Dokumen Acuan (Reservation / PO) wajib diisi.');
      return;
    }
    if (!editTxPic.trim()) {
      setEditTxError('Nama PIC penerima / pengambil wajib diisi.');
      return;
    }

    setIsSavingEditTx(true);
    try {
      const [year, month, day] = editTxDate.split('-').map(Number);
      const combinedDate = new Date(year, (month || 1) - 1, day || 1, Number(editTxHour), Number(editTxMinute), 0);
      const combinedISO = combinedDate.toISOString();

      const res = await updateTransaction(editingTx.id, {
        quantity: Number(editTxQty),
        doc_ref: editTxDocRef.trim(),
        pic_name: editTxPic.trim(),
        notes: editTxNotes.trim(),
        timestamp: combinedISO
      });

      if (!res.success) {
        setEditTxError(res.message);
        return;
      }

      setIsEditTxModalOpen(false);
      showToast('Riwayat mutasi berhasil dikoreksi!');
    } catch (err) {
      setEditTxError(err instanceof Error ? err.message : 'Gagal mengoreksi riwayat transaksi.');
    } finally {
      setIsSavingEditTx(false);
    }
  };

  const handleOpenDeleteTx = (tx: StockTransaction) => {
    if (!canDeleteMutation) {
      alert('Akses Dibatasi: Hanya Supervisor yang berwenang menghapus riwayat mutasi.');
      return;
    }
    setDeletingTx(tx);
    setIsDeleteTxConfirmOpen(true);
  };

  const handleConfirmDeleteTx = async () => {
    if (!deletingTx) return;
    setIsDeletingTx(true);
    try {
      const res = await deleteTransaction(deletingTx.id);
      if (res.success) {
        setIsDeleteTxConfirmOpen(false);
        showToast(res.message);
      } else {
        alert(res.message);
      }
    } finally {
      setIsDeletingTx(false);
    }
  };

  // Set current time helper
  const handleSetCurrentTime = () => {
    const now = new Date();
    setMutateDate(now.toISOString().slice(0, 10));
    setMutateHour(String(now.getHours()).padStart(2, '0'));
    setMutateMinute(String(now.getMinutes()).padStart(2, '0'));
  };

  const handleCopyMaterialNo = () => {
    if (!item) return;
    navigator.clipboard.writeText(item.material_no);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenMutate = (type: TransactionType) => {
    setMutateType(type);
    setMutateQty(0);
    setMutateDocRef('');
    setMutatePic(currentUser?.name || 'Supervisor');
    setMutateNotes('');
    handleSetCurrentTime();
    setMutateError('');
    setIsMutateModalOpen(true);
  };

  const handleMutateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setMutateError('');

    if (mutateQty <= 0) {
      setMutateError('Kuantitas mutasi harus lebih besar dari 0.');
      return;
    }

    if (mutateType === 'OUT' && mutateQty > item.current_stock) {
      setMutateError(`Kuantitas mutasi keluar (${mutateQty} ${item.unit}) melebihi saldo fisik saat ini (${item.current_stock} ${item.unit}).`);
      return;
    }

    if (!mutateDocRef.trim()) {
      setMutateError('Reservation/PO number dokumen acuan wajib diisi.');
      return;
    }

    setIsMutating(true);
    try {
      // Build ISO timestamp from date, hour, minute
      const [year, month, day] = mutateDate.split('-').map(Number);
      const combinedDate = new Date(year, (month || 1) - 1, day || 1, Number(mutateHour), Number(mutateMinute), 0);
      const isoTimestamp = combinedDate.toISOString();

      const res = await addTransaction({
        item_id: item.id,
        type: mutateType,
        quantity: mutateQty,
        doc_ref: mutateDocRef.trim(),
        pic_name: mutatePic.trim() || 'Supervisor',
        notes: mutateNotes.trim(),
        customTimestamp: isoTimestamp
      });

      if (!res.success) {
        setMutateError(res.message);
        return;
      }

      setIsMutateModalOpen(false);
    } catch (err) {
      setMutateError(err instanceof Error ? err.message : 'Gagal mencatat mutasi.');
    } finally {
      setIsMutating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Unduh QR as high-res PNG (Matching Screenshot 1)
  const handleDownloadQr = () => {
    if (!item) return;
    const canvas = document.createElement('canvas');
    canvas.width = 440;
    canvas.height = 540;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Render QR Code onto temp canvas
    const binCardDirectUrl = typeof window !== 'undefined'
      ? `${window.location.origin}/bin-card/${item.material_no}`
      : item.material_no;

    const qrTemp = document.createElement('canvas');
    QRCode.toCanvas(
      qrTemp,
      binCardDirectUrl,
      {
        width: 380,
        margin: 1,
        color: { dark: '#000000', light: '#FFFFFF' }
      },
      (err) => {
        if (!err) {
          ctx.drawImage(qrTemp, 30, 30);
          ctx.fillStyle = '#0F172A';
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(item.material_no, canvas.width / 2, 450);

          ctx.fillStyle = '#64748B';
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('SCAN TO OPEN', canvas.width / 2, 485);

          const link = document.createElement('a');
          link.download = `QR_${item.material_no}.png`;
          link.href = canvas.toDataURL('image/png');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
    );
  };

  const handleExportExcel = () => {
    if (!item) return;

    const exportRows = transactions.map((t, idx) => ({
      No: idx + 1,
      'Waktu Transaksi (24 Jam)': formatDateTime24(t.timestamp),
      'Jenis Mutasi': t.type,
      'Kuantitas Masuk (IN)': t.type === 'IN' ? t.quantity : 0,
      'Kuantitas Keluar (OUT)': t.type === 'OUT' ? t.quantity : 0,
      'Saldo Akhir': t.balance_after,
      'Satuan': item.unit,
      'No. Dokumen Acuan': t.doc_ref,
      'PIC Penerima/Pengambil': t.pic_name,
      'Operator Sistem': `${t.operator_username} (${t.operator_group})`,
      'Keterangan': t.notes
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Kartu Stok');
    XLSX.writeFile(workbook, `BIN_CARD_${item.material_no}_${Date.now()}.xlsx`);
  };

  if (!item) {
    return (
      <div className="p-8 text-center bg-white border border-slate-200 rounded-3xl max-w-xl mx-auto my-12 shadow-xs">
        <Boxes className="w-12 h-12 text-slate-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-slate-800">Barang Tidak Ditemukan</h2>
        <p className="text-xs text-slate-500 mt-1">
          Nomor material atau ID "{id}" tidak terdaftar dalam sistem inventaris gudang.
        </p>
        <button
          onClick={() => navigate('/items')}
          className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
        >
          Kembali ke Master Barang
        </button>
      </div>
    );
  }

  const binCardDirectUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/bin-card/${item.material_no}` 
    : item.material_no;

  const isStockSafe = item.current_stock > item.min_stock;
  const isOutOfStock = item.current_stock <= 0;

  // Active transaction badge string
  const activeFormattedDate = `${mutateDate.split('-').reverse().join('/')} ${mutateHour}:${mutateMinute}`;

  return (
    <div className="space-y-6 pb-24 lg:pb-12 max-w-6xl mx-auto font-sans">
      {/* 1. TOP ACTION BAR (Matching Screenshot 1) */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={() => navigate('/items')}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition w-fit cursor-pointer shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Daftar</span>
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleOpenEditMaster}
            className={`flex items-center gap-1.5 px-4 py-2 border rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer ${
              canManageMaster
                ? 'bg-amber-50/80 hover:bg-amber-100 border-amber-400/80 text-amber-800'
                : 'bg-slate-100 hover:bg-slate-200 border-slate-300 text-slate-600'
            }`}
            title={canManageMaster ? 'Edit Data Master Barang' : 'Edit Barang: Khusus Supervisor'}
          >
            <Edit className="w-4 h-4 text-amber-600" />
            <span>Edit Barang</span>
            {!canManageMaster && <Lock className="w-3 h-3 text-slate-400 ml-0.5" />}
          </button>

          <button
            onClick={handleDownloadQr}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer"
          >
            <Download className="w-4 h-4 text-indigo-600" />
            <span>Unduh QR</span>
          </button>

          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-[#0B192C] hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-md shadow-slate-900/10 transition cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Kartu Barang</span>
          </button>
        </div>
      </div>

      {/* 2. HERO CARD (Matching Screenshot 1 Pixel-for-Pixel) */}
      <div className="rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden bg-gradient-to-r from-[#071329] via-[#0E285F] to-[#0A1838] border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          {/* Left Details */}
          <div className="space-y-3.5 flex-1 min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="inline-block px-3 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wider bg-[#059669]/25 text-[#34D399] border border-[#059669]/50 shadow-xs">
                KARTU BARANG DIGITAL (BIN CARD)
              </span>
              <span className="text-xs text-slate-300 font-medium">
                Gudang Utama Logistik
              </span>
            </div>

            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight uppercase leading-tight">
                {item.name}
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-mono mt-1 font-medium line-clamp-2">
                {item.specification || item.name}
              </p>
            </div>

            {/* Badges Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div 
                onClick={handleCopyMaterialNo}
                title="Klik untuk menyalin nomor material"
                className="bg-slate-900/90 border border-slate-700/80 px-3 py-1.5 rounded-lg text-emerald-400 font-mono font-black text-xs flex items-center gap-2 cursor-pointer hover:border-emerald-500 transition shadow-xs"
              >
                <span>{item.material_no}</span>
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400 hover:text-white" />}
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                <span>{item.contract_type === 'NON_FPA' ? 'Non-FPA (Reguler)' : 'FPA (Kontrak)'}</span>
              </div>

              <div className="bg-slate-800/80 border border-slate-700/80 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>{item.category || 'Umum'}</span>
              </div>

              <div className="border border-amber-500/60 bg-amber-500/10 text-amber-400 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span>{parsedLoc.ruang || 'SPBI'}</span>
              </div>
            </div>

            {/* Format 4 Tingkat Row */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-1">
                FORMAT 4 TINGKAT:
              </span>
              <span className="bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-slate-300">
                RUANG: <strong className="text-amber-400">{parsedLoc.ruang}</strong>
              </span>
              <span className="text-slate-500 font-bold">•</span>
              <span className="bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-slate-300">
                RAK: <strong className="text-amber-400">{parsedLoc.rak}</strong>
              </span>
              <span className="text-slate-500 font-bold">•</span>
              <span className="bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-slate-300">
                BARIS: <strong className="text-amber-400">{parsedLoc.baris}</strong>
              </span>
              <span className="text-slate-500 font-bold">•</span>
              <span className="bg-slate-900/80 border border-slate-700/80 px-2.5 py-1 rounded text-xs font-mono font-bold text-slate-300">
                TINGKAT: <strong className="text-amber-400">{parsedLoc.tingkat}</strong>
              </span>
            </div>
          </div>

          {/* Right: QR Code Card (Matching Screenshot 1) */}
          <div className="shrink-0 flex justify-center">
            <div className="bg-white p-3 sm:p-3.5 rounded-2xl shadow-xl flex flex-col items-center justify-center border border-white/20 w-40 sm:w-44">
              <QrCodeGenerator
                value={binCardDirectUrl}
                size={140}
                className="mx-auto"
              />
              <div className="font-mono font-black text-xs text-slate-900 mt-1 tracking-tight text-center">
                {item.material_no}
              </div>
              <div className="text-[9px] font-black tracking-widest text-slate-400 uppercase mt-0.5">
                SCAN TO OPEN
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. 4 KPI METRIC CARDS (Matching Screenshot 1) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: UNRESTRICTED STOCK with Green Border */}
        <div className={`bg-white rounded-2xl p-5 shadow-xs border-2 ${
          isOutOfStock ? 'border-rose-400' : !isStockSafe ? 'border-amber-400' : 'border-emerald-400'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              UNRESTRICTED STOCK
            </span>
            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md text-white ${
              isOutOfStock ? 'bg-rose-500' : !isStockSafe ? 'bg-amber-500' : 'bg-emerald-500'
            }`}>
              {isOutOfStock ? 'HABIS' : !isStockSafe ? 'KRITIS' : 'AMAN'}
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {item.current_stock}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-1.5">
              {item.unit}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            ROP (Reorder Point): {item.min_stock} {item.unit}
          </p>
        </div>

        {/* Card 2: TOTAL MASUK */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-1.5 text-emerald-600 mb-2">
            <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-600">
              TOTAL MASUK
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-black text-slate-900 font-mono">
              +{totalInQty}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-1.5">
              {item.unit}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Akumulasi penerimaan
          </p>
        </div>

        {/* Card 3: TOTAL KELUAR */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="flex items-center gap-1.5 text-rose-600 mb-2">
            <ArrowUpRight className="w-4 h-4 stroke-[3]" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600">
              TOTAL KELUAR
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-black text-slate-900 font-mono">
              -{totalOutQty}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-1.5">
              {item.unit}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Akumulasi pengeluaran
          </p>
        </div>

        {/* Card 4: FREKUENSI MUTASI */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs">
          <div className="mb-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
              FREKUENSI MUTASI
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-3xl font-black text-slate-900 font-mono">
              {transactions.length}
            </span>
            <span className="text-xs font-bold text-slate-500 ml-1.5">
              kali
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Aktivitas kartu barang
          </p>
        </div>
      </div>

      {/* 4. TOOLS STOCK TAKE / STO BANNER CARD (Matching Screenshot 1) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-[#1E3E8A] text-white flex items-center justify-center shrink-0 shadow-xs">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-extrabold text-slate-900 tracking-tight">
                TOOLS STOCK TAKE / STO (STOCK OPNAME)
              </h2>
              <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-0.5 rounded-md border border-slate-200">
                Belum pernah STO
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Fitur verifikasi stok fisik berkala untuk mendeteksi dan menyesuaikan selisih barang gudang.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate(`/stock-take?item=${item.id}`)}
          className="px-4 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold flex items-center gap-2 transition shadow-xs cursor-pointer shrink-0"
        >
          <ClipboardCheck className="w-4 h-4" />
          <span>Input Stock Take (STO)</span>
        </button>
      </div>

      {/* 5. AKSI MUTASI & VERIFIKASI LAPANGAN (Matching Screenshot 1) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        <span className="text-xs sm:text-sm font-extrabold text-slate-800">
          Aksi Mutasi & Verifikasi Lapangan:
        </span>

        <div className="flex flex-wrap items-center gap-2.5">
          {canStockTake && (
            <button
              onClick={() => navigate(`/stock-take?item=${item.id}`)}
              className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-blue-800 border border-blue-300 rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <ClipboardCheck className="w-4 h-4 text-blue-600" />
              <span>Stock Take (STO)</span>
            </button>
          )}

          {canMutateStock && (
            <>
              <button
                onClick={() => handleOpenMutate('IN')}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
                <span>+ Catat Barang Masuk (IN)</span>
              </button>

              <button
                onClick={() => handleOpenMutate('OUT')}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#EF4444] hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                <span>- Catat Barang Keluar (OUT)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 6. TABEL RIWAYAT KELUAR - MASUK (MUTASI KARTU BARANG) */}
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-600" />
            <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide text-slate-900">
              RIWAYAT KELUAR - MASUK (MUTASI KARTU BARANG)
            </h2>
          </div>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600" />
            <span>Ekspor Excel ({transactions.length})</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">WAKTU TRANSAKSI</th>
                <th className="py-3 px-4">NO. DOKUMEN ACUAN</th>
                <th className="py-3 px-4 text-center">JENIS</th>
                <th className="py-3 px-4 text-right">MASUK (IN)</th>
                <th className="py-3 px-4 text-right">KELUAR (OUT)</th>
                <th className="py-3 px-4 text-right">SALDO AKHIR</th>
                <th className="py-3 px-4">PIC & OPERATOR</th>
                <th className="py-3 px-4">KETERANGAN</th>
                <th className="py-3 px-4 text-center">AKSI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 font-sans">
                    Belum ada riwayat mutasi untuk barang ini.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-800 font-semibold">
                      {formatDateTime24(tx.timestamp)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-blue-600 font-bold">
                      {tx.doc_ref}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        tx.type === 'IN'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : tx.type === 'OUT'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {tx.type}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right text-emerald-600 font-bold whitespace-nowrap">
                      {tx.type === 'IN' ? `+${tx.quantity} ${item.unit}` : '-'}
                    </td>

                    <td className="py-3 px-4 text-right text-rose-600 font-bold whitespace-nowrap">
                      {tx.type === 'OUT' ? `-${tx.quantity} ${item.unit}` : '-'}
                    </td>

                    <td className="py-3 px-4 text-right font-black text-slate-900 whitespace-nowrap text-xs">
                      {tx.balance_after} <span className="text-[10px] text-slate-500 font-normal">{item.unit}</span>
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap text-slate-800 font-sans">
                      <div>{tx.pic_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Op: {tx.operator_username}</div>
                    </td>

                    <td className="py-3 px-4 max-w-xs truncate text-slate-500 font-sans">
                      {tx.notes || '-'}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        {canEditMutation && (
                          <button
                            onClick={() => handleOpenEditTx(tx)}
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition cursor-pointer"
                            title="Edit Riwayat Mutasi (Koreksi Tanggal/Jam/PIC/No Ref)"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDeleteMutation ? (
                          <button
                            onClick={() => handleOpenDeleteTx(tx)}
                            className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                            title="Hapus Riwayat Mutasi (Khusus Supervisor)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span 
                            className="p-1.5 text-slate-300 select-none cursor-not-allowed" 
                            title="Penghapusan riwayat mutasi dibatasi khusus untuk Supervisor"
                          >
                            <Lock className="w-3.5 h-3.5 text-slate-300" />
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 7. MUTATION MODAL (Matching Screenshot 2 & 3 Pixel-for-Pixel) */}
      {isMutateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 my-8">
            
            {/* Dark Navy Header with colored square icon badge */}
            <div className="bg-[#0B192C] text-white p-4 px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 font-bold ${
                  mutateType === 'IN' ? 'bg-[#10B981]' : 'bg-[#EF4444]'
                }`}>
                  {mutateType === 'IN' ? (
                    <ArrowDownLeft className="w-5 h-5 stroke-[3]" />
                  ) : (
                    <ArrowUpRight className="w-5 h-5 stroke-[3]" />
                  )}
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-white leading-tight">
                    Catat Mutasi {mutateType === 'IN' ? 'Masuk (IN)' : 'Keluar (OUT)'}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Material Number: <span className="text-amber-400 font-bold">{item.material_no}</span>
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsMutateModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-header with item name & location */}
            <div className="bg-slate-50 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs">
              <span className="font-extrabold text-slate-900 uppercase truncate pr-3">
                {item.name}
              </span>
              <span className="text-slate-500 shrink-0">
                Lokasi: <strong className="text-slate-900">{parsedLoc.ruang || 'SPBI'}</strong>
              </span>
            </div>

            {/* Form */}
            <form onSubmit={handleMutateSubmit} className="p-6 space-y-4">
              {mutateError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{mutateError}</span>
                </div>
              )}

              {/* JENIS MUTASI */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1.5">
                  JENIS MUTASI:
                </label>
                <div className="p-1 bg-[#F1F5F9] rounded-xl grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMutateType('IN')}
                    className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      mutateType === 'IN'
                        ? 'bg-[#10B981] text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <ArrowDownLeft className="w-4 h-4 stroke-[3]" />
                    <span>Masuk (IN)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMutateType('OUT')}
                    className={`py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      mutateType === 'OUT'
                        ? 'bg-[#EF4444] text-white shadow-xs'
                        : 'text-slate-600 hover:bg-slate-200/60'
                    }`}
                  >
                    <ArrowUpRight className="w-4 h-4 stroke-[3]" />
                    <span>Keluar (OUT)</span>
                  </button>
                </div>
              </div>

              {/* KUANTITAS BOX */}
              <div className="border border-slate-200/90 rounded-2xl p-4 bg-white space-y-3 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                    # KUANTITAS ({item.unit}):
                  </span>
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setMutateQty(0)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold border border-slate-200 cursor-pointer"
                    >
                      Reset (0)
                    </button>
                    {[1, 5, 10, 25, 50].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setMutateQty((prev) => Math.max(0, prev + num))}
                        className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-bold border border-slate-200 cursor-pointer"
                      >
                        +{num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Stepper */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMutateQty((prev) => Math.max(0, prev - 1))}
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-black text-xl flex items-center justify-center cursor-pointer transition"
                  >
                    -
                  </button>
                  <NumericQuantityInput
                    value={mutateQty}
                    onChange={setMutateQty}
                    min={0}
                    className="flex-1 h-12 text-center font-black text-2xl text-slate-900 border border-slate-200 rounded-xl focus:outline-none focus:border-blue-500 bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setMutateQty((prev) => prev + 1)}
                    className="w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-black text-xl flex items-center justify-center cursor-pointer transition"
                  >
                    +
                  </button>
                </div>

                {/* Stock 3-column summary */}
                <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-center">
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Unrestricted Stock</div>
                    <div className="font-extrabold text-sm text-slate-900 font-mono mt-0.5">
                      {item.current_stock} {item.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Mutasi</div>
                    <div className={`font-extrabold text-sm font-mono mt-0.5 ${
                      mutateType === 'IN' ? 'text-emerald-600' : 'text-rose-600'
                    }`}>
                      {mutateType === 'IN' ? `+${mutateQty}` : `-${mutateQty}`} {item.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500 font-medium">Saldo Akhir</div>
                    <div className="font-black text-sm text-blue-900 font-mono mt-0.5">
                      {mutateType === 'IN' ? item.current_stock + mutateQty : Math.max(0, item.current_stock - mutateQty)} {item.unit}
                    </div>
                  </div>
                </div>
              </div>

              {/* Petugas & Reservation/PO Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-black uppercase tracking-wider text-slate-800 flex items-center gap-1">
                      <span>Petugas (PIC)</span>
                    </label>
                    <span className="bg-slate-100 text-slate-500 text-[10px] font-bold px-2 py-0.2 rounded border border-slate-200 flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" /> Terkunci
                    </span>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 flex items-center justify-between">
                    <span>{currentUser?.name || currentUser?.role || 'Supervisor'}</span>
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Reservation/PO number <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={mutateDocRef}
                    onChange={(e) => setMutateDocRef(e.target.value)}
                    placeholder="Contoh: PO-9912 / SJ-102"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-medium"
                    required
                  />
                </div>
              </div>

              {/* Waktu Transaksi (Format 24 Jam) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-800">
                    Waktu Transaksi <span className="text-rose-500">*</span>
                  </label>
                  <span className="bg-blue-50 text-blue-700 border border-blue-200 rounded px-2.5 py-0.5 text-xs font-mono font-bold">
                    {activeFormattedDate}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={mutateDate}
                      onChange={(e) => setMutateDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-400 mr-1" />
                    <select
                      value={mutateHour}
                      onChange={(e) => setMutateHour(e.target.value)}
                      className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const h = String(i).padStart(2, '0');
                        return <option key={h} value={h}>{h}</option>;
                      })}
                    </select>
                    <span className="font-bold text-slate-400">:</span>
                    <select
                      value={mutateMinute}
                      onChange={(e) => setMutateMinute(e.target.value)}
                      className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                        const m = String(i).padStart(2, '0');
                        return <option key={m} value={m}>{m}</option>;
                      })}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={handleSetCurrentTime}
                    className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-500" />
                    <span>Sekarang</span>
                  </button>
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Keterangan:
                </label>
                <textarea
                  rows={2}
                  value={mutateNotes}
                  onChange={(e) => setMutateNotes(e.target.value)}
                  placeholder="Catatan keperluan transaksi..."
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 resize-none font-medium"
                />
              </div>

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMutateModalOpen(false)}
                  className="px-5 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className={`px-6 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm cursor-pointer flex items-center gap-2 ${
                    mutateType === 'IN'
                      ? 'bg-[#10B981] hover:bg-emerald-600'
                      : 'bg-[#EF4444] hover:bg-rose-600'
                  }`}
                >
                  <Check className="w-4 h-4 stroke-[3]" />
                  <span>
                    {isMutating
                      ? 'Menyimpan...'
                      : mutateType === 'IN'
                      ? 'Simpan Mutasi Masuk (IN)'
                      : 'Simpan Mutasi Keluar (OUT)'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. MODAL: EDIT DATA MASTER BARANG (Khusus Supervisor) */}
      {isEditMasterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden border border-slate-200 my-8">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-300">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-tight">
                    Edit Data Master Barang
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Perbarui informasi spesifikasi, nomor material, rak lokasi, atau stok minimum.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditMasterOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveMaster} className="p-4 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto font-sans">
              {masterError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{masterError}</span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Nomor Material (18-Digit SAP) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={masterMaterialNo}
                  onChange={(e) => setMasterMaterialNo(e.target.value.replace(/\D/g, '').slice(0, 18))}
                  onBlur={() => masterMaterialNo && setMasterMaterialNo(padTo18Digits(masterMaterialNo))}
                  placeholder="Contoh: 031007000000000235"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm font-bold text-slate-900 tracking-wider focus:outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Nama Barang / Material Deskripsi <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={masterName}
                  onChange={(e) => setMasterName(e.target.value)}
                  placeholder="Contoh: Ball Valve 2 Inch ANSI 150# Flanged SS316"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 font-semibold focus:outline-none focus:bg-white focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Spesifikasi Teknis / Part Number / Ukuran
                </label>
                <textarea
                  rows={2}
                  value={masterSpec}
                  onChange={(e) => setMasterSpec(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Kategori <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="bincard-cat-list"
                    value={masterCategory}
                    onChange={(e) => setMasterCategory(e.target.value)}
                    placeholder="Kategori barang..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-semibold"
                    required
                  />
                  <datalist id="bincard-cat-list">
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Satuan / Unit <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    list="bincard-unit-list"
                    value={masterUnit}
                    onChange={(e) => setMasterUnit(e.target.value.toUpperCase())}
                    placeholder="Contoh: PCS, SET, UNIT..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-mono font-bold uppercase"
                    required
                  />
                  <datalist id="bincard-unit-list">
                    {STANDARD_UNITS.map(u => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Jenis Kontrak <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={masterContract}
                    onChange={(e) => setMasterContract(e.target.value as ContractType)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none font-bold cursor-pointer"
                  >
                    <option value="FPA">FPA (Fixed Price)</option>
                    <option value="NON_FPA">NON-FPA</option>
                  </select>
                </div>
              </div>

              <LocationPicker
                value={masterLocation}
                onChange={setMasterLocation}
              />

              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-amber-800 mb-1">
                    Stok Minimum (Safety Stock) <span className="text-rose-500">*</span>
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={masterMinStock}
                    onChange={setMasterMinStock}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-sm text-slate-900 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-wider text-slate-600 mb-1">
                    Kapasitas Maksimum
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={masterMaxStock}
                    onChange={setMasterMaxStock}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg font-mono text-sm text-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Catatan Tambahan
                </label>
                <input
                  type="text"
                  value={masterNotes}
                  onChange={(e) => setMasterNotes(e.target.value)}
                  placeholder="Keterangan vendor, rak khusus, atau instruksi handling..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditMasterOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingMaster}
                  className="px-5 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingMaster ? 'Menyimpan...' : 'Simpan Perubahan Barang'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: EDIT RIWAYAT MUTASI (KOREKSI TANGGAL / JAM / PIC / REF) */}
      {isEditTxModalOpen && editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200 my-8">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white flex items-center justify-between border-b border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
                  <Edit className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold tracking-tight">
                    Koreksi Riwayat Mutasi ({editingTx.type})
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Koreksi tanggal, jam transaksi, PIC, nomor referensi, atau kuantitas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsEditTxModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTx} className="p-4 sm:p-6 space-y-4 font-sans">
              {editTxError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{editTxError}</span>
                </div>
              )}

              {/* Tanggal & Jam */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Waktu Transaksi <span className="text-rose-500">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="date"
                      value={editTxDate}
                      onChange={(e) => setEditTxDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-400 mr-1" />
                    <select
                      value={editTxHour}
                      onChange={(e) => setEditTxHour(e.target.value)}
                      className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      {Array.from({ length: 24 }).map((_, i) => {
                        const h = String(i).padStart(2, '0');
                        return <option key={h} value={h}>{h}</option>;
                      })}
                    </select>
                    <span className="font-bold text-slate-400">:</span>
                    <select
                      value={editTxMinute}
                      onChange={(e) => setEditTxMinute(e.target.value)}
                      className="bg-transparent font-mono font-bold text-slate-800 focus:outline-none cursor-pointer"
                    >
                      {Array.from({ length: 60 }).map((_, i) => {
                        const m = String(i).padStart(2, '0');
                        return <option key={m} value={m}>{m}</option>;
                      })}
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date();
                      setEditTxDate(now.toISOString().slice(0, 10));
                      setEditTxHour(String(now.getHours()).padStart(2, '0'));
                      setEditTxMinute(String(now.getMinutes()).padStart(2, '0'));
                    }}
                    className="px-2.5 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer shrink-0"
                    title="Setel Waktu Sekarang"
                  >
                    <RotateCcw className="w-3 h-3 text-slate-600" />
                  </button>
                </div>
              </div>

              {/* No Dokumen Acuan */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  No. Dokumen Acuan (Reservation / PO / Surat Jalan) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTxDocRef}
                  onChange={(e) => setEditTxDocRef(e.target.value)}
                  placeholder="Contoh: RES-892182 atau PO-2026-09"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* PIC & Qty */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    PIC Pengambil / Penerima <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editTxPic}
                    onChange={(e) => setEditTxPic(e.target.value)}
                    placeholder="Nama PIC"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                    Kuantitas Mutasi ({item.unit}) <span className="text-rose-500">*</span>
                  </label>
                  <NumericQuantityInput
                    min={0}
                    value={editTxQty}
                    onChange={setEditTxQty}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Keterangan */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-slate-800 mb-1">
                  Keterangan / Alasan Koreksi:
                </label>
                <textarea
                  rows={2}
                  value={editTxNotes}
                  onChange={(e) => setEditTxNotes(e.target.value)}
                  placeholder="Contoh: Koreksi input salah tanggal oleh operator shift..."
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:border-blue-500 resize-none font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditTxModalOpen(false)}
                  className="px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEditTx}
                  className="px-5 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingEditTx ? 'Menyimpan...' : 'Simpan Koreksi Transaksi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. MODAL: KONFIRMASI HAPUS RIWAYAT MUTASI (Khusus Supervisor) */}
      {isDeleteTxConfirmOpen && deletingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200 p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h3 className="text-base font-extrabold text-slate-900">
                Hapus Riwayat Mutasi?
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Catatan mutasi <strong>{deletingTx.doc_ref}</strong> ({deletingTx.type} sebesar {deletingTx.quantity} {item.unit}) akan dihapus secara permanen.
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1 font-mono">
              <div className="flex justify-between text-slate-600">
                <span>Waktu:</span>
                <span className="font-semibold text-slate-900">{formatDateTime24(deletingTx.timestamp)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Jenis:</span>
                <span className="font-bold text-slate-900">{deletingTx.type}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>PIC:</span>
                <span className="font-semibold text-slate-900">{deletingTx.pic_name}</span>
              </div>
              <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
                <span>Penyesuaian Saldo:</span>
                <span className="font-extrabold text-amber-700">
                  {deletingTx.type === 'IN' ? `-${deletingTx.quantity} ${item.unit}` : `+${deletingTx.quantity} ${item.unit}`}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteTxConfirmOpen(false)}
                className="flex-1 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteTx}
                disabled={isDeletingTx}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{isDeletingTx ? 'Menghapus...' : 'Ya, Hapus'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0B192C] text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 border border-slate-700 text-xs font-semibold animate-in slide-in-from-bottom-3">
          <Check className="w-4 h-4 text-emerald-400 stroke-[3]" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};
