import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import jsQR from 'jsqr';
import { createWorker } from 'tesseract.js';
import { 
  QrCode, 
  Camera, 
  ScanLine, 
  Search, 
  CheckCircle2, 
  RefreshCw, 
  FileText, 
  PlusCircle, 
  MinusCircle, 
  Sparkles,
  CameraOff,
  Image as ImageIcon,
  Upload,
  AlertCircle
} from 'lucide-react';
import { useInventory } from '../context/InventoryContext';
import { useAuth } from '../context/AuthContext';
import { InventoryItem } from '../types/inventory';
import { padTo18Digits } from '../utils/materialUtils';

export const ScannerPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, getItemById, getItemByMaterialNo } = useInventory();
  const { canMutateStock } = useAuth();

  const [activeTab, setActiveTab] = useState<'QR' | 'OCR' | 'MANUAL'>('QR');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>('');

  const animFrameIdRef = useRef<number | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  const [matchedItem, setMatchedItem] = useState<InventoryItem | null>(null);
  const [scannedRawCode, setScannedRawCode] = useState<string>('');

  const [isProcessingOcr, setIsProcessingOcr] = useState<boolean>(false);
  const [ocrTextResult, setOcrTextResult] = useState<string>('');
  const [manualInput, setManualInput] = useState<string>('');

  // Gallery upload states
  const [isProcessingUpload, setIsProcessingUpload] = useState<boolean>(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const startCamera = async () => {
    setCameraError('');
    setMatchedItem(null);

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setCameraActive(true);
        setIsScanning(true);
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setCameraError('Kamera tidak dapat diakses. Pastikan izin kamera telah diberikan atau gunakan mode pencarian manual.');
      setCameraActive(false);
      setIsScanning(false);
    }
  };

  const stopCamera = useCallback(() => {
    if (animFrameIdRef.current) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setIsScanning(false);
  }, []);

  const matchCodeToItem = useCallback((raw: string): InventoryItem | null => {
    if (!raw) return null;
    const cleanRaw = raw.trim();

    let found = getItemById(cleanRaw);
    if (found) return found;

    if (cleanRaw.includes('/bin-card/')) {
      const parts = cleanRaw.split('/bin-card/');
      const targetSlug = parts[1]?.split('?')[0]?.split('#')[0];
      if (targetSlug) {
        found = getItemById(targetSlug) || getItemByMaterialNo(targetSlug);
        if (found) return found;
      }
    }

    const padded = padTo18Digits(cleanRaw);
    if (padded) {
      found = getItemByMaterialNo(padded);
      if (found) return found;
    }

    const digitsOnly = cleanRaw.replace(/\D/g, '');
    if (digitsOnly.length >= 6) {
      found = items.find(i => i.material_no.includes(digitsOnly) || digitsOnly.includes(i.material_no));
      if (found) return found;
    }

    return null;
  }, [getItemById, getItemByMaterialNo, items]);

  const scanQrFrame = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !cameraActive) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    if (video.readyState === video.HAVE_ENOUGH_DATA && ctx) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert',
      });

      if (code && code.data) {
        setScannedRawCode(code.data);
        const item = matchCodeToItem(code.data);
        if (item) {
          setMatchedItem(item);
          try {
            const ctxAudio = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
            const osc = ctxAudio.createOscillator();
            osc.frequency.setValueAtTime(880, ctxAudio.currentTime);
            osc.connect(ctxAudio.destination);
            osc.start();
            osc.stop(ctxAudio.currentTime + 0.1);
          } catch {}
          stopCamera();
          return;
        }
      }
    }

    animFrameIdRef.current = requestAnimationFrame(scanQrFrame);
  }, [cameraActive, matchCodeToItem, stopCamera]);

  useEffect(() => {
    if (isScanning && activeTab === 'QR') {
      animFrameIdRef.current = requestAnimationFrame(scanQrFrame);
    }
    return () => {
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [isScanning, activeTab, scanQrFrame]);

  const handleTabChange = (tab: 'QR' | 'OCR' | 'MANUAL') => {
    setActiveTab(tab);
    setMatchedItem(null);
    setScannedRawCode('');
    setOcrTextResult('');

    if (tab === 'QR' || tab === 'OCR') {
      startCamera();
    } else {
      stopCamera();
    }
  };

  const handleCaptureOcr = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setIsProcessingOcr(true);
    setOcrTextResult('');

    try {
      const dataUrl = canvas.toDataURL('image/jpeg');
      const worker = await createWorker('eng');
      const ret = await worker.recognize(dataUrl);
      await worker.terminate();

      const recognized = ret.data.text || '';
      setOcrTextResult(recognized);

      const matches = recognized.match(/\d{6,18}/g);
      if (matches && matches.length > 0) {
        for (const candidate of matches) {
          const item = matchCodeToItem(candidate);
          if (item) {
            setMatchedItem(item);
            setScannedRawCode(candidate);
            stopCamera();
            break;
          }
        }
      }
    } catch (ocrErr) {
      console.error('OCR Error:', ocrErr);
    } finally {
      setIsProcessingOcr(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setIsProcessingUpload(true);
    setMatchedItem(null);
    setScannedRawCode('');
    setOcrTextResult('');

    const reader = new FileReader();
    reader.onload = async (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImagePreview(dataUrl);

      const img = new Image();
      img.onload = async () => {
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) {
          setIsProcessingUpload(false);
          return;
        }

        tempCanvas.width = img.naturalWidth || img.width;
        tempCanvas.height = img.naturalHeight || img.height;
        tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

        let found = false;

        // 1. First attempt: jsQR decode
        try {
          const imgData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
          const code = jsQR(imgData.data, imgData.width, imgData.height, {
            inversionAttempts: 'attemptBoth',
          });

          if (code && code.data) {
            setScannedRawCode(code.data);
            const item = matchCodeToItem(code.data);
            if (item) {
              setMatchedItem(item);
              found = true;
              stopCamera();
            }
          }
        } catch (err) {
          console.warn('QR decode error on upload:', err);
        }

        // 2. Second attempt: OCR text recognition if QR didn't find an item
        if (!found) {
          try {
            const worker = await createWorker('eng');
            const ret = await worker.recognize(dataUrl);
            await worker.terminate();

            const recognized = ret.data.text || '';
            setOcrTextResult(recognized);

            const matches = recognized.match(/\d{6,18}/g);
            if (matches && matches.length > 0) {
              for (const candidate of matches) {
                const item = matchCodeToItem(candidate);
                if (item) {
                  setMatchedItem(item);
                  setScannedRawCode(candidate);
                  found = true;
                  stopCamera();
                  break;
                }
              }
            }
            if (!found && recognized.trim()) {
              const lines = recognized.split('\n').map(l => l.trim()).filter(l => l.length >= 3);
              for (const line of lines) {
                const item = items.find(i => i.name.toLowerCase().includes(line.toLowerCase()) || line.toLowerCase().includes(i.name.toLowerCase()));
                if (item) {
                  setMatchedItem(item);
                  setScannedRawCode(item.material_no);
                  found = true;
                  stopCamera();
                  break;
                }
              }
            }
          } catch (ocrErr) {
            console.error('Upload OCR Error:', ocrErr);
          }
        }

        setIsProcessingUpload(false);
        if (!found) {
          setUploadError('Tidak ditemukan QR Code atau Nomor Material yang cocok dari gambar yang diunggah. Pastikan gambar jelas dan tidak buram.');
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleManualSearch = (val: string) => {
    setManualInput(val);
    if (!val.trim()) {
      setMatchedItem(null);
      return;
    }
    const item = matchCodeToItem(val);
    setMatchedItem(item);
  };

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="space-y-5 pb-24 lg:pb-12 max-w-4xl mx-auto">
      <div className="text-center space-y-1">
        <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight flex items-center justify-center gap-2">
          <ScanLine className="w-6 h-6 text-emerald-600" />
          Pemindai Barcode & OCR Teks Kamera
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Pindai QR Code Bin Card fisik di rak gudang atau baca nomor material yang tercetak pada kardus.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5">
        <div className="grid grid-cols-3 p-1 bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xs">
          <button
            onClick={() => handleTabChange('QR')}
            className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'QR'
                ? 'bg-[#10B981] text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <QrCode className="w-4 h-4" />
            Scan QR
          </button>

          <button
            onClick={() => handleTabChange('OCR')}
            className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'OCR'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            OCR Teks
          </button>

          <button
            onClick={() => handleTabChange('MANUAL')}
            className={`py-2 text-xs font-bold rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'MANUAL'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Search className="w-4 h-4" />
            Cari Manual
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileUpload}
          className="hidden"
        />

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessingUpload}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-2xl text-xs font-bold transition shadow-xs cursor-pointer w-full sm:w-auto justify-center"
        >
          {isProcessingUpload ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
              <span>Menganalisis Foto...</span>
            </>
          ) : (
            <>
              <ImageIcon className="w-4 h-4 text-indigo-600" />
              <span>Upload QR/OCR dari Galeri</span>
            </>
          )}
        </button>
      </div>

      {uploadError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-xs text-rose-700 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
          <span>{uploadError}</span>
        </div>
      )}

      {uploadedImagePreview && isProcessingUpload && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center gap-3 text-xs text-indigo-900 animate-pulse">
          <img src={uploadedImagePreview} alt="Preview" className="w-12 h-12 object-cover rounded-xl border border-indigo-300 shrink-0" />
          <div>
            <div className="font-bold">Menganalisis gambar dari galeri...</div>
            <div className="text-[11px] text-indigo-600">Mendeteksi QR Code dan nomor material via OCR</div>
          </div>
        </div>
      )}

      {activeTab !== 'MANUAL' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-xs relative overflow-hidden">
          {cameraError ? (
            <div className="py-12 px-4 text-center">
              <CameraOff className="w-12 h-12 text-rose-500 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-900 mb-1">Akses Kamera Terkendala</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mb-4">{cameraError}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Coba Buka Kamera Lagi
              </button>
            </div>
          ) : (
            <div className="relative aspect-video max-h-[420px] rounded-2xl overflow-hidden bg-black flex items-center justify-center shadow-inner">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
              />
              <canvas ref={canvasRef} className="hidden" />

              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-64 h-64 border-2 border-emerald-400 rounded-2xl relative shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-emerald-400 rounded-tl-xl -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-emerald-400 rounded-tr-xl -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-emerald-400 rounded-bl-xl -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-emerald-400 rounded-br-xl -mb-1 -mr-1"></div>

                  {isScanning && (
                    <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent animate-pulse"></div>
                  )}
                </div>
              </div>

              <div className="absolute bottom-3 inset-x-3 flex items-center justify-between pointer-events-auto">
                <span className="px-3 py-1 rounded-lg bg-black/60 backdrop-blur text-[11px] font-mono text-emerald-300">
                  {activeTab === 'QR' ? 'Mode: Deteksi Otomatis QR' : 'Mode: Ambil Foto OCR'}
                </span>

                {activeTab === 'OCR' && (
                  <button
                    onClick={handleCaptureOcr}
                    disabled={isProcessingOcr}
                    className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer"
                  >
                    <Camera className="w-4 h-4" />
                    <span>{isProcessingOcr ? 'Membaca...' : 'Ambil & Baca Nomor'}</span>
                  </button>
                )}

                {!cameraActive && (
                  <button
                    onClick={startCamera}
                    className="p-2 bg-white text-slate-800 rounded-xl text-xs shadow cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'MANUAL' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
            Ketik Nomor Material SAP (10-18 Digit) atau Nama Barang
          </label>
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={manualInput}
              onChange={(e) => handleManualSearch(e.target.value)}
              placeholder="Contoh: 031007000000000235 atau Ball Valve"
              className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-300 rounded-xl font-mono text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 font-bold"
              autoFocus
            />
          </div>
        </div>
      )}

      {matchedItem && (
        <div className="bg-white border-2 border-emerald-500 rounded-3xl p-6 sm:p-8 shadow-md animate-in zoom-in-95">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700 font-mono">
              Material Teridentifikasi di Sistem
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
            <div className="md:col-span-8 space-y-1.5">
              <div className="font-mono text-lg font-black text-slate-900 tracking-wider">
                {matchedItem.material_no}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 uppercase">
                {matchedItem.name}
              </h2>
              <p className="text-xs text-slate-500 font-mono">
                {matchedItem.specification}
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="px-2.5 py-0.5 rounded bg-slate-100 font-mono font-bold text-slate-800">
                  Rak: {matchedItem.location}
                </span>
                <span className="px-2.5 py-0.5 rounded bg-blue-50 font-bold text-blue-800">
                  {matchedItem.contract_type}
                </span>
              </div>
            </div>

            <div className="md:col-span-4 p-4 rounded-2xl bg-slate-50 border border-slate-200 text-center">
              <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
                Saldo Fisik
              </span>
              <div className="text-3xl font-mono font-black text-emerald-600">
                {matchedItem.current_stock} <span className="text-sm font-normal text-slate-500">{matchedItem.unit}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-5 mt-5 border-t border-slate-100">
            <button
              onClick={() => navigate(`/bin-card/${matchedItem.id}`)}
              className="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-4 py-2.5 bg-[#1E3E8A] hover:bg-[#162f6b] text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Buka Kartu Bin Card</span>
            </button>

            {canMutateStock && (
              <>
                <button
                  onClick={() => navigate(`/transactions?action=in&item=${matchedItem.id}`)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-[#10B981] hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Mutasi IN</span>
                </button>

                <button
                  onClick={() => navigate(`/transactions?action=out&item=${matchedItem.id}`)}
                  className="flex items-center gap-1.5 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <MinusCircle className="w-4 h-4" />
                  <span>Mutasi OUT</span>
                </button>
              </>
            )}

            <button
              onClick={() => {
                setMatchedItem(null);
                setScannedRawCode('');
                startCamera();
              }}
              className="px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Scan Ulang
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
