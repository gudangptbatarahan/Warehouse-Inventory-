import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  CheckCircle2, 
  RefreshCw,
  FileX,
  Sparkles,
  Search,
  CheckSquare,
  Square,
  AlertTriangle,
  ArrowRight,
  Trash2,
  Info,
  FileText
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { ContractType, ProcurementStatus } from '../types/inventory';
import { padTo18Digits, isValid18DigitMaterial, CATEGORIES } from '../utils/materialUtils';

interface ParsedImportRow {
  id: string;
  material_no: string;
  original_raw_code: string;
  name: string;
  specification: string;
  description: string;
  category: string;
  unit: string;
  contract_type: ContractType;
  location: string;
  current_stock: number;
  initial_stock: number;
  min_stock: number;
  max_stock: number;
  notes: string;
  isExisting: boolean;
  isValid: boolean;
  isDuplicate: boolean;
  isEliminated: boolean;
  eliminationReason?: string;
  validationError?: string;
  isSelected: boolean;
}

export const ImportExportPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, importItemsBatch } = useInventory();
  const { canImportExport } = useAuth();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importSummary, setImportSummary] = useState<{ imported: number; updated: number; failed: number } | null>(null);

  // Tab & search filtering
  const [activeTab, setActiveTab] = useState<'ALL' | 'READY' | 'ELIMINATED' | 'NEW' | 'UPDATE' | 'INVALID'>('ALL');
  const [filterSearch, setFilterSearch] = useState<string>('');

  const [isDragging, setIsDragging] = useState<boolean>(false);

  const detectColumn = (headers: string[], candidates: string[]): string | undefined => {
    // 1. Exact clean match first (case, underscore, space insensitive)
    for (const c of candidates) {
      const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      const found = headers.find(h => h.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanC);
      if (found) return found;
    }
    // 2. Substring match
    for (const c of candidates) {
      const cleanC = c.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanC.length < 3) continue;
      const found = headers.find(h => {
        const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
        return cleanH.includes(cleanC) || cleanC.includes(cleanH);
      });
      if (found) return found;
    }
    return undefined;
  };

  const processFile = (file: File) => {
    setFileName(file.name);
    setIsParsing(true);
    setImportSummary(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const wb = XLSX.read(buffer, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];

        const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
        if (!rawData || rawData.length === 0) {
          alert('File Excel kosong atau tidak memiliki baris data.');
          setIsParsing(false);
          return;
        }

        const headers = Object.keys(rawData[0]);

        // Enhanced candidates mapping strictly to the user template columns:
        // material_code, name, category, description, initial_stock, location, unit, min_stock
        let colMaterial = detectColumn(headers, [
          'material_code', 'materialcode', 'kodematerial', 'material_no', 'materialno', 
          'materialnumber', 'sapcode', 'sapnumber', 'partnumber', 'kode', 'itemcode', 
          'itemno', 'nomormaterial', 'partno', 'item', 'code'
        ]);

        let colName = detectColumn(headers, [
          'name', 'namabarang', 'itemname', 'nama', 'barang', 'shorttext', 
          'materialname', 'title', 'uraian'
        ]);

        const colSpec = detectColumn(headers, [
          'description', 'spesifikasi', 'specification', 'deskripsi', 'spek', 'spec', 
          'deskripsibarang', 'itemdescription', 'materialdescription', 'longtext', 'detail', 'spesifikasi barang'
        ]);

        const colCategory = detectColumn(headers, [
          'category', 'kategori', 'kelompok', 'group', 'jeniskategori', 'tipe'
        ]);

        const colStock = detectColumn(headers, [
          'initial_stock', 'initialstock', 'stokawal', 'saldoawal', 'stok', 'stock', 
          'current_stock', 'currentstock', 'qty', 'jumlah', 'saldo', 'unrestricted', 
          'unrestrictedstock', 'saldostok', 'total'
        ]);

        const colLocation = detectColumn(headers, [
          'location', 'lokasi', 'rak', 'bin', 'posisi', 'storagebin', 'sloc', 'storagelocation', 'tempat'
        ]);

        const colUnit = detectColumn(headers, [
          'unit', 'satuan', 'uom', 'sat', 'unitofmeasure', 'satuanbarang'
        ]);

        const colMin = detectColumn(headers, [
          'min_stock', 'minstock', 'safetystock', 'minimum', 'min', 'rop', 'stokmin', 'stokminimum'
        ]);

        const colMax = detectColumn(headers, [
          'max_stock', 'maxstock', 'maksimum', 'max', 'stokmax', 'stokmaksimum', 'kapasitasmaks'
        ]);

        const colContract = detectColumn(headers, [
          'contract_type', 'contract', 'kontrak', 'tipekontrak', 'contracttype', 'jenis', 'jeniskontrak'
        ]);

        const colNotes = detectColumn(headers, [
          'keterangan_evaluator', 'catatan_evaluator', 'evaluator_notes', 'keteranganpr', 'catatanpr'
        ]);

        // Heuristic Fallbacks if columns were not explicitly named
        if (!colMaterial) {
          colMaterial = headers.find(h => {
            const val = String(rawData[0][h] || '').trim();
            return /\d{4,}/.test(val);
          }) || headers[0];
        }

        if (!colName) {
          colName = headers.find(h => {
            if (h === colMaterial || h === colSpec) return false;
            const val = String(rawData[0][h] || '').trim();
            return val.length > 2 && isNaN(Number(val));
          }) || headers[1] || headers[0];
        }

        // Fast O(1) set for existing items and duplicate checking
        const existingCodesSet = new Set(items.map(i => i.material_no));
        const seenCodes = new Set<string>();

        const results: ParsedImportRow[] = rawData.map((row, idx) => {
          const rawCode = String(row[colMaterial || ''] || '').trim();
          const paddedMaterialNo = padTo18Digits(rawCode);

          const name = String(row[colName || ''] || `Item #${idx + 1}`).trim();
          const spec = String(row[colSpec || ''] || '').trim();
          const cat = String(row[colCategory || ''] || CATEGORIES[0]).trim();
          const u = String(row[colUnit || ''] || 'PCS').toUpperCase().trim();
          const rawContract = String(row[colContract || ''] || 'NON_FPA').toUpperCase().trim();
          const contractType: ContractType = (rawContract.includes('FPA') && !rawContract.includes('NON')) ? 'FPA' : 'NON_FPA';
          const loc = String(row[colLocation || ''] || '1.01.01.01A').trim();
          const curStock = Number(row[colStock || '0']) || 0;
          const minStock = Number(row[colMin || '5']) || 5;
          const maxStock = Number(row[colMax || String(Math.max(curStock * 2, minStock * 3, 20))]) || 50;
          const rawNotes = String(row[colNotes || ''] || '').trim();
          const notesVal = (/^\d+$/.test(rawNotes) || rawNotes === '-' || rawNotes === 'Belum ada keterangan') ? '' : rawNotes;

          const isDuplicate = Boolean(paddedMaterialNo && seenCodes.has(paddedMaterialNo));
          let isEliminated = false;
          let eliminationReason: string | undefined = undefined;

          if (isDuplicate) {
            isEliminated = true;
            eliminationReason = 'Duplikat Material Number (Otomatis Dieliminasi)';
          } else if (paddedMaterialNo && paddedMaterialNo.length === 18) {
            seenCodes.add(paddedMaterialNo);
          }

          const isExisting = existingCodesSet.has(paddedMaterialNo);
          const isValid = isValid18DigitMaterial(paddedMaterialNo) && name.length > 0;

          let validationError: string | undefined = undefined;
          if (!paddedMaterialNo || paddedMaterialNo.length !== 18) {
            validationError = 'Nomor material tidak mencapai 18 digit.';
          } else if (!name) {
            validationError = 'Nama barang kosong.';
          }

          // By default, select valid rows that are NOT eliminated
          const isSelected = isValid && !isEliminated;

          return {
            id: `row-${idx}-${paddedMaterialNo || idx}`,
            material_no: paddedMaterialNo,
            original_raw_code: rawCode,
            name,
            specification: spec,
            description: spec,
            category: cat,
            unit: u,
            contract_type: contractType,
            location: loc,
            current_stock: curStock,
            initial_stock: curStock,
            min_stock: minStock,
            max_stock: maxStock,
            notes: notesVal,
            isExisting,
            isValid,
            isDuplicate,
            isEliminated,
            eliminationReason,
            validationError,
            isSelected
          };
        });

        setParsedRows(results);
      } catch (err) {
        console.error('Failed to parse spreadsheet:', err);
        alert('Gagal membaca file spreadsheet. Pastikan format file adalah .xlsx, .xls, atau .csv');
      } finally {
        setIsParsing(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  // Toggle single row selection
  const handleToggleRow = (rowId: string) => {
    setParsedRows(prev => prev.map(r => {
      if (r.id === rowId) {
        return { ...r, isSelected: !r.isSelected };
      }
      return r;
    }));
  };

  // Toggle select all in currently displayed filter
  const handleToggleSelectAll = (select: boolean) => {
    const targetIds = new Set(displayedRows.filter(r => !r.isEliminated && r.isValid).map(r => r.id));
    setParsedRows(prev => prev.map(r => {
      if (targetIds.has(r.id)) {
        return { ...r, isSelected: select };
      }
      return r;
    }));
  };

  // Execute import on SELECTED, VALID, NON-ELIMINATED rows
  const handleExecuteImport = async () => {
    const selectedRows = parsedRows.filter(r => r.isSelected && !r.isEliminated && r.isValid);
    if (selectedRows.length === 0) {
      alert('Tidak ada baris data terpilih yang siap untuk diimpor.');
      return;
    }

    setIsImporting(true);
    try {
      const itemsToImport = selectedRows.map(r => ({
        material_no: r.material_no,
        name: r.name,
        specification: r.specification || r.description || '',
        description: r.specification || r.description || '',
        category: r.category,
        unit: r.unit,
        contract_type: r.contract_type,
        location: r.location,
        current_stock: r.current_stock,
        initial_stock: r.initial_stock ?? r.current_stock,
        min_stock: r.min_stock,
        max_stock: r.max_stock,
        procurement_status: (r.current_stock <= r.min_stock ? 'MINIMUM' : 'NORMAL') as ProcurementStatus,
        notes: r.notes
      }));

      const summary = await importItemsBatch(itemsToImport);
      setImportSummary(summary);
      setParsedRows([]);
      setFileName('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch {
      alert('Terjadi kesalahan saat memproses impor data.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = (format: 'xlsx' | 'csv' = 'xlsx') => {
    // Exact schema requested:
    // Kolom: material_code, name, category, description, initial_stock, location, unit, min_stock
    const templateData = [
      {
        material_code: '050609000000000520',
        name: 'PIPE, PLASTIC',
        category: 'Mekanik & Sparepart',
        description: 'High Density Polyethylene / PVC Class AW Heavy Duty (OD 50mm, PN 16)',
        initial_stock: 10,
        location: '7.00.00.00',
        unit: 'MTR',
        min_stock: 5
      },
      {
        material_code: '310070000000000236',
        name: 'Deep Groove Ball Bearing 6309 2RS C3 SKF',
        category: 'Mekanikal & Valve',
        description: 'Bore 45mm, OD 100mm, Width 25mm, Rubber Sealed C3 Clearance',
        initial_stock: 25,
        location: '1.02.01.03A',
        unit: 'PCS',
        min_stock: 8
      },
      {
        material_code: '320010000000000105',
        name: 'Gasket Spiral Wound 3 Inch 150#',
        category: 'Consumable & Sealing',
        description: 'SS316L Inner/Outer Ring with Flexible Graphite Filler ASME B16.20',
        initial_stock: 50,
        location: '2.01.04.02B',
        unit: 'PCS',
        min_stock: 15
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Master');
    if (format === 'csv') {
      XLSX.writeFile(wb, 'TEMPLATE_MASTER_BARANG.csv', { bookType: 'csv' });
    } else {
      XLSX.writeFile(wb, 'TEMPLATE_MASTER_BARANG.xlsx');
    }
  };

  // Metrics computation
  const totalCount = parsedRows.length;
  const eliminatedCount = useMemo(() => parsedRows.filter(r => r.isEliminated).length, [parsedRows]);
  const readyCount = useMemo(() => parsedRows.filter(r => r.isValid && !r.isEliminated).length, [parsedRows]);
  const selectedCount = useMemo(() => parsedRows.filter(r => r.isSelected && !r.isEliminated && r.isValid).length, [parsedRows]);
  const newCount = useMemo(() => parsedRows.filter(r => r.isValid && !r.isEliminated && !r.isExisting).length, [parsedRows]);
  const updateCount = useMemo(() => parsedRows.filter(r => r.isValid && !r.isEliminated && r.isExisting).length, [parsedRows]);
  const invalidCount = useMemo(() => parsedRows.filter(r => !r.isValid).length, [parsedRows]);

  // Filtered rows for the table display
  const displayedRows = useMemo(() => {
    return parsedRows.filter(r => {
      // Tab filter
      if (activeTab === 'READY' && (!r.isValid || r.isEliminated)) return false;
      if (activeTab === 'ELIMINATED' && !r.isEliminated) return false;
      if (activeTab === 'NEW' && (!r.isValid || r.isEliminated || r.isExisting)) return false;
      if (activeTab === 'UPDATE' && (!r.isValid || r.isEliminated || !r.isExisting)) return false;
      if (activeTab === 'INVALID' && r.isValid) return false;

      // Text search filter
      if (filterSearch.trim()) {
        const q = filterSearch.toLowerCase().trim();
        const matches = 
          r.material_no.includes(q) ||
          r.original_raw_code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.location.toLowerCase().includes(q);
        if (!matches) return false;
      }

      return true;
    });
  }, [parsedRows, activeTab, filterSearch]);

  const areAllDisplayedSelected = useMemo(() => {
    const validDisplayed = displayedRows.filter(r => r.isValid && !r.isEliminated);
    if (validDisplayed.length === 0) return false;
    return validDisplayed.every(r => r.isSelected);
  }, [displayedRows]);

  return (
    <div className="space-y-6 pb-24 lg:pb-12 max-w-6xl mx-auto font-sans">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            Import Master Data (Excel / CSV)
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Dukungan pemetaan fleksibel, auto-padding 18 digit SAP, seleksi dokumen, dan eliminasi otomatis data duplikat.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadTemplate('xlsx')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer w-fit"
            title="Download Template Format Excel (.xlsx)"
          >
            <Download className="w-4 h-4 text-emerald-700" />
            <span>Unduh Template Excel (.xlsx)</span>
          </button>
          <button
            onClick={() => handleDownloadTemplate('csv')}
            className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition shadow-2xs cursor-pointer w-fit"
            title="Download Template Format CSV (.csv)"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Unduh Template CSV (.csv)</span>
          </button>
        </div>
      </div>

      {/* Template Format Standard Info Banner */}
      <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="space-y-1">
          <div className="font-extrabold text-blue-950 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>Format Kolom Template Master Barang yang Diterima Sistem:</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {['material_code', 'name', 'category', 'description', 'initial_stock', 'location', 'unit', 'min_stock'].map((col) => (
              <span key={col} className="px-2 py-0.5 bg-white text-blue-800 font-mono font-bold rounded-md border border-blue-200 text-[11px] shadow-2xs">
                {col}
              </span>
            ))}
          </div>
        </div>
        <div className="text-blue-700 text-[11px] leading-relaxed shrink-0">
          Kolom <strong className="font-mono text-blue-900">description</strong> otomatis disimpan ke spesifikasi teknis barang.
        </div>
      </div>

      {/* Upload Dropzone */}
      <div 
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const droppedFile = e.dataTransfer.files?.[0];
          if (droppedFile) {
            processFile(droppedFile);
          }
        }}
        className={`bg-white border-2 border-dashed rounded-3xl p-8 sm:p-10 text-center transition cursor-pointer relative shadow-xs ${
          isDragging ? 'border-blue-500 bg-blue-50/50 scale-[1.01]' : 'border-slate-300 hover:border-blue-400'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx, .xls, .csv"
          onChange={handleFileUpload}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 border transition ${
          isDragging ? 'bg-blue-600 text-white border-blue-600 scale-110' : 'bg-blue-50 text-blue-600 border-blue-100'
        }`}>
          <Upload className="w-7 h-7" />
        </div>
        <h3 className="text-base font-extrabold text-slate-900 mb-1">
          {fileName ? fileName : isDragging ? 'Lepaskan File untuk Memproses' : 'Pilih atau Seret (Drop) Dokumen Excel / CSV ke Sini'}
        </h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Mendukung format .xlsx, .xls, dan .csv. Pembacaan instan dalam hitungan milidetik, dengan pemetaan otomatis 18 digit SAP dan eliminasi duplikat.
        </p>
        {isParsing && (
          <div className="mt-3 text-xs font-bold text-blue-600 animate-pulse flex items-center justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
            <span>Sedang membaca dan menganalisis baris spreadsheet secara instan...</span>
          </div>
        )}
      </div>

      {/* Panduan Menyiapkan Data Asli Pabrik */}
      <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-3xl space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-extrabold text-xs sm:text-sm">
          <FileText className="w-4 h-4 text-blue-600" />
          <span>Panduan Format File Data Asli (Excel / CSV)</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
          <div className="p-3 bg-white rounded-2xl border border-slate-200/80 space-y-1">
            <span className="font-bold text-slate-900 block text-[11px] text-blue-700">1. Kolom Material & Nama</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Gunakan kolom <strong>Material No</strong> (atau Kode Barang, Part No, SAP Code) dan <strong>Nama Barang</strong> (atau Deskripsi). Sistem otomatis menormalisasi angka menjadi 18 digit standar SAP.
            </p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-slate-200/80 space-y-1">
            <span className="font-bold text-slate-900 block text-[11px] text-emerald-700">2. Kolom Lokasi, UoM & Kontrak</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Sertakan <strong>Satuan</strong> (PCS, EA, SET, dsb.), <strong>Lokasi Rak</strong> (contoh: 1.01.01.01A), dan <strong>Jenis Kontrak</strong> (FPA / NON_FPA). Jika kosong, sistem otomatis memberi nilai default standar.
            </p>
          </div>
          <div className="p-3 bg-white rounded-2xl border border-slate-200/80 space-y-1">
            <span className="font-bold text-slate-900 block text-[11px] text-purple-700">3. Saldo Stok Awal & ROP</span>
            <p className="text-[11px] leading-relaxed text-slate-600">
              Sertakan <strong>Saldo Stok</strong> (Current Stock), <strong>Min Stock</strong> (Safety Stock / ROP), dan <strong>Max Stock</strong>. Baris yang memiliki saldo di bawah stok minimum otomatis masuk status PR Request.
            </p>
          </div>
        </div>
      </div>

      {/* INSTANT ACTION BANNER WHEN ROWS ARE PARSED */}
      {parsedRows.length > 0 && (
        <div className="p-5 sm:p-6 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
              <h3 className="text-base sm:text-lg font-black tracking-tight">
                {parsedRows.length} Data Barang Siap Dimasukkan ke Database!
              </h3>
            </div>
            <p className="text-xs text-blue-200 leading-relaxed">
              {readyCount} barang siap diimpor ({newCount} baru, {updateCount} update). Klik tombol untuk menyimpan secara permanen ke Cloud SQL & Firebase.
            </p>
          </div>

          <button
            onClick={handleExecuteImport}
            disabled={isImporting || selectedCount === 0}
            className="px-6 py-3.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-2xl text-xs sm:text-sm font-black shadow-lg transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 shrink-0 border-2 border-emerald-400/50"
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>
              {isImporting
                ? 'Sedang Menyimpan ke Database...'
                : `⚡ SIMPAN SEKARANG (${selectedCount} BARANG)`}
            </span>
          </button>
        </div>
      )}

      {/* Success Summary Banner */}
      {importSummary && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl animate-in zoom-in-95 shadow-xs">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h3 className="text-sm font-extrabold text-emerald-950">Proses Impor Berhasil Disimpan!</h3>
              <p className="text-xs text-emerald-800 mt-0.5">
                {importSummary.imported} barang baru ditambahkan, {importSummary.updated} barang diperbarui, dan {importSummary.failed} baris dilewati.
              </p>
            </div>
          </div>
          <button
            onClick={() => navigate('/items')}
            className="mt-3 px-4 py-2 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <span>Buka Daftar Master Barang</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* AUTOMATIC DUPLICATE ELIMINATION BANNER */}
      {eliminatedCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-200/80 text-amber-800 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-700" />
            </div>
            <div>
              <div className="font-extrabold text-xs sm:text-sm text-amber-950 flex items-center gap-2">
                <span>{eliminatedCount} Duplikat Nomor Material Dieliminasi Otomatis</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 font-mono font-bold">
                  Auto-Eliminated
                </span>
              </div>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Nomor material yang ganda/dobel dalam dokumen telah disaring otomatis sehingga hanya data baris pertama yang diproses untuk menjaga integritas saldo stok fisik gudang.
              </p>
            </div>
          </div>

          <button
            onClick={() => setActiveTab('ELIMINATED')}
            className="px-3 py-1.5 bg-amber-200 hover:bg-amber-300 text-amber-950 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap self-start sm:self-center"
          >
            Lihat Duplikat Dieliminasi ({eliminatedCount})
          </button>
        </div>
      )}

      {/* PARSED DATA PREVIEW & SELECTION CARD */}
      {parsedRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs space-y-4 p-5">
          {/* Top Bar with Counters & Execution Button */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            {/* Metric Pills */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-bold border border-slate-200">
                Total Baris: <strong>{totalCount}</strong>
              </span>

              {eliminatedCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 font-bold">
                  Duplikat Dieliminasi: <strong>{eliminatedCount}</strong>
                </span>
              )}

              <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                Barang Baru: <strong>{newCount}</strong>
              </span>

              <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                Update Eksisting: <strong>{updateCount}</strong>
              </span>

              {invalidCount > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                  Format Salah: <strong>{invalidCount}</strong>
                </span>
              )}
            </div>

            {/* Import Button */}
            <div className="flex items-center gap-2.5">
              <button
                onClick={handleExecuteImport}
                disabled={isImporting || selectedCount === 0}
                className="px-5 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  {isImporting
                    ? 'Sedang Memproses...'
                    : `Konfirmasi Impor (${selectedCount} Barang Terpilih)`}
                </span>
              </button>
            </div>
          </div>

          {/* Filter Bar & Document Selection Controls */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Filter Tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveTab('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                Semua ({totalCount})
              </button>

              <button
                onClick={() => setActiveTab('READY')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'READY'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200'
                }`}
              >
                Siap Impor ({readyCount})
              </button>

              {eliminatedCount > 0 && (
                <button
                  onClick={() => setActiveTab('ELIMINATED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'ELIMINATED'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200'
                  }`}
                >
                  Duplikat Dieliminasi ({eliminatedCount})
                </button>
              )}

              <button
                onClick={() => setActiveTab('NEW')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'NEW'
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200'
                }`}
              >
                Barang Baru ({newCount})
              </button>

              <button
                onClick={() => setActiveTab('UPDATE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                  activeTab === 'UPDATE'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200'
                }`}
              >
                Update Data ({updateCount})
              </button>

              {invalidCount > 0 && (
                <button
                  onClick={() => setActiveTab('INVALID')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    activeTab === 'INVALID'
                      ? 'bg-rose-600 text-white'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200'
                  }`}
                >
                  Tidak Valid ({invalidCount})
                </button>
              )}
            </div>

            {/* Search Input for fast preview */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Cari kode atau nama di tabel..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:bg-white focus:border-blue-500 font-medium"
              />
            </div>
          </div>

          {/* Quick Selection Actions */}
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => handleToggleSelectAll(true)}
                className="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer flex items-center gap-1"
              >
                <CheckSquare className="w-3.5 h-3.5" />
                Pilih Semua yang Siap Impor
              </button>
              <button
                onClick={() => handleToggleSelectAll(false)}
                className="text-slate-500 hover:text-slate-800 font-bold underline cursor-pointer flex items-center gap-1"
              >
                <Square className="w-3.5 h-3.5" />
                Batalkan Semua Pilihan
              </button>
            </div>

            <div className="font-semibold text-slate-700">
              Menampilkan {displayedRows.length} dari {totalCount} baris
            </div>
          </div>

          {/* Table of Parsed Rows */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-mono font-extrabold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <th className="py-2.5 px-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={areAllDisplayedSelected}
                      onChange={(e) => handleToggleSelectAll(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-0 cursor-pointer"
                      title="Pilih / Batal Pilih Semua"
                    />
                  </th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">No Material (18-Digit SAP)</th>
                  <th className="py-2.5 px-3">Input Asli</th>
                  <th className="py-2.5 px-3">Nama Barang</th>
                  <th className="py-2.5 px-3">Kategori</th>
                  <th className="py-2.5 px-3 min-w-[200px]">Deskripsi / Spesifikasi</th>
                  <th className="py-2.5 px-3">Rak</th>
                  <th className="py-2.5 px-3 text-right">Saldo Stok</th>
                  <th className="py-2.5 px-3">Kontrak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {displayedRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-slate-400 font-sans">
                      Tidak ada data yang cocok dengan filter atau pencarian saat ini.
                    </td>
                  </tr>
                ) : (
                  displayedRows.map((row) => (
                    <tr 
                      key={row.id} 
                      className={`hover:bg-slate-50/80 transition ${
                        row.isEliminated
                          ? 'bg-amber-50/40 text-slate-500'
                          : row.isSelected
                          ? 'bg-blue-50/20'
                          : ''
                      }`}
                    >
                      {/* Checkbox column */}
                      <td className="py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={row.isSelected}
                          disabled={row.isEliminated || !row.isValid}
                          onChange={() => handleToggleRow(row.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-0 disabled:opacity-30 cursor-pointer"
                        />
                      </td>

                      {/* Status Column */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {row.isEliminated ? (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300"
                            title={row.eliminationReason}
                          >
                            <Sparkles className="w-3 h-3 text-amber-700" />
                            Dieliminasi (Duplikat)
                          </span>
                        ) : row.isValid ? (
                          row.isExisting ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <RefreshCw className="w-3 h-3" /> Update
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" /> Baru
                            </span>
                          )
                        ) : (
                          <span 
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200" 
                            title={row.validationError}
                          >
                            <FileX className="w-3 h-3" /> Gagal
                          </span>
                        )}
                      </td>

                      {/* Material No */}
                      <td className={`py-2.5 px-3 whitespace-nowrap font-bold ${
                        row.isEliminated ? 'line-through text-slate-400' : 'text-slate-900'
                      }`}>
                        {row.material_no}
                      </td>

                      {/* Original raw code */}
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500">
                        {row.original_raw_code}
                        {row.original_raw_code !== row.material_no && (
                          <span className="ml-1 text-[10px] text-amber-600 font-semibold">(Auto-pad)</span>
                        )}
                      </td>

                      {/* Item name */}
                      <td className={`py-2.5 px-3 font-sans truncate max-w-xs ${
                        row.isEliminated ? 'text-slate-400' : 'text-slate-800 font-medium'
                      }`}>
                        {row.name}
                      </td>

                      {/* Category */}
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                        {row.category}
                      </td>

                      {/* Description / Specification */}
                      <td className="py-2.5 px-3 max-w-[220px] font-sans text-xs text-slate-600 truncate" title={row.specification || row.description || '-'}>
                        {row.specification || row.description || '-'}
                      </td>

                      {/* Location */}
                      <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-semibold">
                        {row.location}
                      </td>

                      {/* Stock */}
                      <td className="py-2.5 px-3 text-right font-bold text-emerald-600 whitespace-nowrap">
                        {row.current_stock} {row.unit}
                      </td>

                      {/* Contract */}
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.contract_type === 'FPA'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-slate-100 text-slate-700'
                        }`}>
                          {row.contract_type}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
