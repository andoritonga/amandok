import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Stamp,
  EyeOff,
  Minimize2,
  FileStack,
  Upload,
  Download,
  RotateCw,
  Trash2,
  Sparkles,
  ArrowRight,
  Plus,
  CheckCircle2,
  WifiOff,
  FileText,
  MoveUp,
  MoveDown,
  Layers,
} from 'lucide-react';
import {
  type WatermarkConfig,
  type WatermarkMode,
  type RedactionBox,
  type RedactionStyle,
  type CropPreset,
  type CompressionResult,
  formatBytes,
  loadNormalizedImage,
  renderDocumentCanvas,
  compressToTargetKb,
  generateSampleKtpDataUrl,
} from '../utils/imageProcessor';
import {
  type PdfQueueItem,
  type PdfPageLayout,
  buildCombinedPdf,
} from '../utils/pdfBuilder';

type StudioTab = 'watermark' | 'redact' | 'compress' | 'pdf';
export type Lang = 'id' | 'en';

const WATERMARK_PRESETS: {
  id: string;
  labelId: string;
  labelEn: string;
  textId: string;
  textEn: string;
}[] = [
  {
    id: 'bank',
    labelId: 'Verifikasi Bank / KPR',
    labelEn: 'Bank / Mortgage Verification',
    textId: 'HANYA UNTUK VERIFIKASI BANK',
    textEn: 'FOR BANK VERIFICATION ONLY',
  },
  {
    id: 'hrd',
    labelId: 'Lamaran Kerja / HRD',
    labelEn: 'Job Application / HR',
    textId: 'KHUSUS REKRUTMEN HRD PERUSAHAAN',
    textEn: 'FOR HR RECRUITMENT ONLY',
  },
  {
    id: 'cpns',
    labelId: 'Seleksi CPNS / BUMN',
    labelEn: 'Civil Service / SOE Portal',
    textId: 'KHUSUS PENDAFTARAN SSCASN / BUMN',
    textEn: 'FOR SSCASN / SOE REGISTRATION ONLY',
  },
  {
    id: 'rental',
    labelId: 'Sewa Properti / Kos',
    labelEn: 'Property / Room Rental',
    textId: 'HANYA UNTUK ADMINISTRASI SEWA',
    textEn: 'FOR RENTAL ADMINISTRATION ONLY',
  },
  {
    id: 'telco',
    labelId: 'Registrasi Layanan / Mitra',
    labelEn: 'Partner / Service Onboarding',
    textId: 'VERIFIKASI MITRA RESMI — DILARANG MENYALAHGUNAKAN',
    textEn: 'OFFICIAL PARTNER VERIFICATION ONLY',
  },
];

const WATERMARK_COLORS = [
  { id: 'crimson', label: 'Merah Keamanan', hex: '#e11d48' },
  { id: 'cobalt', label: 'Biru Resmi', hex: '#0284c7' },
  { id: 'slate', label: 'Hitam Arsip', hex: '#0f172a' },
  { id: 'emerald', label: 'Hijau Verifikasi', hex: '#059669' },
  { id: 'amber', label: 'Kuning Peringatan', hex: '#d97706' },
  { id: 'white', label: 'Putih Kontras', hex: '#f8fafc' },
];

export default function AmanDokStudio() {
  const [lang, setLang] = useState<Lang>('id');
  const [activeTab, setActiveTab] = useState<StudioTab>('watermark');

  // Base image state (shared across Watermark, Redact, and Compress tabs)
  const [sourceDataUrl, setSourceDataUrl] = useState<string | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string>('dokumen-ktp.jpg');
  const [sourceOriginalBytes, setSourceOriginalBytes] = useState<number>(0);
  const [sourceDimensions, setSourceDimensions] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [loadedImageEl, setLoadedImageEl] = useState<HTMLImageElement | null>(null);
  const [isSampleLoaded, setIsSampleLoaded] = useState<boolean>(false);

  // Watermark configuration
  const todayStr = new Date().toISOString().slice(0, 10);
  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(true);
  const [watermarkConfig, setWatermarkConfig] = useState<WatermarkConfig>({
    text: 'HANYA UNTUK VERIFIKASI BANK',
    subtext: `TANGGAL: ${todayStr} • DILARANG MENYALAHGUNAKAN`,
    mode: 'tiled',
    color: '#e11d48',
    opacity: 0.32,
    angle: -28,
    fontSizeScale: 1.0,
    spacingScale: 1.05,
    rotation: 0,
    addTimestampBorder: true,
  });

  // Redaction state
  const [redactions, setRedactions] = useState<RedactionBox[]>([]);
  const [activeRedactionStyle, setActiveRedactionStyle] = useState<RedactionStyle>('pixelate');
  const [isDrawingRedaction, setIsDrawingRedaction] = useState<boolean>(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [draftBox, setDraftBox] = useState<RedactionBox | null>(null);

  // Compressor & Pasfoto state
  const [targetKb, setTargetKb] = useState<number>(200);
  const [cropPreset, setCropPreset] = useState<CropPreset>('original');
  const [pasfotoBg, setPasfotoBg] = useState<string>('#dc2626');
  const [compressionResult, setCompressionResult] = useState<CompressionResult | null>(null);

  // PDF Queue state
  const [pdfQueue, setPdfQueue] = useState<PdfQueueItem[]>([]);
  const [pdfLayout, setPdfLayout] = useState<PdfPageLayout>('a4-id-cards');
  const [isBuildingPdf, setIsBuildingPdf] = useState<boolean>(false);
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [pdfSizeBytes, setPdfSizeBytes] = useState<number>(0);

  // Feedback toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3400);
  }, []);

  // Sync language with navbar switcher
  useEffect(() => {
    const saved = localStorage.getItem('amandok_lang') as Lang | null;
    if (saved === 'id' || saved === 'en') {
      setLang(saved);
    }
    const handler = (e: Event) => {
      const custom = e as CustomEvent<Lang>;
      if (custom.detail === 'id' || custom.detail === 'en') {
        setLang(custom.detail);
      }
    };
    window.addEventListener('amandok-lang-change', handler);
    return () => window.removeEventListener('amandok-lang-change', handler);
  }, []);

  // Load synthetic sample KTP on initial mount so the studio is immediately interactive
  const handleLoadSampleKtp = useCallback(() => {
    const sample = generateSampleKtpDataUrl();
    setSourceDataUrl(sample.dataUrl);
    setSourceFileName('simulasi-ktp-budi-santoso.jpg');
    setSourceOriginalBytes(sample.bytes);
    setSourceDimensions({ width: sample.width, height: sample.height });
    setRedactions([]);
    setIsSampleLoaded(true);
    showToast(
      lang === 'id'
        ? 'Simulasi KTP dimuat di memori lokal browser. Silakan uji semua fitur!'
        : 'Simulated ID Card loaded in browser RAM. Test all tools freely!'
    );
  }, [lang, showToast]);

  useEffect(() => {
    handleLoadSampleKtp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever sourceDataUrl changes, create HTMLImageElement for fast synchronous canvas redraws
  useEffect(() => {
    if (!sourceDataUrl) {
      setLoadedImageEl(null);
      return;
    }
    const img = new Image();
    img.onload = () => {
      setLoadedImageEl(img);
    };
    img.src = sourceDataUrl;
  }, [sourceDataUrl]);

  // Redraw main preview canvas whenever image, watermark, or redaction changes
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !loadedImageEl) return;
    renderDocumentCanvas(
      canvas,
      loadedImageEl,
      watermarkEnabled ? watermarkConfig : null,
      redactions
    );
  }, [loadedImageEl, watermarkEnabled, watermarkConfig, redactions, activeTab]);

  // Trigger compression automatically when entering 'compress' tab or changing compression settings
  const runCompressionFromCurrentCanvas = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !loadedImageEl) return;

    // Ensure canvas is freshly rendered with current watermark + redactions
    renderDocumentCanvas(
      canvas,
      loadedImageEl,
      watermarkEnabled ? watermarkConfig : null,
      redactions
    );

    const compositedDataUrl = canvas.toDataURL('image/png');

    try {
      const compImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = compositedDataUrl;
      });

      const res = await compressToTargetKb(compImg, {
        targetKb,
        cropPreset,
        bgColor: pasfotoBg,
        originalBytes: sourceOriginalBytes || 350 * 1024,
      });
      setCompressionResult(res);
    } catch (err) {
      console.error(err);
    }
  }, [
    loadedImageEl,
    watermarkEnabled,
    watermarkConfig,
    redactions,
    targetKb,
    cropPreset,
    pasfotoBg,
    sourceOriginalBytes,
  ]);

  useEffect(() => {
    if (activeTab === 'compress' && loadedImageEl) {
      runCompressionFromCurrentCanvas();
    }
  }, [activeTab, loadedImageEl, targetKb, cropPreset, pasfotoBg, runCompressionFromCurrentCanvas]);

  // Handle user uploading their own image
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const normalized = await loadNormalizedImage(file);
      setSourceDataUrl(normalized.dataUrl);
      setSourceFileName(file.name.replace(/\.[^.]+$/, '') + '.jpg');
      setSourceOriginalBytes(normalized.originalBytes);
      setSourceDimensions({ width: normalized.width, height: normalized.height });
      setRedactions([]);
      setIsSampleLoaded(false);
      showToast(
        lang === 'id'
          ? 'Dokumen dimuat 100% lokal & metadata EXIF/GPS otomatis dibersihkan.'
          : 'Document loaded 100% locally & EXIF/GPS metadata automatically stripped.'
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal membaca file gambar. Pastikan format JPG, PNG, atau WebP.'
          : 'Failed to read image file. Please use JPG, PNG, or WebP.'
      );
    } finally {
      e.target.value = '';
    }
  };

  // Pointer coordinates helper for interactive redaction drawing
  const getNormalizedPointerCoords = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ): { x: number; y: number } | null => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return null;
      clientX = touch.clientX;
      clientY = touch.clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (activeTab !== 'redact') return;
    const coords = getNormalizedPointerCoords(e);
    if (!coords) return;
    setIsDrawingRedaction(true);
    setDrawStart(coords);
    setDraftBox({
      id: 'draft',
      x: coords.x,
      y: coords.y,
      width: 0,
      height: 0,
      style: activeRedactionStyle,
    });
  };

  const handlePointerMove = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>
  ) => {
    if (!isDrawingRedaction || !drawStart || activeTab !== 'redact') return;
    const coords = getNormalizedPointerCoords(e);
    if (!coords) return;

    const x = Math.min(drawStart.x, coords.x);
    const y = Math.min(drawStart.y, coords.y);
    const width = Math.abs(coords.x - drawStart.x);
    const height = Math.abs(coords.y - drawStart.y);

    setDraftBox({
      id: 'draft',
      x,
      y,
      width,
      height,
      style: activeRedactionStyle,
    });
  };

  const handlePointerUp = () => {
    if (!isDrawingRedaction || !draftBox) return;
    setIsDrawingRedaction(false);
    setDrawStart(null);

    if (draftBox.width > 0.015 && draftBox.height > 0.015) {
      setRedactions((prev) => [
        ...prev,
        {
          ...draftBox,
          id: `redact-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
      ]);
    }
    setDraftBox(null);
  };

  // Quick KTP Redaction Presets (NIK, Signature, Photo, Address)
  const addQuickRedactionPreset = (preset: 'nik' | 'signature' | 'photo' | 'address') => {
    const presetBoxes: Record<
      'nik' | 'signature' | 'photo' | 'address',
      Omit<RedactionBox, 'id' | 'style'>
    > = {
      nik: { x: 0.23, y: 0.22, width: 0.46, height: 0.068 },
      address: { x: 0.24, y: 0.46, width: 0.45, height: 0.055 },
      photo: { x: 0.715, y: 0.295, width: 0.22, height: 0.43 },
      signature: { x: 0.72, y: 0.81, width: 0.21, height: 0.13 },
    };

    const box = presetBoxes[preset];
    setRedactions((prev) => [
      ...prev,
      {
        id: `preset-${preset}-${Date.now()}`,
        ...box,
        style: activeRedactionStyle,
      },
    ]);
    showToast(
      lang === 'id'
        ? 'Area sensor berhasil ditambahkan. Anda juga bisa klik & seret langsung pada gambar.'
        : 'Redaction mask added. You can also click & drag directly on the image.'
    );
  };

  // Download current protected canvas image
  const handleDownloadProtectedImage = (format: 'jpeg' | 'png' = 'jpeg') => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mime, 0.92);
    const link = document.createElement('a');
    const cleanBase = sourceFileName.replace(/\.[^.]+$/, '');
    link.download = `${cleanBase}-amandok.${format === 'png' ? 'png' : 'jpg'}`;
    link.href = dataUrl;
    link.click();
    showToast(
      lang === 'id'
        ? 'Dokumen terlindungi berhasil diunduh ke perangkat Anda!'
        : 'Protected document downloaded to your device!'
    );
  };

  // Download compressed target-KB image
  const handleDownloadCompressed = () => {
    if (!compressionResult) return;
    const link = document.createElement('a');
    const cleanBase = sourceFileName.replace(/\.[^.]+$/, '');
    link.download = `${cleanBase}-${targetKb}kb.jpg`;
    link.href = compressionResult.dataUrl;
    link.click();
    showToast(
      lang === 'id'
        ? `File terkompresi (${formatBytes(compressionResult.compressedBytes)}) berhasil diunduh!`
        : `Compressed file (${formatBytes(compressionResult.compressedBytes)}) downloaded!`
    );
  };

  // Send current active image to PDF queue
  const handleSendCurrentToPdfQueue = () => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const dataUrl =
      activeTab === 'compress' && compressionResult
        ? compressionResult.dataUrl
        : canvas.toDataURL('image/jpeg', 0.9);

    const approxBytes = Math.round(((dataUrl.split(',')[1]?.length || 0) * 3) / 4);
    const newItem: PdfQueueItem = {
      id: `pdf-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${sourceFileName.replace(/\.[^.]+$/, '')}-amandok.jpg`,
      type: 'image',
      dataUrl,
      width: canvas.width,
      height: canvas.height,
      sizeBytes: approxBytes,
    };

    setPdfQueue((prev) => [...prev, newItem]);
    setPdfDownloadUrl(null);
    setActiveTab('pdf');
    showToast(
      lang === 'id'
        ? 'Dokumen ditambahkan ke Antrean PDF!'
        : 'Document added to PDF Queue!'
    );
  };

  // Add external images or PDFs directly to PDF queue
  const handlePdfQueueFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const addedItems: PdfQueueItem[] = [];

    for (const file of files) {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const buffer = await file.arrayBuffer();
        addedItems.push({
          id: `pdf-doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: 'pdf',
          arrayBuffer: buffer,
          sizeBytes: file.size,
        });
      } else if (file.type.startsWith('image/')) {
        const norm = await loadNormalizedImage(file);
        addedItems.push({
          id: `pdf-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          type: 'image',
          dataUrl: norm.dataUrl,
          width: norm.width,
          height: norm.height,
          sizeBytes: norm.originalBytes,
        });
      }
    }

    if (addedItems.length > 0) {
      setPdfQueue((prev) => [...prev, ...addedItems]);
      setPdfDownloadUrl(null);
      showToast(
        lang === 'id'
          ? `${addedItems.length} berkas berhasil ditambahkan ke antrean PDF.`
          : `${addedItems.length} file(s) added to PDF queue.`
      );
    }
    e.target.value = '';
  };

  const movePdfQueueItem = (index: number, direction: -1 | 1) => {
    setPdfQueue((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return copy;
    });
    setPdfDownloadUrl(null);
  };

  const removePdfQueueItem = (id: string) => {
    setPdfQueue((prev) => prev.filter((item) => item.id !== id));
    setPdfDownloadUrl(null);
  };

  const handleGenerateCombinedPdf = async () => {
    if (pdfQueue.length === 0) return;
    setIsBuildingPdf(true);
    try {
      const pdfBytes = await buildCombinedPdf(pdfQueue, pdfLayout);
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      if (pdfDownloadUrl) {
        URL.revokeObjectURL(pdfDownloadUrl);
      }
      const url = URL.createObjectURL(blob);
      setPdfDownloadUrl(url);
      setPdfSizeBytes(blob.size);
      showToast(
        lang === 'id'
          ? 'Dokumen PDF gabungan selesai dibuat di memori browser!'
          : 'Combined PDF document generated in browser memory!'
      );
    } catch (err) {
      console.error(err);
      showToast(
        lang === 'id'
          ? 'Terjadi kesalahan saat menggabungkan PDF.'
          : 'An error occurred while building the PDF.'
      );
    } finally {
      setIsBuildingPdf(false);
    }
  };

  // Wipe entire session memory
  const handleWipeSessionMemory = () => {
    if (pdfDownloadUrl) URL.revokeObjectURL(pdfDownloadUrl);
    setRedactions([]);
    setPdfQueue([]);
    setPdfDownloadUrl(null);
    setCompressionResult(null);
    handleLoadSampleKtp();
    showToast(
      lang === 'id'
        ? 'Seluruh memori sesi telah dihapus & dikembalikan ke simulasi awal.'
        : 'All session memory wiped & reset to clean simulation.'
    );
  };

  return (
    <div className="relative">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-3 text-sm font-medium text-emerald-300 shadow-2xl backdrop-blur-md"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Zero-Upload Guarantee Strip & Quick Actions */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/25 bg-slate-900/80 px-4 py-3.5 shadow-lg backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-emerald-400">
                {lang === 'id'
                  ? '100% DIPROSES DI BROWSER ANDA (ZERO SERVER UPLOAD)'
                  : '100% IN-BROWSER PROCESSING (ZERO SERVER UPLOAD)'}
              </span>
              <span className="hidden rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 font-mono text-[11px] text-sky-300 sm:inline-flex items-center gap-1">
                <WifiOff className="h-3 w-3" />
                {lang === 'id' ? 'Aman Saat Offline' : 'Works Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {lang === 'id'
                ? 'KTP, NPWP, dan dokumen Anda tidak pernah dikirim ke server mana pun. EXIF & lokasi GPS dihapus otomatis.'
                : 'Your ID cards and documents never leave your device. Camera EXIF & GPS metadata are stripped automatically.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSampleKtp}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/90 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-sky-500/50 hover:text-sky-300"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-400" />
            {lang === 'id' ? 'Muat Simulasi KTP' : 'Load Simulated ID'}
          </button>

          <button
            type="button"
            onClick={handleWipeSessionMemory}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {lang === 'id' ? 'Bersihkan Memori' : 'Wipe Session RAM'}
          </button>
        </div>
      </div>

      {/* 4-Step Studio Pipeline Tabs */}
      <div
        role="tablist"
        aria-label="AmanDok Document Pipeline"
        className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4"
      >
        {[
          {
            id: 'watermark' as StudioTab,
            step: '01',
            titleId: 'Watermark KTP',
            titleEn: 'ID Watermark',
            descId: 'Segel teks anti-pinjol',
            descEn: 'Anti-fraud text stamp',
            icon: Stamp,
            badge: watermarkEnabled ? 'ON' : 'OFF',
          },
          {
            id: 'redact' as StudioTab,
            step: '02',
            titleId: 'Sensor & Redaksi',
            titleEn: 'Redact & Blur',
            descId: 'Tutup NIK & tanda tangan',
            descEn: 'Mask ID number & signature',
            icon: EyeOff,
            badge: redactions.length > 0 ? `${redactions.length}` : null,
          },
          {
            id: 'compress' as StudioTab,
            step: '03',
            titleId: 'Target KB & Pasfoto',
            titleEn: 'Target KB & Crop',
            descId: 'Pas <200KB & rasio 3x4/4x6',
            descEn: 'Exact KB & 3x4/4x6 crop',
            icon: Minimize2,
            badge: `${targetKb}KB`,
          },
          {
            id: 'pdf' as StudioTab,
            step: '04',
            titleId: 'Gabung ke PDF',
            titleEn: 'Merge to PDF',
            descId: 'Susun berkas lamaran A4',
            descEn: 'Combine into A4 PDF',
            icon: FileStack,
            badge: pdfQueue.length > 0 ? `${pdfQueue.length}` : null,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`group relative flex flex-col items-start justify-between rounded-2xl border p-3.5 text-left transition-all ${
                isActive
                  ? 'border-emerald-500/60 bg-slate-900 shadow-lg shadow-emerald-950/30 ring-1 ring-emerald-500/30'
                  : 'border-slate-800 bg-slate-900/50 hover:border-slate-700 hover:bg-slate-900/80'
              }`}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400 group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-500">
                    {tab.step}
                  </span>
                </div>
                {tab.badge && (
                  <span
                    className={`rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <div>
                <div
                  className={`text-sm font-bold ${
                    isActive ? 'text-white' : 'text-slate-200'
                  }`}
                >
                  {lang === 'id' ? tab.titleId : tab.titleEn}
                </div>
                <div className="text-xs text-slate-400">
                  {lang === 'id' ? tab.descId : tab.descEn}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleImageFileSelect}
        className="hidden"
      />
      <input
        ref={pdfFileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={handlePdfQueueFilesUpload}
        className="hidden"
      />

      {/* Main Workspace Grid */}
      {activeTab !== 'pdf' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT / CENTER: Interactive Canvas Preview Area (7 cols) */}
          <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-900/75 p-4 shadow-xl sm:p-6 lg:col-span-7">
            {/* Canvas Top Toolbar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 shadow-md shadow-emerald-950/50 transition hover:bg-emerald-400"
                >
                  <Upload className="h-4 w-4" />
                  {lang === 'id' ? 'Pilih Foto Dokumen / KTP' : 'Select Document Image'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWatermarkConfig((prev) => ({
                      ...prev,
                      rotation: ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    }))
                  }
                  title={lang === 'id' ? 'Putar 90 Derajat' : 'Rotate 90 Degrees'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>90°</span>
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
                {isSampleLoaded && (
                  <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    {lang === 'id' ? 'MODE CONTOH SIMULASI' : 'SIMULATION SAMPLE'}
                  </span>
                )}
                <span>
                  {sourceDimensions.width}×{sourceDimensions.height}px
                </span>
              </div>
            </div>

            {/* Canvas Viewport */}
            <div
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              className={`canvas-checkered relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-800 p-3 sm:min-h-[410px] ${
                activeTab === 'redact' ? 'cursor-crosshair select-none' : ''
              }`}
            >
              {activeTab === 'compress' && compressionResult ? (
                <div className="relative flex flex-col items-center">
                  <img
                    src={compressionResult.dataUrl}
                    alt="Pratinjau Hasil Kompresi & Pasfoto"
                    className="max-h-[420px] w-auto rounded-lg object-contain shadow-2xl"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                    <span className="rounded-lg border border-slate-700 bg-slate-900/90 px-2.5 py-1 text-slate-300">
                      {lang === 'id' ? 'Awal:' : 'Original:'}{' '}
                      <strong>{formatBytes(compressionResult.originalBytes)}</strong>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="rounded-lg border border-emerald-500/40 bg-emerald-950/80 px-2.5 py-1 font-bold text-emerald-300">
                      {lang === 'id' ? 'Hasil:' : 'Output:'}{' '}
                      {formatBytes(compressionResult.compressedBytes)} (Q:{compressionResult.qualityUsed}%)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block max-w-full">
                  <canvas
                    ref={previewCanvasRef}
                    className="block max-h-[420px] w-auto max-w-full rounded-lg object-contain shadow-2xl"
                  />

                  {/* Live Redaction Draft Box Overlay */}
                  {activeTab === 'redact' && draftBox && (
                    <div
                      style={{
                        left: `${draftBox.x * 100}%`,
                        top: `${draftBox.y * 100}%`,
                        width: `${draftBox.width * 100}%`,
                        height: `${draftBox.height * 100}%`,
                      }}
                      className="pointer-events-none absolute border-2 border-dashed border-rose-400 bg-rose-500/25"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Canvas Bottom Action & Pipeline Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'compress' && compressionResult ? (
                  <button
                    type="button"
                    onClick={handleDownloadCompressed}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-400"
                  >
                    <Download className="h-4 w-4" />
                    {lang === 'id'
                      ? `Unduh JPG (${formatBytes(compressionResult.compressedBytes)})`
                      : `Download JPG (${formatBytes(compressionResult.compressedBytes)})`}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDownloadProtectedImage('jpeg')}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-400"
                    >
                      <Download className="h-4 w-4" />
                      {lang === 'id' ? 'Unduh JPG Aman' : 'Download Safe JPG'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProtectedImage('png')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PNG
                    </button>
                  </>
                )}
              </div>

              {/* Pipeline Chaining Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'watermark' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('redact')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <span>{lang === 'id' ? 'Lanjut ke Sensor NIK' : 'Next: Redact ID'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {activeTab === 'redact' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('compress')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2.5 text-xs font-bold text-sky-300 transition hover:bg-sky-500/20"
                  >
                    <span>{lang === 'id' ? 'Lanjut Kompres KB' : 'Next: Target KB'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800/90 px-3.5 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                  <span>{lang === 'id' ? 'Masukkan ke PDF' : 'Add to PDF Queue'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Context-Specific Studio Controls (5 cols) */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl sm:p-6 lg:col-span-5">
            {/* TAB 1: WATERMARK CONTROLS */}
            {activeTab === 'watermark' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div>
                    <h2 className="text-base font-bold text-white">
                      {lang === 'id'
                        ? 'Pengaturan Watermark Dokumen'
                        : 'Document Watermark Controls'}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {lang === 'id'
                        ? 'Cegah penyalahgunaan foto KTP untuk pinjol atau akun palsu.'
                        : 'Prevent unauthorized reuse of your ID card scan.'}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-800 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span className="font-mono text-xs font-bold text-emerald-400">
                      {watermarkEnabled ? 'AKTIF' : 'NONAKTIF'}
                    </span>
                  </label>
                </div>

                {/* Quick Purpose Templates */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'id' ? 'Template Tujuan Cepat' : 'Quick Purpose Presets'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WATERMARK_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() =>
                          setWatermarkConfig((prev) => ({
                            ...prev,
                            text: lang === 'id' ? preset.textId : preset.textEn,
                          }))
                        }
                        className="rounded-lg border border-slate-700/80 bg-slate-800/70 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/50 hover:bg-emerald-500/10 hover:text-emerald-300"
                      >
                        {lang === 'id' ? preset.labelId : preset.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Main Watermark Text & Subtext */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="wm-main-text"
                      className="mb-1 block text-xs font-semibold text-slate-300"
                    >
                      {lang === 'id' ? 'Teks Utama Watermark' : 'Primary Watermark Text'}
                    </label>
                    <input
                      id="wm-main-text"
                      type="text"
                      value={watermarkConfig.text}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, text: e.target.value }))
                      }
                      placeholder="HANYA UNTUK VERIFIKASI..."
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="wm-sub-text"
                      className="mb-1 block text-xs font-semibold text-slate-300"
                    >
                      {lang === 'id'
                        ? 'Baris Kedua (Tanggal / Nama Instansi)'
                        : 'Secondary Line (Date / Institution)'}
                    </label>
                    <input
                      id="wm-sub-text"
                      type="text"
                      value={watermarkConfig.subtext || ''}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, subtext: e.target.value }))
                      }
                      placeholder={`TANGGAL: ${todayStr}`}
                      className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Pattern Mode & Color */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                      {lang === 'id' ? 'Pola Segel' : 'Stamp Pattern'}
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { id: 'tiled', labelId: 'Rapat', labelEn: 'Tiled' },
                          { id: 'single', labelId: 'Stempel', labelEn: 'Stamp' },
                          { id: 'banner', labelId: 'Pita', labelEn: 'Banner' },
                        ] as { id: WatermarkMode; labelId: string; labelEn: string }[]
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() =>
                            setWatermarkConfig((prev) => ({ ...prev, mode: m.id }))
                          }
                          className={`rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
                            watermarkConfig.mode === m.id
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                              : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                          }`}
                        >
                          {lang === 'id' ? m.labelId : m.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                      {lang === 'id' ? 'Warna Tinta Segel' : 'Ink Color'}
                    </label>
                    <div className="flex items-center gap-2 pt-1">
                      {WATERMARK_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          title={c.label}
                          onClick={() =>
                            setWatermarkConfig((prev) => ({ ...prev, color: c.hex }))
                          }
                          style={{ backgroundColor: c.hex }}
                          className={`h-6 w-6 rounded-full border transition ${
                            watermarkConfig.color === c.hex
                              ? 'scale-110 border-white ring-2 ring-emerald-400'
                              : 'border-slate-600 opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sliders: Opacity, Angle, Size, Spacing */}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-400">
                        {lang === 'id' ? 'Transparansi' : 'Opacity'}
                      </span>
                      <span className="font-mono text-slate-200">
                        {Math.round(watermarkConfig.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.85"
                      step="0.05"
                      value={watermarkConfig.opacity}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          opacity: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-400">
                        {lang === 'id' ? 'Kemiringan' : 'Angle'}
                      </span>
                      <span className="font-mono text-slate-200">
                        {watermarkConfig.angle}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-55"
                      max="55"
                      step="5"
                      value={watermarkConfig.angle}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          angle: parseInt(e.target.value, 10),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-400">
                        {lang === 'id' ? 'Ukuran Huruf' : 'Font Scale'}
                      </span>
                      <span className="font-mono text-slate-200">
                        {Math.round(watermarkConfig.fontSizeScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.6"
                      max="1.8"
                      step="0.1"
                      value={watermarkConfig.fontSizeScale}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          fontSizeScale: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>

                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-400">
                        {lang === 'id' ? 'Jarak Antar Teks' : 'Grid Spacing'}
                      </span>
                      <span className="font-mono text-slate-200">
                        {Math.round(watermarkConfig.spacingScale * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.7"
                      max="1.7"
                      step="0.1"
                      value={watermarkConfig.spacingScale}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({
                          ...prev,
                          spacingScale: parseFloat(e.target.value),
                        }))
                      }
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>

                {/* Security Tip Note */}
                <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 p-3 text-xs text-sky-200">
                  <strong>Tips Kominfo & Keamanan Data:</strong> Letakkan watermark memotong
                  bagian tengah KTP (bukan hanya di pinggir kosong) agar tidak bisa di-crop
                  oleh pihak tidak bertanggung jawab.
                </div>
              </div>
            )}

            {/* TAB 2: REDACTION & BLUR CONTROLS */}
            {activeTab === 'redact' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white">
                    {lang === 'id'
                      ? 'Sensor & Redaksi Data Sensitif'
                      : 'Sensitive Data Redaction'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {lang === 'id'
                      ? 'Klik & seret langsung pada gambar di sebelah kiri untuk menutup NIK, nomor KK, atau tanda tangan.'
                      : 'Click & drag directly on the image to mask ID numbers, signatures, or faces.'}
                  </p>
                </div>

                {/* Redaction Style Selector */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'id' ? 'Metode Sensor Piksel' : 'Redaction Style'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        { id: 'pixelate', labelId: 'Mozaik Piksel', labelEn: 'Pixelate' },
                        { id: 'blur', labelId: 'Blur Halus', labelEn: 'Gaussian Blur' },
                        { id: 'blackout', labelId: 'Blok Hitam', labelEn: 'Blackout' },
                        { id: 'whiteout', labelId: 'Blok Putih', labelEn: 'Whiteout' },
                      ] as { id: RedactionStyle; labelId: string; labelEn: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setActiveRedactionStyle(st.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          activeRedactionStyle === st.id
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {lang === 'id' ? st.labelId : st.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* One-Click KTP Area Presets */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'id'
                      ? 'Sensor Cepat Posisi KTP Standar'
                      : 'Quick Standard ID Mask Presets'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('nik')}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <span>{lang === 'id' ? '+ Sensor Baris NIK' : '+ Mask ID Number'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-emerald-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('signature')}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <span>{lang === 'id' ? '+ Sensor Tanda Tangan' : '+ Mask Signature'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-emerald-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('address')}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <span>{lang === 'id' ? '+ Sensor Nomor Rumah' : '+ Mask Street Address'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-emerald-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('photo')}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-emerald-500/50 hover:text-emerald-300"
                    >
                      <span>{lang === 'id' ? '+ Sensor Pasfoto Wajah' : '+ Mask Face Photo'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-emerald-400" />
                    </button>
                  </div>
                </div>

                {/* Active Redaction List */}
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">
                      {lang === 'id'
                        ? `Daftar Area Disensor (${redactions.length})`
                        : `Active Redaction Masks (${redactions.length})`}
                    </span>
                    {redactions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRedactions([])}
                        className="text-xs font-semibold text-rose-400 hover:underline"
                      >
                        {lang === 'id' ? 'Hapus Semua' : 'Clear All'}
                      </button>
                    )}
                  </div>

                  {redactions.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-500">
                      {lang === 'id'
                        ? 'Belum ada area sensor. Klik & seret kursor pada gambar dokumen atau gunakan tombol cepat di atas.'
                        : 'No redaction areas yet. Click & drag on the document preview or use the quick preset buttons above.'}
                    </p>
                  ) : (
                    <ul className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                      {redactions.map((box, i) => (
                        <li
                          key={box.id}
                          className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs"
                        >
                          <span className="font-mono text-slate-300">
                            #{i + 1} • {box.style.toUpperCase()} ({Math.round(box.width * 100)}%×
                            {Math.round(box.height * 100)}%)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRedactions((prev) => prev.filter((r) => r.id !== box.id))
                            }
                            className="text-slate-400 hover:text-rose-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <strong>Irreversible Raster Destruction:</strong> Area yang Anda sensor
                  dihancurkan pada tingkat piksel sebelum diunduh, sehingga tidak bisa
                  dikembalikan (un-blur) oleh aplikasi pihak ketiga.
                </div>
              </div>
            )}

            {/* TAB 3: TARGET KB COMPRESSOR & PASFOTO CONTROLS */}
            {activeTab === 'compress' && (
              <div className="space-y-5">
                <div className="border-b border-slate-800 pb-3">
                  <h2 className="text-base font-bold text-white">
                    {lang === 'id'
                      ? 'Kompresor Target KB & Rasio Pasfoto'
                      : 'Target KB Compressor & ID Photo Crop'}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {lang === 'id'
                      ? 'Sesuaikan ukuran kilobyte secara presisi untuk syarat portal SSCASN/CPNS, BUMN, atau HRD.'
                      : 'Fit strict portal file-size limits (100KB, 200KB, 300KB) and standard photo ratios.'}
                  </p>
                </div>

                {/* Strict Target KB Selector */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'id'
                      ? 'Batas Maksimal Ukuran File (Target KB)'
                      : 'Maximum File Size Limit (Target KB)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 200, 300, 500].map((kb) => (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => setTargetKb(kb)}
                        className={`rounded-xl border py-2 font-mono text-xs font-bold transition ${
                          targetKb === kb
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        ≤ {kb} KB
                      </button>
                    ))}
                  </div>

                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-slate-400">
                        {lang === 'id' ? 'Atur Target Kustom:' : 'Custom KB Target:'}
                      </span>
                      <span className="font-mono font-bold text-emerald-400">{targetKb} KB</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="800"
                      step="10"
                      value={targetKb}
                      onChange={(e) => setTargetKb(parseInt(e.target.value, 10))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                </div>

                {/* Aspect Ratio / Pasfoto Preset */}
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                    {lang === 'id' ? 'Potong Rasio Dokumen / Pasfoto' : 'Aspect Ratio Crop'}
                  </label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(
                      [
                        { id: 'original', labelId: 'Asli', labelEn: 'Original' },
                        { id: 'ktp', labelId: 'KTP', labelEn: 'ID Card' },
                        { id: '3x4', labelId: '3×4', labelEn: '3×4' },
                        { id: '4x6', labelId: '4×6', labelEn: '4×6' },
                        { id: '1x1', labelId: '1×1', labelEn: '1×1' },
                      ] as { id: CropPreset; labelId: string; labelEn: string }[]
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCropPreset(preset.id)}
                        className={`rounded-xl border py-2 text-xs font-bold transition ${
                          cropPreset === preset.id
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {lang === 'id' ? preset.labelId : preset.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Background Fill Color (For transparent PNG pasfoto) */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-300">
                    {lang === 'id'
                      ? 'Warna Latar Pasfoto (Jika PNG Transparan)'
                      : 'Backdrop Fill (For Transparent PNGs)'}
                  </label>
                  <div className="flex items-center gap-2">
                    {[
                      { id: 'red', label: 'Merah CPNS (#dc2626)', hex: '#dc2626' },
                      { id: 'blue', label: 'Biru Resmi (#0284c7)', hex: '#0284c7' },
                      { id: 'white', label: 'Putih Bersih (#ffffff)', hex: '#ffffff' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setPasfotoBg(bg.hex)}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                          pasfotoBg === bg.hex
                            ? 'border-emerald-500 bg-slate-800 text-white'
                            : 'border-slate-700 bg-slate-900 text-slate-400'
                        }`}
                      >
                        <span
                          style={{ backgroundColor: bg.hex }}
                          className="h-3.5 w-3.5 rounded-full border border-slate-600"
                        />
                        <span>{bg.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compression Telemetry Box */}
                {compressionResult && (
                  <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-xs uppercase text-slate-400">
                        {lang === 'id' ? 'Hasil Optimasi' : 'Optimization Result'}
                      </span>
                      <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 font-mono text-xs font-bold text-emerald-300">
                        {compressionResult.compressedBytes <= targetKb * 1024
                          ? lang === 'id'
                            ? 'LOLOS BATAS KB'
                            : 'TARGET MET'
                          : lang === 'id'
                            ? 'KOMPRESI MAKSIMAL'
                            : 'MAX COMPRESSED'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="rounded-lg bg-slate-900 p-2">
                        <div className="text-[10px] text-slate-500">UKURAN AKHIR</div>
                        <div className="font-bold text-emerald-400">
                          {formatBytes(compressionResult.compressedBytes)}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-2">
                        <div className="text-[10px] text-slate-500">RESOLUSI</div>
                        <div className="font-bold text-slate-200">
                          {compressionResult.width}×{compressionResult.height}
                        </div>
                      </div>
                      <div className="rounded-lg bg-slate-900 p-2">
                        <div className="text-[10px] text-slate-500">KUALITAS JPG</div>
                        <div className="font-bold text-sky-400">
                          {compressionResult.qualityUsed}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* TAB 4: PDF MERGER & BUILDER WORKSPACE */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl sm:p-6 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  {lang === 'id'
                    ? 'Antrean Gabung Dokumen PDF (100% Lokal)'
                    : 'Local PDF Document Merge Queue'}
                </h2>
                <p className="text-xs text-slate-400">
                  {lang === 'id'
                    ? 'Gabungkan KTP, NPWP, Ijazah, CV, atau PDF lain menjadi satu berkas PDF siap unggah.'
                    : 'Combine ID cards, certificates, or existing PDFs into a single clean PDF file.'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {lang === 'id' ? '+ Dokumen Studio Saat Ini' : '+ Current Studio Image'}
                </button>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'id' ? 'Tambah Gambar / PDF' : 'Add Images / PDFs'}
                </button>
              </div>
            </div>

            {pdfQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/50 px-6 py-12 text-center">
                <Layers className="mb-3 h-10 w-10 text-slate-500" />
                <p className="mb-1 text-sm font-semibold text-slate-300">
                  {lang === 'id'
                    ? 'Antrean PDF masih kosong'
                    : 'Your PDF merge queue is empty'}
                </p>
                <p className="mb-4 max-w-md text-xs text-slate-400">
                  {lang === 'id'
                    ? 'Anda dapat memasukkan hasil KTP ber-watermark dari studio atau memilih beberapa file JPG/PNG/PDF dari perangkat Anda.'
                    : 'Add your watermarked ID card from the studio or select multiple JPG/PNG/PDF files from your device.'}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={handleSendCurrentToPdfQueue}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400"
                  >
                    {lang === 'id'
                      ? 'Masukkan KTP dari Studio'
                      : 'Insert Current Studio ID Card'}
                  </button>
                  <button
                    type="button"
                    onClick={() => pdfFileInputRef.current?.click()}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                  >
                    {lang === 'id' ? 'Pilih File dari Perangkat' : 'Browse Device Files'}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {pdfQueue.map((item, idx) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/80 p-3"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 font-mono text-xs font-bold text-slate-300">
                        {idx + 1}
                      </span>
                      {item.type === 'image' && item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="h-10 w-14 shrink-0 rounded border border-slate-700 object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-800 text-rose-400">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-200">
                          {item.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {item.type.toUpperCase()} • {formatBytes(item.sizeBytes)}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => movePdfQueueItem(idx, -1)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                        title="Naikkan urutan"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pdfQueue.length - 1}
                        onClick={() => movePdfQueueItem(idx, 1)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-30"
                        title="Turunkan urutan"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePdfQueueItem(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
                        title="Hapus"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* PDF Layout & Export Column */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/75 p-5 shadow-xl sm:p-6 lg:col-span-5">
            <div className="space-y-5">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white">
                  {lang === 'id' ? 'Tata Letak Halaman PDF' : 'PDF Page Layout'}
                </h3>
                <p className="text-xs text-slate-400">
                  {lang === 'id'
                    ? 'Pilih format penyusunan dokumen di dalam halaman PDF.'
                    : 'Select how images are arranged on each PDF page.'}
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: 'a4-id-cards' as PdfPageLayout,
                    titleId: 'KTP + NPWP Satu Halaman A4 (2 Kartu/Halaman)',
                    titleEn: '2 ID Cards per A4 Page (KTP + NPWP Layout)',
                    descId:
                      'Ideal untuk lampiran administrasi bank/HRD: menyusun 2 kartu identitas secara proporsional di 1 lembar A4.',
                    descEn:
                      'Places up to 2 ID cards neatly centered on a single A4 portrait sheet.',
                  },
                  {
                    id: 'a4-portrait' as PdfPageLayout,
                    titleId: 'Dokumen A4 Standar (1 Gambar/Halaman)',
                    titleEn: 'Standard A4 Portrait (1 Image per Page)',
                    descId:
                      'Cocok untuk Ijazah, Transkrip Nilai, Surat Keterangan, atau KK dengan margin rapi.',
                    descEn:
                      'Centers each document scan on a standard A4 portrait page with clean margins.',
                  },
                  {
                    id: 'fit-image' as PdfPageLayout,
                    titleId: 'Sesuai Ukuran Asli Gambar (Tanpa Margin)',
                    titleEn: 'Fit Exact Image Dimensions (Zero Margin)',
                    descId:
                      'Ukuran halaman PDF mengikuti resolusi persis masing-masing gambar.',
                    descEn: 'Each PDF page matches the exact pixel dimensions of the image.',
                  },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPdfLayout(opt.id);
                      setPdfDownloadUrl(null);
                    }}
                    className={`w-full rounded-xl border p-3.5 text-left transition ${
                      pdfLayout === opt.id
                        ? 'border-emerald-500 bg-emerald-500/10 text-white'
                        : 'border-slate-800 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold">
                      {lang === 'id' ? opt.titleId : opt.titleEn}
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      {lang === 'id' ? opt.descId : opt.descEn}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t border-slate-800 pt-4">
              <button
                type="button"
                disabled={pdfQueue.length === 0 || isBuildingPdf}
                onClick={handleGenerateCombinedPdf}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-bold text-slate-950 shadow-lg shadow-emerald-950/50 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileStack className="h-4 w-4" />
                {isBuildingPdf
                  ? lang === 'id'
                    ? 'Memproses PDF di Browser...'
                    : 'Building PDF in Browser...'
                  : lang === 'id'
                    ? `Proses & Gabungkan PDF (${pdfQueue.length} Berkas)`
                    : `Build Combined PDF (${pdfQueue.length} Files)`}
              </button>

              {pdfDownloadUrl && (
                <a
                  href={pdfDownloadUrl}
                  download={`berkas-amandok-${todayStr}.pdf`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/50 bg-sky-500/20 px-4 py-3 text-xs font-bold text-sky-200 transition hover:bg-sky-500/30"
                >
                  <Download className="h-4 w-4" />
                  {lang === 'id'
                    ? `Unduh PDF Gabungan (${formatBytes(pdfSizeBytes)})`
                    : `Download Combined PDF (${formatBytes(pdfSizeBytes)})`}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
