import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download } from 'lucide-react';

interface QrCodeGeneratorProps {
  value: string;
  size?: number;
  label?: string;
  sublabel?: string;
  showDownload?: boolean;
  className?: string;
}

export const QrCodeGenerator: React.FC<QrCodeGeneratorProps> = ({
  value,
  size = 180,
  label,
  sublabel,
  showDownload = false,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    if (!canvasRef.current || !value) return;

    QRCode.toCanvas(
      canvasRef.current,
      value,
      {
        width: size,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        errorCorrectionLevel: 'M',
      },
      (error) => {
        if (error) {
          console.error('Error generating QR code:', error);
        } else if (canvasRef.current) {
          setDataUrl(canvasRef.current.toDataURL('image/png'));
        }
      }
    );
  }, [value, size]);

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `QR_${label || 'item'}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className={`flex flex-col items-center justify-center p-3 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-900 ${className}`}>
      <canvas ref={canvasRef} className="rounded" />
      {label && (
        <span className="mt-2 text-xs font-mono font-bold tracking-wider text-slate-800 text-center max-w-[220px] truncate">
          {label}
        </span>
      )}
      {sublabel && (
        <span className="text-[11px] text-slate-600 text-center max-w-[220px] line-clamp-1">
          {sublabel}
        </span>
      )}
      {showDownload && dataUrl && (
        <button
          onClick={handleDownload}
          className="mt-2 flex items-center gap-1 text-[11px] px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded font-medium transition cursor-pointer"
        >
          <Download className="w-3 h-3" />
          Unduh QR PNG
        </button>
      )}
    </div>
  );
};
