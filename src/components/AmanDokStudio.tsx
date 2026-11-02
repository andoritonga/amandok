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
  ShieldCheck,
  Crosshair,
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
    labelEn: 'Bank / Mortgage',
    textId: 'HANYA UNTUK VERIFIKASI BANK',
    textEn: 'FOR BANK VERIFICATION ONLY',
  },
  {
    id: 'hrd',
    labelId: 'Lamaran Kerja / HRD',
    labelEn: 'HR Recruitment',
    textId: 'KHUSUS REKRUTMEN HRD PERUSAHAAN',
    textEn: 'FOR HR RECRUITMENT ONLY',
  },
  {
    id: 'cpns',
    labelId: 'Seleksi CPNS / BUMN',
    labelEn: 'SSCASN / SOE Portal',
    textId: 'KHUSUS PENDAFTARAN SSCASN / BUMN',
    textEn: 'FOR SSCASN / SOE REGISTRATION ONLY',
  },
  {
    id: 'rental',
    labelId: 'Sewa Properti / Kos',
    labelEn: 'Property Rental',
    textId: 'HANYA UNTUK ADMINISTRASI SEWA',
    textEn: 'FOR RENTAL ADMINISTRATION ONLY',
  },
  {
    id: 'telco',
    labelId: 'Registrasi Mitra Resmi',
    labelEn: 'Partner Onboarding',
    textId: 'VERIFIKASI MITRA RESMI — DILARANG MENYALAHGUNAKAN',
    textEn: 'OFFICIAL PARTNER VERIFICATION ONLY',
  },
];

const WATERMARK_COLORS = [
  { id: 'crimson', label: 'Merah Segel (#e11d48)', hex: '#e11d48' },
  { id: 'cobalt', label: 'Biru Resmi (#0284c7)', hex: '#0284c7' },
  { id: 'emerald', label: 'Hijau Verifikasi (#059669)', hex: '#059669' },
  { id: 'slate', label: 'Hitam Arsip (#0f172a)', hex: '#0f172a' },
  { id: 'amber', label: 'Kuning Otorisasi (#d97706)', hex: '#d97706' },
  { id: 'white', label: 'Putih Kontras (#f8fafc)', hex: '#f8fafc' },
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
    }, 3200);
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
        ? 'Contoh KTP simulasi berhasil dimuat.'
        : 'Simulated sample ID card loaded.'
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
          ? 'Dokumen dimuat secara lokal & metadata EXIF/GPS telah dibersihkan.'
          : 'Document loaded locally & camera EXIF/GPS metadata stripped.'
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal membaca berkas gambar. Gunakan format JPG, PNG, atau WebP.'
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
        ? 'Area sensor ditambahkan. Anda juga bisa klik & seret langsung pada gambar.'
        : 'Redaction zone added. You can also click & drag directly on the image.'
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
        ? 'Dokumen berhasil diunduh ke perangkat Anda!'
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
        ? `Berkas terkompresi (${formatBytes(compressionResult.compressedBytes)}) berhasil diunduh!`
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
        ? 'Dokumen ditambahkan ke antrean PDF A4!'
        : 'Document added to A4 PDF queue!'
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
          ? `${addedItems.length} berkas ditambahkan ke antrean PDF.`
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
          ? 'Dokumen PDF A4 berhasil digabungkan!'
          : 'Combined A4 PDF generated!'
      );
    } catch (err) {
      console.error(err);
      showToast(
        lang === 'id'
          ? 'Terjadi kesalahan saat menggabungkan PDF.'
          : 'An error occurred while generating the PDF.'
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
        ? 'Memori sesi dibersihkan & dikembalikan ke contoh awal.'
        : 'Session memory cleared & reset to sample.'
    );
  };

  return (
    <div className="relative">
      {/* Clean Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-slate-900/95 px-4 py-3 text-xs font-semibold text-white shadow-xl backdrop-blur-md dark:border-emerald-500/40"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Compact Top Status & Quick Action Bar */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                {lang === 'id'
                  ? 'Pemrosesan Lokal Aktif (0 KB Upload)'
                  : 'Local Processing Active (0 KB Upload)'}
              </span>
              <span className="hidden items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 sm:inline-flex">
                <WifiOff className="h-3 w-3" />
                {lang === 'id' ? 'Siap Offline' : 'Offline Ready'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {lang === 'id' ? 'Berkas: ' : 'Active file: '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {sourceFileName}
              </span>{' '}
              <span className="font-mono text-[11px] text-slate-400">
                ({sourceDimensions.width}×{sourceDimensions.height}px • EXIF Bersih)
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleLoadSampleKtp}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Sparkles className="h-3.5 w-3.5 text-sky-500" />
            {lang === 'id' ? 'Contoh KTP' : 'Sample ID'}
          </button>

          <button
            type="button"
            onClick={handleWipeSessionMemory}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {lang === 'id' ? 'Reset Sesi' : 'Reset Session'}
          </button>
        </div>
      </div>

      {/* Clean 4-Step Studio Pipeline Tabs */}
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
            titleId: 'Sensor NIK & TTD',
            titleEn: 'Redact & Blur',
            descId: 'Tutup data sensitif',
            descEn: 'Mask sensitive areas',
            icon: EyeOff,
            badge: redactions.length > 0 ? `${redactions.length}` : null,
          },
          {
            id: 'compress' as StudioTab,
            step: '03',
            titleId: 'Target KB & Pasfoto',
            titleEn: 'Target KB & Crop',
            descId: 'Kompres & rasio 3×4',
            descEn: 'Exact KB & 3×4 crop',
            icon: Minimize2,
            badge: `≤${targetKb}KB`,
          },
          {
            id: 'pdf' as StudioTab,
            step: '04',
            titleId: 'Gabung PDF A4',
            titleEn: 'Merge to PDF',
            descId: 'Susun berkas ke A4',
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
              className={`group relative flex flex-col justify-between rounded-2xl border p-3.5 text-left transition-all ${
                isActive
                  ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/20 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                  : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-900'
              }`}
            >
              <div className="mb-2.5 flex w-full items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                      isActive
                        ? 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-slate-950'
                        : 'bg-slate-100 text-slate-500 group-hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                    {tab.step}
                  </span>
                </div>
                {tab.badge && (
                  <span
                    className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-bold ${
                      isActive
                        ? 'bg-emerald-600/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </div>
              <div>
                <div
                  className={`text-sm font-bold ${
                    isActive
                      ? 'text-emerald-950 dark:text-white'
                      : 'text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {lang === 'id' ? tab.titleId : tab.titleEn}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
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

      {/* Main Studio Workspace */}
      {activeTab !== 'pdf' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: Clean Document Canvas Preview (7 columns) */}
          <div className="flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:p-5 lg:col-span-7">
            {/* Top Canvas Action Bar */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 pb-3.5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'id' ? 'Pilih Foto KTP / Dokumen' : 'Select ID / Document Photo'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWatermarkConfig((prev) => ({
                      ...prev,
                      rotation: ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    }))
                  }
                  title={lang === 'id' ? 'Putar 90°' : 'Rotate 90°'}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>90°</span>
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                {isSampleLoaded && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-sans text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                    {lang === 'id' ? 'Contoh Simulasi' : 'Sample Mode'}
                  </span>
                )}
                <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                  {sourceDimensions.width}×{sourceDimensions.height}px
                </span>
              </div>
            </div>

            {/* Central Document Viewport */}
            <div
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              className={`canvas-backdrop relative flex min-h-[300px] flex-1 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 p-4 dark:border-slate-800 sm:min-h-[410px] ${
                activeTab === 'redact' ? 'cursor-crosshair select-none' : ''
              }`}
            >
              {/* Active Redaction Helper Pill */}
              {activeTab === 'redact' && (
                <div className="pointer-events-none absolute top-3 z-10 flex items-center gap-1.5 rounded-full border border-slate-700/80 bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-white shadow-md backdrop-blur-sm">
                  <Crosshair className="h-3.5 w-3.5 text-emerald-400" />
                  <span>
                    {lang === 'id'
                      ? 'Klik & seret pada area NIK atau tanda tangan untuk menyensor'
                      : 'Click & drag over ID number or signature to redact'}
                  </span>
                </div>
              )}

              {activeTab === 'compress' && compressionResult ? (
                <div className="relative flex flex-col items-center">
                  <img
                    src={compressionResult.dataUrl}
                    alt="Pratinjau Hasil Kompresi & Pasfoto"
                    className="max-h-[380px] w-auto rounded-lg object-contain shadow-lg"
                  />
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                      {lang === 'id' ? 'Awal:' : 'Raw:'}{' '}
                      <strong>{formatBytes(compressionResult.originalBytes)}</strong>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="rounded-lg border border-emerald-500/30 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                      {lang === 'id' ? 'Hasil:' : 'Output:'}{' '}
                      {formatBytes(compressionResult.compressedBytes)} (Q:{compressionResult.qualityUsed}%)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block max-w-full overflow-hidden rounded-lg shadow-lg">
                  <canvas
                    ref={previewCanvasRef}
                    className="block max-h-[390px] w-auto max-w-full object-contain"
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
                      className="pointer-events-none absolute rounded border-2 border-dashed border-rose-500 bg-rose-500/25"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Bottom Export & Step Chaining Bar */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-slate-100 pt-3.5 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'compress' && compressionResult ? (
                  <button
                    type="button"
                    onClick={handleDownloadCompressed}
                    className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
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
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                    >
                      <Download className="h-4 w-4" />
                      {lang === 'id' ? 'Unduh JPG' : 'Download JPG'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProtectedImage('png')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <Download className="h-3.5 w-3.5" />
                      PNG
                    </button>
                  </>
                )}
              </div>

              {/* Pipeline Chaining Controls */}
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'watermark' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('redact')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span>{lang === 'id' ? 'Lanjut Sensor' : 'Next: Redact'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {activeTab === 'redact' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('compress')}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <span>{lang === 'id' ? 'Lanjut Kompres KB' : 'Next: Target KB'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lang === 'id' ? 'Masukkan ke PDF' : 'Add to PDF'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: Clean Control Sidebar (5 columns) */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:p-6 lg:col-span-5">
            {/* TAB 1: WATERMARK CONTROLS */}
            {activeTab === 'watermark' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3.5 dark:border-slate-800">
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-white">
                      {lang === 'id' ? 'Pengaturan Watermark KTP' : 'Watermark Settings'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Beri keterangan tujuan agar KTP tidak disalahgunakan'
                        : 'Stamp verification purpose over your ID card'}
                    </p>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 rounded accent-emerald-600"
                    />
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      {watermarkEnabled ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </label>
                </div>

                {/* Quick Purpose Presets */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id' ? 'Preset Keperluan Cepat' : 'Quick Purpose Presets'}
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WATERMARK_PRESETS.map((preset) => {
                      const targetText = lang === 'id' ? preset.textId : preset.textEn;
                      const isSelected = watermarkConfig.text === targetText;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() =>
                            setWatermarkConfig((prev) => ({
                              ...prev,
                              text: targetText,
                            }))
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                            isSelected
                              ? 'border-emerald-500 bg-emerald-500/10 font-semibold text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700/80 dark:bg-slate-800/60 dark:text-slate-300 dark:hover:bg-slate-800'
                          }`}
                        >
                          {lang === 'id' ? preset.labelId : preset.labelEn}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Main Watermark Text & Subtext Inputs */}
                <div className="space-y-3">
                  <div>
                    <label
                      htmlFor="wm-main-text"
                      className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {lang === 'id' ? 'Teks Watermark Utama' : 'Primary Watermark Text'}
                    </label>
                    <input
                      id="wm-main-text"
                      type="text"
                      value={watermarkConfig.text}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, text: e.target.value }))
                      }
                      placeholder="HANYA UNTUK VERIFIKASI..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-white dark:focus:border-emerald-500 dark:focus:bg-slate-900"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="wm-sub-text"
                      className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                    >
                      {lang === 'id'
                        ? 'Baris Kedua (Tanggal / Penerima)'
                        : 'Secondary Line (Date / Recipient)'}
                    </label>
                    <input
                      id="wm-sub-text"
                      type="text"
                      value={watermarkConfig.subtext || ''}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, subtext: e.target.value }))
                      }
                      placeholder={`TANGGAL: ${todayStr}`}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2 text-xs text-slate-800 placeholder-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-200 dark:focus:border-emerald-500 dark:focus:bg-slate-900"
                    />
                  </div>
                </div>

                {/* Pattern Mode & Ink Color */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'id' ? 'Pola Watermark' : 'Watermark Pattern'}
                    </label>
                    <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-800/70">
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
                          className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                            watermarkConfig.mode === m.id
                              ? 'bg-white text-slate-900 shadow-sm dark:bg-emerald-500 dark:text-slate-950'
                              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                          }`}
                        >
                          {lang === 'id' ? m.labelId : m.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'id' ? 'Warna Teks' : 'Text Color'}
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
                          className={`h-7 w-7 rounded-full border border-slate-300 transition dark:border-slate-600 ${
                            watermarkConfig.color === c.hex
                              ? 'scale-110 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Clean Sliders Card */}
                <div className="grid grid-cols-2 gap-4 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Transparansi' : 'Opacity'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
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
                      className="clean-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Kemiringan' : 'Angle'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
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
                      className="clean-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Ukuran Huruf' : 'Font Size'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
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
                      className="clean-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Kerapatan' : 'Spacing'}
                      </span>
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-200">
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
                      className="clean-slider w-full"
                    />
                  </div>
                </div>

                {/* Clean Tip */}
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <strong className="text-emerald-700 dark:text-emerald-400">Tips Aman:</strong>{' '}
                  Pastikan teks watermark melewati area data KTP (bukan di pinggir kosong) agar
                  tidak mudah dipotong oleh pihak tidak bertanggung jawab.
                </div>
              </div>
            )}

            {/* TAB 2: REDACTION & BLUR CONTROLS */}
            {activeTab === 'redact' && (
              <div className="space-y-5">
                <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'id'
                      ? 'Sensor Permanen NIK & Tanda Tangan'
                      : 'Permanent Pixel Redaction'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'id'
                      ? 'Klik & seret langsung pada gambar di sebelah kiri, atau gunakan tombol cepat di bawah.'
                      : 'Click & drag directly on the image, or use the quick preset buttons below.'}
                  </p>
                </div>

                {/* Redaction Method Selector */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id' ? 'Gaya Sensor' : 'Redaction Style'}
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    {(
                      [
                        { id: 'pixelate', labelId: 'Mozaik', labelEn: 'Pixelate' },
                        { id: 'blur', labelId: 'Blur', labelEn: 'Blur' },
                        { id: 'blackout', labelId: 'Hitam', labelEn: 'Blackout' },
                        { id: 'whiteout', labelId: 'Putih', labelEn: 'Whiteout' },
                      ] as { id: RedactionStyle; labelId: string; labelEn: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setActiveRedactionStyle(st.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          activeRedactionStyle === st.id
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {lang === 'id' ? st.labelId : st.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* One-Click Standard KTP Coordinate Masks */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Pintasan Area KTP Standar'
                      : 'Quick ID Card Area Presets'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('nik')}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span>{lang === 'id' ? '+ Baris NIK' : '+ ID Number'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('signature')}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span>{lang === 'id' ? '+ Tanda Tangan' : '+ Signature'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('address')}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span>{lang === 'id' ? '+ Alamat Rumah' : '+ Address Line'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('photo')}
                      className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 hover:bg-emerald-50/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    >
                      <span>{lang === 'id' ? '+ Foto Wajah' : '+ Portrait'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </div>
                </div>

                {/* Active Redaction Zones List */}
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {lang === 'id'
                        ? `Area Disensor (${redactions.length})`
                        : `Redacted Zones (${redactions.length})`}
                    </span>
                    {redactions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRedactions([])}
                        className="text-xs font-semibold text-rose-600 hover:underline dark:text-rose-400"
                      >
                        {lang === 'id' ? 'Hapus Semua' : 'Clear All'}
                      </button>
                    )}
                  </div>

                  {redactions.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-400">
                      {lang === 'id'
                        ? 'Belum ada area sensor. Klik & seret kursor di atas gambar.'
                        : 'No redaction zones yet. Click & drag over the image.'}
                    </p>
                  ) : (
                    <ul className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                      {redactions.map((box, i) => (
                        <li
                          key={box.id}
                          className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                        >
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            Area #{i + 1} •{' '}
                            <span className="font-mono text-[11px] uppercase text-slate-500">
                              {box.style}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRedactions((prev) => prev.filter((r) => r.id !== box.id))
                            }
                            className="text-slate-400 transition hover:text-rose-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                  <strong className="text-emerald-700 dark:text-emerald-400">
                    Sensor Permanen:
                  </strong>{' '}
                  Piksel di bawah area sensor dilebur langsung ke dalam gambar sehingga tidak bisa
                  dibuka kembali.
                </div>
              </div>
            )}

            {/* TAB 3: TARGET KB COMPRESSOR & PASFOTO CONTROLS */}
            {activeTab === 'compress' && (
              <div className="space-y-5">
                <div className="border-b border-slate-100 pb-3.5 dark:border-slate-800">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white">
                    {lang === 'id'
                      ? 'Kompres Ukuran KB & Rasio Pasfoto'
                      : 'Target KB Compression & Aspect Crop'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {lang === 'id'
                      ? 'Sesuaikan batas ukuran unggahan portal SSCASN/CPNS, BUMN, dan HRD.'
                      : 'Fit strict portal upload caps (100KB, 200KB, 300KB) automatically.'}
                  </p>
                </div>

                {/* Target KB Presets */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Target Maksimal Ukuran Berkas'
                      : 'Maximum File Size Target'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 200, 300, 500].map((kb) => (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => setTargetKb(kb)}
                        className={`rounded-xl border py-2 font-mono text-xs font-bold transition ${
                          targetKb === kb
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        ≤ {kb}KB
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="font-medium text-slate-600 dark:text-slate-400">
                        {lang === 'id' ? 'Batas Kustom:' : 'Custom Cap:'}
                      </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {targetKb} KB
                      </span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="800"
                      step="10"
                      value={targetKb}
                      onChange={(e) => setTargetKb(parseInt(e.target.value, 10))}
                      className="clean-slider w-full"
                    />
                  </div>
                </div>

                {/* Aspect Ratio / Pasfoto Preset */}
                <div>
                  <label className="mb-2 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id' ? 'Rasio Pemotongan (Crop)' : 'Aspect Ratio Crop'}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                    {(
                      [
                        { id: 'original', labelId: 'Asli', labelEn: 'Orig' },
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
                        className={`rounded-xl border py-2 text-xs font-semibold transition ${
                          cropPreset === preset.id
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        {lang === 'id' ? preset.labelId : preset.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pasfoto Backdrop Color */}
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? 'Warna Latar (Untuk PNG Transparan)'
                      : 'Backdrop Fill (For Transparent PNGs)'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'red', label: 'Merah CPNS', hex: '#dc2626' },
                      { id: 'blue', label: 'Biru Resmi', hex: '#0284c7' },
                      { id: 'white', label: 'Putih Bersih', hex: '#ffffff' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setPasfotoBg(bg.hex)}
                        className={`flex items-center justify-center gap-2 rounded-xl border px-2.5 py-2 text-xs font-semibold transition ${
                          pasfotoBg === bg.hex
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:border-emerald-500/60 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <span
                          style={{ backgroundColor: bg.hex }}
                          className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
                        />
                        <span className="truncate">{bg.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clean Compression Telemetry Summary */}
                {compressionResult && (
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                    <div className="mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                        {lang === 'id' ? 'Ringkasan Hasil Kompresi' : 'Compression Summary'}
                      </span>
                      <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                        {compressionResult.compressedBytes <= targetKb * 1024
                          ? lang === 'id'
                            ? 'Sesuai Target KB'
                            : 'Target Reached'
                          : lang === 'id'
                            ? 'Kompresi Maksimal'
                            : 'Max Compressed'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-700/70 dark:bg-slate-900">
                        <div className="text-[10px] font-medium text-slate-400">Ukuran Akhir</div>
                        <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                          {formatBytes(compressionResult.compressedBytes)}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-700/70 dark:bg-slate-900">
                        <div className="text-[10px] font-medium text-slate-400">Dimensi</div>
                        <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                          {compressionResult.width}×{compressionResult.height}
                        </div>
                      </div>
                      <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-700/70 dark:bg-slate-900">
                        <div className="text-[10px] font-medium text-slate-400">Kualitas JPG</div>
                        <div className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
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
        /* TAB 4: CLEAN PDF MERGER & BINDER WORKSPACE */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:p-6 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Antrean Dokumen PDF A4'
                    : 'A4 PDF Document Queue'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'id'
                    ? 'Susun urutan KTP, NPWP, atau berkas pindaian untuk digabung menjadi 1 file PDF'
                    : 'Arrange ID cards and document scans to merge into a single PDF'}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-500" />
                  {lang === 'id' ? 'Masukkan KTP Studio' : 'Insert Studio ID'}
                </button>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'id' ? 'Tambah Gambar / PDF' : 'Add Images / PDFs'}
                </button>
              </div>
            </div>

            {pdfQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-950/40">
                <Layers className="mb-3 h-10 w-10 text-slate-400" />
                <p className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                  {lang === 'id'
                    ? 'Antrean PDF Masih Kosong'
                    : 'Your PDF Queue Is Empty'}
                </p>
                <p className="mb-5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'id'
                    ? 'Masukkan hasil KTP ber-watermark dari studio atau pilih beberapa berkas JPG/PNG/PDF (NPWP, Ijazah, KK) dari perangkat Anda.'
                    : 'Insert your watermarked ID card from the studio or select multiple JPG/PNG/PDF files from your device.'}
                </p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleSendCurrentToPdfQueue}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 dark:bg-emerald-500 dark:text-slate-950"
                  >
                    {lang === 'id'
                      ? '+ Masukkan KTP dari Studio'
                      : '+ Insert Current Studio ID'}
                  </button>
                  <button
                    type="button"
                    onClick={() => pdfFileInputRef.current?.click()}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
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
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-200/80 font-mono text-xs font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {idx + 1}
                      </span>
                      {item.type === 'image' && item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="h-10 w-14 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                        />
                      ) : (
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-500 dark:border-slate-700 dark:bg-slate-900">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-slate-800 dark:text-slate-200">
                          {item.name}
                        </div>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {item.type.toUpperCase()} • {formatBytes(item.sizeBytes)}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => movePdfQueueItem(idx, -1)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        title="Naikkan urutan"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pdfQueue.length - 1}
                        onClick={() => movePdfQueueItem(idx, 1)}
                        className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        title="Turunkan urutan"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePdfQueueItem(item.id)}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/20 dark:hover:text-rose-400"
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
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 sm:p-6 lg:col-span-5">
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {lang === 'id' ? 'Tata Letak Halaman PDF' : 'PDF Page Layout'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {lang === 'id'
                    ? 'Pilih format penyusunan dokumen pada halaman PDF'
                    : 'Choose how documents are arranged on each page'}
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: 'a4-id-cards' as PdfPageLayout,
                    titleId: 'KTP + NPWP Satu Lembar A4 (2 Kartu/Halaman)',
                    titleEn: '2 ID Cards per A4 Sheet (KTP + NPWP)',
                    descId:
                      'Standar lampiran HRD/Bank: menyusun hingga 2 kartu identitas secara proporsional di 1 halaman A4.',
                    descEn:
                      'Places up to 2 ID cards neatly centered on a single A4 portrait sheet.',
                  },
                  {
                    id: 'a4-portrait' as PdfPageLayout,
                    titleId: 'Dokumen A4 Standar (1 Berkas/Halaman)',
                    titleEn: 'Standard A4 Portrait (1 Scan per Page)',
                    descId:
                      'Cocok untuk Ijazah, Transkrip Nilai, KK, atau Surat Keterangan dengan margin rapi.',
                    descEn:
                      'Centers each document scan on a standard A4 portrait page with clean margins.',
                  },
                  {
                    id: 'fit-image' as PdfPageLayout,
                    titleId: 'Ukuran Asli Gambar (Tanpa Margin)',
                    titleEn: 'Exact Image Dimensions (Zero Margin)',
                    descId:
                      'Ukuran halaman PDF mengikuti resolusi asli masing-masing gambar.',
                    descEn: 'Each PDF page matches the exact pixel dimensions of the image.',
                  },
                ].map((opt) => {
                  const isSelected = pdfLayout === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setPdfLayout(opt.id);
                        setPdfDownloadUrl(null);
                      }}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/20 dark:border-emerald-500/60 dark:bg-emerald-500/10'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800'
                      }`}
                    >
                      <div
                        className={`text-xs font-bold ${
                          isSelected
                            ? 'text-emerald-950 dark:text-white'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {lang === 'id' ? opt.titleId : opt.titleEn}
                      </div>
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {lang === 'id' ? opt.descId : opt.descEn}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={pdfQueue.length === 0 || isBuildingPdf}
                onClick={handleGenerateCombinedPdf}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
              >
                <FileStack className="h-4 w-4" />
                {isBuildingPdf
                  ? lang === 'id'
                    ? 'Menggabungkan PDF...'
                    : 'Generating PDF...'
                  : lang === 'id'
                    ? `Gabung & Buat PDF (${pdfQueue.length} Berkas)`
                    : `Merge & Generate PDF (${pdfQueue.length} Files)`}
              </button>

              {pdfDownloadUrl && (
                <a
                  href={pdfDownloadUrl}
                  download={`dokumen-amandok-${todayStr}.pdf`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                >
                  <Download className="h-4 w-4" />
                  {lang === 'id'
                    ? `Unduh File PDF (${formatBytes(pdfSizeBytes)})`
                    : `Download PDF File (${formatBytes(pdfSizeBytes)})`}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
