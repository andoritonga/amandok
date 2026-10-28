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
  code: string;
  labelId: string;
  labelEn: string;
  textId: string;
  textEn: string;
}[] = [
  {
    id: 'bank',
    code: 'PRM-01',
    labelId: 'Verifikasi Bank / KPR',
    labelEn: 'Bank / Mortgage',
    textId: 'HANYA UNTUK VERIFIKASI BANK',
    textEn: 'FOR BANK VERIFICATION ONLY',
  },
  {
    id: 'hrd',
    code: 'PRM-02',
    labelId: 'Lamaran Kerja / HRD',
    labelEn: 'HR Recruitment',
    textId: 'KHUSUS REKRUTMEN HRD PERUSAHAAN',
    textEn: 'FOR HR RECRUITMENT ONLY',
  },
  {
    id: 'cpns',
    code: 'PRM-03',
    labelId: 'Seleksi CPNS / BUMN',
    labelEn: 'SSCASN / SOE Portal',
    textId: 'KHUSUS PENDAFTARAN SSCASN / BUMN',
    textEn: 'FOR SSCASN / SOE REGISTRATION ONLY',
  },
  {
    id: 'rental',
    code: 'PRM-04',
    labelId: 'Sewa Properti / Kos',
    labelEn: 'Property Rental',
    textId: 'HANYA UNTUK ADMINISTRASI SEWA',
    textEn: 'FOR RENTAL ADMINISTRATION ONLY',
  },
  {
    id: 'telco',
    code: 'PRM-05',
    labelId: 'Registrasi Mitra Resmi',
    labelEn: 'Partner Onboarding',
    textId: 'VERIFIKASI MITRA RESMI — DILARANG MENYALAHGUNAKAN',
    textEn: 'OFFICIAL PARTNER VERIFICATION ONLY',
  },
];

const WATERMARK_COLORS = [
  { id: 'crimson', label: 'Vermilion Stempel (#D92B2B)', hex: '#e11d48' },
  { id: 'cobalt', label: 'Biru Birokrasi (#0284c7)', hex: '#0284c7' },
  { id: 'slate', label: 'Karbon Arsip (#0f172a)', hex: '#0f172a' },
  { id: 'emerald', label: 'Hijau Verifikasi (#059669)', hex: '#059669' },
  { id: 'amber', label: 'Kuning Otorisasi (#d97706)', hex: '#d97706' },
  { id: 'white', label: 'Putih Negatif (#f8fafc)', hex: '#f8fafc' },
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
        ? 'Spesimen KTP Simulasi dimuat ke meja inspeksi lokal.'
        : 'Simulated ID specimen loaded onto the local inspection lighttable.'
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
          ? 'Dokumen dimuat di RAM lokal & seluruh metadata EXIF/GPS telah dihancurkan.'
          : 'Document loaded in local RAM & all camera EXIF/GPS metadata purged.'
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
        ? 'Zona sensor ditambahkan. Anda juga bisa klik & seret langsung di atas kanvas optik.'
        : 'Redaction zone applied. You can also click & drag directly on the optical canvas.'
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
        ? 'Dokumen tersegel berhasil diunduh ke perangkat Anda!'
        : 'Sealed document downloaded to your device!'
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
        ? 'Dokumen dimasukkan ke Binder PDF A4!'
        : 'Document inserted into A4 PDF Binder!'
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
          ? `${addedItems.length} berkas ditambahkan ke Binder PDF.`
          : `${addedItems.length} file(s) added to PDF Binder.`
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
          ? 'Bundel PDF A4 selesai dijilid di memori lokal!'
          : 'Combined A4 PDF bundle generated in local memory!'
      );
    } catch (err) {
      console.error(err);
      showToast(
        lang === 'id'
          ? 'Terjadi kesalahan saat menjilid PDF.'
          : 'An error occurred while binding the PDF.'
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
        ? 'Memori RAM dibersihkan & dikembalikan ke spesimen simulasi.'
        : 'Session RAM purged & restored to simulated specimen.'
    );
  };

  return (
    <div className="relative">
      {/* Archival Stamp Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 border-2 border-ink bg-[#0B0E14] px-4 py-3 font-mono text-xs font-semibold text-[#FAF8F3] shadow-press-vermilion"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#34D399]" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Dossier Control Strip */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-2 border-ink bg-sheet px-4 py-3 shadow-press sm:px-5">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-ink bg-[#0A6847] text-[#FAF8F3]">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                {lang === 'id'
                  ? 'STATUS MEJA KERJA: TERISOLASI DI RAM LOKAL (0 KB UPLOAD)'
                  : 'LIGHTDESK STATUS: ISOLATED IN LOCAL RAM (0 KB UPLOAD)'}
              </span>
              <span className="hidden items-center gap-1 border border-ink bg-dossier px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-ink sm:inline-flex">
                <WifiOff className="h-3 w-3 text-vermilion" />
                {lang === 'id' ? 'SIAP MODE OFFLINE' : 'OFFLINE READY'}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slateink">
              {lang === 'id'
                ? 'BERKAS AKTIF: '
                : 'ACTIVE SPECIMEN: '}
              <strong className="text-ink">{sourceFileName}</strong> ({sourceDimensions.width}×
              {sourceDimensions.height}px • EXIF: PURGED)
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleLoadSampleKtp}
            className="btn-press inline-flex items-center gap-1.5 bg-dossier px-3 py-1.5 font-mono text-xs font-bold text-ink hover:bg-sheet"
          >
            <Sparkles className="h-3.5 w-3.5 text-cobalt" />
            {lang === 'id' ? 'Spesimen Simulasi KTP' : 'Load Specimen ID'}
          </button>

          <button
            type="button"
            onClick={handleWipeSessionMemory}
            className="btn-press inline-flex items-center gap-1.5 bg-[#FEE2E2] px-3 py-1.5 font-mono text-xs font-bold text-vermilion hover:bg-vermilion hover:text-[#FAF8F3] dark:bg-vermilion/20 dark:hover:bg-vermilion"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {lang === 'id' ? 'Hancurkan Sesi RAM' : 'Purge Session RAM'}
          </button>
        </div>
      </div>

      {/* Die-Cut Archival Dossier Stage Tabs */}
      <div
        role="tablist"
        aria-label="AmanDok Document Pipeline"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {[
          {
            id: 'watermark' as StudioTab,
            step: 'STAGE 01',
            titleId: 'Segel Watermark',
            titleEn: 'Watermark Seal',
            descId: 'Stempel teks anti-pinjol',
            descEn: 'Anti-fraud text stamp',
            icon: Stamp,
            badge: watermarkEnabled ? 'AKTIF' : 'OFF',
          },
          {
            id: 'redact' as StudioTab,
            step: 'STAGE 02',
            titleId: 'Sensor Piksel',
            titleEn: 'Pixel Redaction',
            descId: 'Hancurkan NIK & tanda tangan',
            descEn: 'Destroy ID & signature pixels',
            icon: EyeOff,
            badge: redactions.length > 0 ? `${redactions.length} ZONA` : 'SIAP',
          },
          {
            id: 'compress' as StudioTab,
            step: 'STAGE 03',
            titleId: 'Presisi Target KB',
            titleEn: 'Target KB Press',
            descId: 'Kompresi CPNS & rasio 3×4',
            descEn: 'Exact KB & 3×4 / 4×6 crop',
            icon: Minimize2,
            badge: `≤${targetKb}KB`,
          },
          {
            id: 'pdf' as StudioTab,
            step: 'STAGE 04',
            titleId: 'Binder PDF A4',
            titleEn: 'A4 PDF Binder',
            descId: 'Jilid KTP, NPWP & berkas',
            descEn: 'Bind IDs & docs to A4 PDF',
            icon: FileStack,
            badge: pdfQueue.length > 0 ? `${pdfQueue.length} ITEM` : '0 ITEM',
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
              className={`group relative flex flex-col justify-between border-2 border-ink p-3.5 text-left transition-all ${
                isActive
                  ? '-translate-y-0.5 bg-ink text-sheet shadow-press-vermilion'
                  : 'bg-sheet text-ink shadow-press hover:-translate-y-0.5 hover:bg-dossier'
              }`}
            >
              {/* Top Active Vermilion Bar */}
              <div
                className={`absolute inset-x-0 top-0 h-1.5 ${
                  isActive ? 'bg-vermilion' : 'bg-transparent group-hover:bg-ink/20'
                }`}
              />

              <div className="mb-2.5 flex w-full items-center justify-between pt-1">
                <span
                  className={`font-mono text-[10px] font-bold tracking-widest ${
                    isActive ? 'text-[#FCA5A5] dark:text-vermilion' : 'text-slateink'
                  }`}
                >
                  {tab.step}
                </span>
                <span
                  className={`border px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                    isActive
                      ? 'border-sheet/30 bg-vermilion text-[#FAF8F3]'
                      : 'border-ink bg-dossier text-ink'
                  }`}
                >
                  {tab.badge}
                </span>
              </div>

              <div className="flex items-start gap-2.5">
                <div
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center border ${
                    isActive
                      ? 'border-sheet/40 bg-sheet/10 text-sheet'
                      : 'border-ink bg-dossier text-ink'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-display text-sm font-bold tracking-tight sm:text-base">
                    {lang === 'id' ? tab.titleId : tab.titleEn}
                  </div>
                  <div
                    className={`text-[11px] ${
                      isActive ? 'text-sheet/75' : 'text-slateink'
                    }`}
                  >
                    {lang === 'id' ? tab.descId : tab.descEn}
                  </div>
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

      {/* Main Asymmetric Workbench */}
      {activeTab !== 'pdf' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT: FORENSIC OPTICAL LIGHTTABLE (7 columns) */}
          <div className="flex flex-col border-2 border-ink bg-lighttable text-[#FAF8F3] shadow-press lg:col-span-7">
            {/* Optical Lighttable Top Command Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#FAF8F3]/15 bg-[#121721] px-4 py-3">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 border-2 border-[#FAF8F3] bg-vermilion px-3.5 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-[#FAF8F3] shadow-[2px_2px_0px_#FAF8F3] transition hover:bg-[#b91c1c]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'id' ? 'Muat Foto KTP / Dokumen' : 'Load ID / Document Photo'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setWatermarkConfig((prev) => ({
                      ...prev,
                      rotation: ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                    }))
                  }
                  title={lang === 'id' ? 'Putar Orientasi 90°' : 'Rotate Orientation 90°'}
                  className="inline-flex items-center gap-1.5 border border-[#FAF8F3]/30 bg-[#FAF8F3]/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-[#FAF8F3] transition hover:border-[#FAF8F3] hover:bg-[#FAF8F3]/20"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>90°</span>
                </button>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] text-[#FAF8F3]/75">
                {isSampleLoaded && (
                  <span className="border border-[#F59E0B]/50 bg-[#F59E0B]/15 px-2 py-0.5 text-[10px] font-bold text-[#FCD34D]">
                    {lang === 'id' ? 'SPESIMEN SIMULASI' : 'SIMULATED SPECIMEN'}
                  </span>
                )}
                <span className="border border-[#FAF8F3]/20 bg-black/40 px-2 py-0.5">
                  {sourceDimensions.width}×{sourceDimensions.height} PX
                </span>
              </div>
            </div>

            {/* Horizontal Millimeter Calibration Ruler */}
            <div className="flex h-6 items-center justify-between border-b border-[#FAF8F3]/15 bg-[#070A0E] px-6 font-mono text-[9px] tracking-widest text-[#FAF8F3]/50 ruler-ticks-x">
              <span>0.0 MM</span>
              <span>ISO/IEC 7810 ID-1 OPTICAL CALIBRATION DECK</span>
              <span>85.60 MM</span>
            </div>

            {/* Central Optical Inspection Viewport with Corner Registration Marks */}
            <div
              onMouseDown={handlePointerDown}
              onMouseMove={handlePointerMove}
              onMouseUp={handlePointerUp}
              onMouseLeave={handlePointerUp}
              onTouchStart={handlePointerDown}
              onTouchMove={handlePointerMove}
              onTouchEnd={handlePointerUp}
              className={`bg-forensic-lighttable relative flex min-h-[320px] flex-1 items-center justify-center overflow-hidden p-5 sm:min-h-[430px] ${
                activeTab === 'redact' ? 'cursor-crosshair select-none' : ''
              }`}
            >
              {/* Left Vertical Millimeter Ruler Strip */}
              <div className="pointer-events-none absolute inset-y-0 left-0 hidden w-5 flex-col justify-between border-r border-[#FAF8F3]/15 bg-[#070A0E]/80 py-3 text-center font-mono text-[8px] text-[#FAF8F3]/40 ruler-ticks-y sm:flex">
                <span>0</span>
                <span>25</span>
                <span>54</span>
              </div>

              {/* Corner Registration Crosshairs (+) */}
              <span className="pointer-events-none absolute left-7 top-3 font-mono text-xs font-light text-[#FAF8F3]/40">
                +
              </span>
              <span className="pointer-events-none absolute right-3 top-3 font-mono text-xs font-light text-[#FAF8F3]/40">
                +
              </span>
              <span className="pointer-events-none absolute bottom-3 left-7 font-mono text-xs font-light text-[#FAF8F3]/40">
                +
              </span>
              <span className="pointer-events-none absolute bottom-3 right-3 font-mono text-xs font-light text-[#FAF8F3]/40">
                +
              </span>

              {/* Active Redaction Mode Banner Overlay */}
              {activeTab === 'redact' && (
                <div className="pointer-events-none absolute top-3 z-10 flex items-center gap-1.5 border border-vermilion bg-black/85 px-3 py-1 font-mono text-[11px] font-bold text-[#FCA5A5]">
                  <Crosshair className="h-3.5 w-3.5 text-vermilion" />
                  <span>
                    {lang === 'id'
                      ? 'MODE SENSOR AKTIF: KLIK & SERET KOTAK DI ATAS NIK / TTD'
                      : 'REDACTION ARMED: CLICK & DRAG OVER ID NUMBER OR SIGNATURE'}
                  </span>
                </div>
              )}

              {activeTab === 'compress' && compressionResult ? (
                <div className="relative flex flex-col items-center">
                  <div className="border-2 border-[#FAF8F3]/30 bg-black p-1.5 shadow-2xl">
                    <img
                      src={compressionResult.dataUrl}
                      alt="Pratinjau Hasil Kompresi & Pasfoto"
                      className="max-h-[390px] w-auto object-contain"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                    <span className="border border-[#FAF8F3]/25 bg-black/80 px-2.5 py-1 text-[#FAF8F3]/80">
                      {lang === 'id' ? 'AWAL:' : 'RAW:'}{' '}
                      <strong>{formatBytes(compressionResult.originalBytes)}</strong>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#34D399]" />
                    <span className="border border-[#34D399] bg-[#064E3B] px-2.5 py-1 font-bold text-[#6EE7B7]">
                      {lang === 'id' ? 'HASIL:' : 'OUTPUT:'}{' '}
                      {formatBytes(compressionResult.compressedBytes)} (Q:{compressionResult.qualityUsed}%)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative inline-block max-w-full border border-[#FAF8F3]/25 bg-black p-1 shadow-[0_20px_50px_rgba(0,0,0,0.85)]">
                  <canvas
                    ref={previewCanvasRef}
                    className="block max-h-[400px] w-auto max-w-full object-contain"
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
                      className="pointer-events-none absolute border-2 border-dashed border-vermilion bg-vermilion/30"
                    />
                  )}
                </div>
              )}
            </div>

            {/* Lighttable Bottom Export & Chaining Deck */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#FAF8F3]/15 bg-[#121721] px-4 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {activeTab === 'compress' && compressionResult ? (
                  <button
                    type="button"
                    onClick={handleDownloadCompressed}
                    className="inline-flex items-center gap-2 border-2 border-[#FAF8F3] bg-[#10B981] px-4 py-2 font-mono text-xs font-bold uppercase text-[#121316] shadow-[3px_3px_0px_#FAF8F3] transition hover:bg-[#34D399]"
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
                      className="inline-flex items-center gap-2 border-2 border-[#FAF8F3] bg-[#10B981] px-4 py-2 font-mono text-xs font-bold uppercase text-[#121316] shadow-[3px_3px_0px_#FAF8F3] transition hover:bg-[#34D399]"
                    >
                      <Download className="h-4 w-4" />
                      {lang === 'id' ? 'Unduh JPG Tersegel' : 'Download Sealed JPG'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadProtectedImage('png')}
                      className="inline-flex items-center gap-1.5 border border-[#FAF8F3]/40 bg-[#FAF8F3]/10 px-3 py-2 font-mono text-xs font-bold text-[#FAF8F3] transition hover:border-[#FAF8F3] hover:bg-[#FAF8F3]/20"
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
                    className="inline-flex items-center gap-1.5 border border-[#FAF8F3]/40 bg-[#FAF8F3]/10 px-3 py-2 font-mono text-xs font-bold text-[#FAF8F3] transition hover:border-[#FAF8F3] hover:bg-[#FAF8F3]/20"
                  >
                    <span>{lang === 'id' ? '02. Sensor NIK' : '02. Redact ID'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                {activeTab === 'redact' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('compress')}
                    className="inline-flex items-center gap-1.5 border border-[#FAF8F3]/40 bg-[#FAF8F3]/10 px-3 py-2 font-mono text-xs font-bold text-[#FAF8F3] transition hover:border-[#FAF8F3] hover:bg-[#FAF8F3]/20"
                  >
                    <span>{lang === 'id' ? '03. Target KB' : '03. Target KB'}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="inline-flex items-center gap-1.5 border border-[#FCD34D]/60 bg-[#F59E0B]/20 px-3 py-2 font-mono text-xs font-bold text-[#FDE68A] transition hover:bg-[#F59E0B]/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{lang === 'id' ? 'Masukkan Binder PDF' : 'Send to PDF Binder'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT: ARCHITECTURAL CONTROL DECK (5 columns) */}
          <div className="flex flex-col justify-between border-2 border-ink bg-sheet p-5 shadow-press sm:p-6 lg:col-span-5">
            {/* TAB 1: WATERMARK CONTROLS */}
            {activeTab === 'watermark' && (
              <div className="space-y-5">
                <div className="flex items-start justify-between border-b-2 border-ink pb-3.5">
                  <div>
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vermilion">
                      MODUL 01 // OTORISASI SEGEL
                    </span>
                    <h2 className="font-display text-lg font-bold text-ink">
                      {lang === 'id'
                        ? 'Konfigurasi Stempel Watermark'
                        : 'Watermark Stamp Configuration'}
                    </h2>
                  </div>
                  <label className="inline-flex cursor-pointer items-center gap-2 border-2 border-ink bg-dossier px-2.5 py-1 shadow-press-sm">
                    <input
                      type="checkbox"
                      checked={watermarkEnabled}
                      onChange={(e) => setWatermarkEnabled(e.target.checked)}
                      className="h-3.5 w-3.5 accent-vermilion"
                    />
                    <span className="font-mono text-[11px] font-bold text-ink">
                      {watermarkEnabled ? 'SEGEL ON' : 'SEGEL OFF'}
                    </span>
                  </label>
                </div>

                {/* Quick Rubber-Stamp Presets */}
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-slateink">
                    {lang === 'id'
                      ? 'Preset Stempel Instansi (Klik untuk Terapkan)'
                      : 'Official Purpose Stamp Presets'}
                  </label>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
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
                          className={`flex items-center justify-between border px-2.5 py-1.5 text-left font-mono text-xs transition ${
                            isSelected
                              ? 'border-ink bg-ink font-bold text-sheet'
                              : 'border-ink/40 bg-dossier text-ink hover:border-ink hover:bg-sheet'
                          }`}
                        >
                          <span className="truncate">
                            {lang === 'id' ? preset.labelId : preset.labelEn}
                          </span>
                          <span
                            className={`ml-1.5 shrink-0 text-[9px] ${
                              isSelected ? 'text-[#FCA5A5] dark:text-vermilion' : 'text-slateink'
                            }`}
                          >
                            {preset.code}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Main Watermark Text & Subtext Inputs */}
                <div className="space-y-3 border-t border-ink/20 pt-3">
                  <div>
                    <label
                      htmlFor="wm-main-text"
                      className="mb-1 block font-mono text-[11px] font-bold uppercase text-ink"
                    >
                      {lang === 'id' ? 'Baris Stempel Utama' : 'Primary Stamp Line'}
                    </label>
                    <input
                      id="wm-main-text"
                      type="text"
                      value={watermarkConfig.text}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, text: e.target.value }))
                      }
                      placeholder="HANYA UNTUK VERIFIKASI..."
                      className="w-full border-2 border-ink bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink placeholder-slateink/60 focus:bg-sheet focus:outline-none"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="wm-sub-text"
                      className="mb-1 block font-mono text-[11px] font-bold uppercase text-ink"
                    >
                      {lang === 'id'
                        ? 'Baris Kedua (Tanggal / Penerima)'
                        : 'Secondary Stamp Line (Date / Recipient)'}
                    </label>
                    <input
                      id="wm-sub-text"
                      type="text"
                      value={watermarkConfig.subtext || ''}
                      onChange={(e) =>
                        setWatermarkConfig((prev) => ({ ...prev, subtext: e.target.value }))
                      }
                      placeholder={`TANGGAL: ${todayStr}`}
                      className="w-full border-2 border-ink bg-dossier px-3 py-2 font-mono text-xs text-ink placeholder-slateink/60 focus:bg-sheet focus:outline-none"
                    />
                  </div>
                </div>

                {/* Pattern Mode & Ink Color */}
                <div className="grid grid-cols-1 gap-4 border-t border-ink/20 pt-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] font-bold uppercase text-ink">
                      {lang === 'id' ? 'Geometri Segel' : 'Stamp Geometry'}
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
                          className={`border-2 border-ink py-1.5 font-mono text-xs font-bold transition ${
                            watermarkConfig.mode === m.id
                              ? 'bg-vermilion text-[#FAF8F3] shadow-press-sm'
                              : 'bg-dossier text-ink hover:bg-sheet'
                          }`}
                        >
                          {lang === 'id' ? m.labelId : m.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block font-mono text-[11px] font-bold uppercase text-ink">
                      {lang === 'id' ? 'Tinta Segel Resmi' : 'Official Stamp Ink'}
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
                          className={`h-7 w-7 border-2 border-ink transition ${
                            watermarkConfig.color === c.hex
                              ? '-translate-y-0.5 shadow-press-sm ring-2 ring-vermilion'
                              : 'opacity-80 hover:opacity-100'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Precision Sliders */}
                <div className="grid grid-cols-2 gap-4 border-2 border-ink bg-dossier p-3.5">
                  <div>
                    <div className="mb-1.5 flex justify-between font-mono text-[11px]">
                      <span className="font-semibold text-slateink">
                        {lang === 'id' ? 'KEPEKATAN' : 'OPACITY'}
                      </span>
                      <span className="font-bold text-ink">
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
                      className="archival-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between font-mono text-[11px]">
                      <span className="font-semibold text-slateink">
                        {lang === 'id' ? 'SUDUT ROTASI' : 'ANGLE'}
                      </span>
                      <span className="font-bold text-ink">{watermarkConfig.angle}°</span>
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
                      className="archival-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between font-mono text-[11px]">
                      <span className="font-semibold text-slateink">
                        {lang === 'id' ? 'SKALA HURUF' : 'FONT SCALE'}
                      </span>
                      <span className="font-bold text-ink">
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
                      className="archival-slider w-full"
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex justify-between font-mono text-[11px]">
                      <span className="font-semibold text-slateink">
                        {lang === 'id' ? 'JARAK GRID' : 'GRID SPACING'}
                      </span>
                      <span className="font-bold text-ink">
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
                      className="archival-slider w-full"
                    />
                  </div>
                </div>

                {/* Archival Security Advisory */}
                <div className="border-l-4 border-vermilion bg-dossier p-3 font-mono text-[11px] leading-relaxed text-ink">
                  <strong>PROTOKOL KOMINFO:</strong> Pastikan teks segel memotong area NIK &
                  wajah KTP (bukan di pinggir kosong) agar tidak dapat dipotong (crop) oleh
                  pelaku penyalahgunaan data.
                </div>
              </div>
            )}

            {/* TAB 2: REDACTION & BLUR CONTROLS */}
            {activeTab === 'redact' && (
              <div className="space-y-5">
                <div className="border-b-2 border-ink pb-3.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vermilion">
                    MODUL 02 // DESTRUKSI RASTER
                  </span>
                  <h2 className="font-display text-lg font-bold text-ink">
                    {lang === 'id'
                      ? 'Sensor Permanen NIK & Tanda Tangan'
                      : 'Irreversible Pixel Redaction'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slateink">
                    {lang === 'id'
                      ? 'Klik & seret langsung pada meja optik hitam di kiri, atau tekan tombol koordinat cepat di bawah.'
                      : 'Click & drag directly on the dark optical canvas, or trigger quick coordinate masks below.'}
                  </p>
                </div>

                {/* Redaction Method Selector */}
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
                    {lang === 'id' ? 'Metode Penghancuran Piksel' : 'Pixel Destruction Mode'}
                  </label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(
                      [
                        { id: 'pixelate', labelId: 'Mozaik', labelEn: 'Pixelate' },
                        { id: 'blur', labelId: 'Blur Optik', labelEn: 'Blur' },
                        { id: 'blackout', labelId: 'Blok Hitam', labelEn: 'Blackout' },
                        { id: 'whiteout', labelId: 'Blok Putih', labelEn: 'Whiteout' },
                      ] as { id: RedactionStyle; labelId: string; labelEn: string }[]
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => setActiveRedactionStyle(st.id)}
                        className={`border-2 border-ink px-2.5 py-2 font-mono text-xs font-bold transition ${
                          activeRedactionStyle === st.id
                            ? 'bg-vermilion text-[#FAF8F3] shadow-press-sm'
                            : 'bg-dossier text-ink hover:bg-sheet'
                        }`}
                      >
                        {lang === 'id' ? st.labelId : st.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* One-Click Standard KTP Coordinate Masks */}
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
                    {lang === 'id'
                      ? 'Koordinat Cepat KTP Standar (ISO ID-1)'
                      : 'Standard ID Card Coordinate Presets'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('nik')}
                      className="btn-press flex items-center justify-between bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink hover:bg-sheet"
                    >
                      <span>{lang === 'id' ? '+ Baris NIK' : '+ ID Number'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-vermilion" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('signature')}
                      className="btn-press flex items-center justify-between bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink hover:bg-sheet"
                    >
                      <span>{lang === 'id' ? '+ Tanda Tangan' : '+ Signature'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-vermilion" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('address')}
                      className="btn-press flex items-center justify-between bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink hover:bg-sheet"
                    >
                      <span>{lang === 'id' ? '+ Nomor Rumah' : '+ Address Line'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-vermilion" />
                    </button>

                    <button
                      type="button"
                      onClick={() => addQuickRedactionPreset('photo')}
                      className="btn-press flex items-center justify-between bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink hover:bg-sheet"
                    >
                      <span>{lang === 'id' ? '+ Pasfoto Wajah' : '+ Portrait'}</span>
                      <EyeOff className="h-3.5 w-3.5 text-vermilion" />
                    </button>
                  </div>
                </div>

                {/* Active Redaction Coordinates Log */}
                <div className="border-2 border-ink bg-dossier p-3.5">
                  <div className="mb-2 flex items-center justify-between border-b border-ink/20 pb-1.5">
                    <span className="font-mono text-[11px] font-bold uppercase text-ink">
                      {lang === 'id'
                        ? `Log Zona Disensor (${redactions.length})`
                        : `Active Redaction Zones (${redactions.length})`}
                    </span>
                    {redactions.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setRedactions([])}
                        className="font-mono text-[11px] font-bold text-vermilion underline"
                      >
                        {lang === 'id' ? 'Reset Semua' : 'Clear All'}
                      </button>
                    )}
                  </div>

                  {redactions.length === 0 ? (
                    <p className="py-4 text-center font-mono text-xs text-slateink">
                      {lang === 'id'
                        ? '[BELUM ADA ZONA SENSOR — SERET KURSOR DI ATAS GAMBAR]'
                        : '[NO REDACTION ZONES — DRAG CURSOR OVER IMAGE]'}
                    </p>
                  ) : (
                    <ul className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                      {redactions.map((box, i) => (
                        <li
                          key={box.id}
                          className="flex items-center justify-between border border-ink bg-sheet px-2.5 py-1.5 font-mono text-xs"
                        >
                          <span className="font-semibold text-ink">
                            ZONA #{i + 1} • {box.style.toUpperCase()} ({Math.round(box.width * 100)}
                            %×{Math.round(box.height * 100)}%)
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setRedactions((prev) => prev.filter((r) => r.id !== box.id))
                            }
                            className="text-slateink hover:text-vermilion"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="border-l-4 border-verified bg-dossier p-3 font-mono text-[11px] leading-relaxed text-ink">
                  <strong>DESTRUKSI RASTER PERMANEN:</strong> Piksel di bawah zona sensor
                  dihancurkan secara matematis sebelum berkas diekspor—mustahil dibongkar ulang
                  (anti un-blur).
                </div>
              </div>
            )}

            {/* TAB 3: TARGET KB COMPRESSOR & PASFOTO CONTROLS */}
            {activeTab === 'compress' && (
              <div className="space-y-5">
                <div className="border-b-2 border-ink pb-3.5">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vermilion">
                    MODUL 03 // KOMPRESI PRESISI
                  </span>
                  <h2 className="font-display text-lg font-bold text-ink">
                    {lang === 'id'
                      ? 'Presisi Target Kilobyte & Rasio Pasfoto'
                      : 'Target KB Press & Aspect Ratio Crop'}
                  </h2>
                  <p className="mt-0.5 text-xs text-slateink">
                    {lang === 'id'
                      ? 'Pencarian biner otomatis agar ukuran berkas lolos batas ketat portal SSCASN/CPNS & BUMN.'
                      : 'Binary-search encoding to fit strict portal upload caps (100KB, 200KB, 300KB).'}
                  </p>
                </div>

                {/* Target KB Presets */}
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
                    {lang === 'id'
                      ? 'Batas Maksimal Ukuran Berkas (Target KB)'
                      : 'Maximum File Size Cap (Target KB)'}
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[100, 200, 300, 500].map((kb) => (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => setTargetKb(kb)}
                        className={`border-2 border-ink py-2 font-mono text-xs font-bold transition ${
                          targetKb === kb
                            ? 'bg-ink text-sheet shadow-press-vermilion'
                            : 'bg-dossier text-ink hover:bg-sheet'
                        }`}
                      >
                        ≤ {kb}KB
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 border-2 border-ink bg-dossier p-3">
                    <div className="mb-1.5 flex justify-between font-mono text-xs">
                      <span className="font-semibold text-slateink">
                        {lang === 'id' ? 'TARGET KUSTOM:' : 'CUSTOM CAP:'}
                      </span>
                      <span className="font-bold text-vermilion">{targetKb} KB</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="800"
                      step="10"
                      value={targetKb}
                      onChange={(e) => setTargetKb(parseInt(e.target.value, 10))}
                      className="archival-slider w-full"
                    />
                  </div>
                </div>

                {/* Aspect Ratio / Pasfoto Preset */}
                <div>
                  <label className="mb-2 block font-mono text-[11px] font-bold uppercase tracking-wider text-ink">
                    {lang === 'id' ? 'Pemotongan Rasio Standar' : 'Standard Ratio Crop'}
                  </label>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {(
                      [
                        { id: 'original', labelId: 'Asli', labelEn: 'Orig' },
                        { id: 'ktp', labelId: 'KTP', labelEn: 'ID-1' },
                        { id: '3x4', labelId: '3×4', labelEn: '3×4' },
                        { id: '4x6', labelId: '4×6', labelEn: '4×6' },
                        { id: '1x1', labelId: '1×1', labelEn: '1×1' },
                      ] as { id: CropPreset; labelId: string; labelEn: string }[]
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCropPreset(preset.id)}
                        className={`border-2 border-ink py-2 font-mono text-xs font-bold transition ${
                          cropPreset === preset.id
                            ? 'bg-vermilion text-[#FAF8F3] shadow-press-sm'
                            : 'bg-dossier text-ink hover:bg-sheet'
                        }`}
                      >
                        {lang === 'id' ? preset.labelId : preset.labelEn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pasfoto Backdrop Color */}
                <div>
                  <label className="mb-1.5 block font-mono text-[11px] font-bold uppercase text-ink">
                    {lang === 'id'
                      ? 'Latar Pasfoto (Untuk PNG Transparan)'
                      : 'Backdrop Fill (For Transparent PNGs)'}
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'red', label: 'Merah CPNS', hex: '#dc2626' },
                      { id: 'blue', label: 'Biru Resmi', hex: '#0284c7' },
                      { id: 'white', label: 'Putih Arsip', hex: '#ffffff' },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        type="button"
                        onClick={() => setPasfotoBg(bg.hex)}
                        className={`flex items-center justify-center gap-2 border-2 border-ink px-2.5 py-1.5 font-mono text-xs font-bold transition ${
                          pasfotoBg === bg.hex
                            ? 'bg-ink text-sheet shadow-press-sm'
                            : 'bg-dossier text-ink hover:bg-sheet'
                        }`}
                      >
                        <span
                          style={{ backgroundColor: bg.hex }}
                          className="h-3.5 w-3.5 shrink-0 border border-ink"
                        />
                        <span className="truncate">{bg.label.split(' ')[0]}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compression Telemetry Readout */}
                {compressionResult && (
                  <div className="border-2 border-ink bg-[#0B0E14] p-4 text-[#FAF8F3]">
                    <div className="mb-2.5 flex items-center justify-between border-b border-[#FAF8F3]/20 pb-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-[#FAF8F3]/70">
                        {lang === 'id' ? 'TELEMETRI KOMPRESI' : 'COMPRESSION TELEMETRY'}
                      </span>
                      <span className="border border-[#34D399] bg-[#064E3B] px-2 py-0.5 font-mono text-[10px] font-bold text-[#6EE7B7]">
                        {compressionResult.compressedBytes <= targetKb * 1024
                          ? lang === 'id'
                            ? 'LOLOS VERIFIKASI KB'
                            : 'TARGET VERIFIED'
                          : lang === 'id'
                            ? 'KOMPRESI MAKSIMAL'
                            : 'MAX COMPRESSED'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center font-mono text-xs">
                      <div className="border border-[#FAF8F3]/20 bg-white/5 p-2">
                        <div className="text-[10px] text-[#FAF8F3]/60">UKURAN AKHIR</div>
                        <div className="font-bold text-[#6EE7B7]">
                          {formatBytes(compressionResult.compressedBytes)}
                        </div>
                      </div>
                      <div className="border border-[#FAF8F3]/20 bg-white/5 p-2">
                        <div className="text-[10px] text-[#FAF8F3]/60">DIMENSI PX</div>
                        <div className="font-bold text-[#FAF8F3]">
                          {compressionResult.width}×{compressionResult.height}
                        </div>
                      </div>
                      <div className="border border-[#FAF8F3]/20 bg-white/5 p-2">
                        <div className="text-[10px] text-[#FAF8F3]/60">KUALITAS JPG</div>
                        <div className="font-bold text-[#FCD34D]">
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
        /* TAB 4: PDF MERGER & BINDER WORKSPACE */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="border-2 border-ink bg-sheet p-5 shadow-press sm:p-6 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink pb-4">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vermilion">
                  MODUL 04 // PENJILIDAN BERKAS A4
                </span>
                <h2 className="font-display text-lg font-bold text-ink">
                  {lang === 'id'
                    ? 'Antrean Binder Dokumen PDF (100% Lokal)'
                    : 'Local A4 PDF Document Binder Queue'}
                </h2>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSendCurrentToPdfQueue}
                  className="btn-press inline-flex items-center gap-1.5 bg-dossier px-3 py-2 font-mono text-xs font-bold text-ink hover:bg-sheet"
                >
                  <Plus className="h-3.5 w-3.5 text-vermilion" />
                  {lang === 'id' ? '+ Masukkan KTP Studio' : '+ Insert Studio ID'}
                </button>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="btn-press inline-flex items-center gap-1.5 bg-vermilion px-3.5 py-2 font-mono text-xs font-bold text-[#FAF8F3]"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {lang === 'id' ? 'Tambah Gambar / PDF' : 'Add Images / PDFs'}
                </button>
              </div>
            </div>

            {pdfQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-ink bg-dossier px-6 py-12 text-center">
                <Layers className="mb-3 h-10 w-10 text-ink" />
                <p className="mb-1 font-display text-base font-bold text-ink">
                  {lang === 'id'
                    ? 'Binder PDF Masih Kosong'
                    : 'Your PDF Binder Queue Is Empty'}
                </p>
                <p className="mb-5 max-w-md text-xs text-slateink">
                  {lang === 'id'
                    ? 'Masukkan hasil KTP ber-watermark dari meja inspeksi atau tambahkan beberapa berkas JPG/PNG/PDF (NPWP, Ijazah, KK) untuk dijilid menjadi 1 dokumen A4.'
                    : 'Insert your watermarked ID card from the lightdesk or select multiple JPG/PNG/PDF files from your device.'}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleSendCurrentToPdfQueue}
                    className="btn-press bg-ink px-4 py-2 font-mono text-xs font-bold text-sheet"
                  >
                    {lang === 'id'
                      ? '+ Masukkan Spesimen KTP Saat Ini'
                      : '+ Insert Current Studio Specimen'}
                  </button>
                  <button
                    type="button"
                    onClick={() => pdfFileInputRef.current?.click()}
                    className="btn-press bg-sheet px-4 py-2 font-mono text-xs font-bold text-ink"
                  >
                    {lang === 'id' ? 'Pilih Berkas dari Perangkat' : 'Browse Device Files'}
                  </button>
                </div>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {pdfQueue.map((item, idx) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 border-2 border-ink bg-dossier p-3 shadow-press-sm"
                  >
                    <div className="flex items-center gap-3 overflow-hidden">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-ink bg-ink font-mono text-xs font-bold text-sheet">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {item.type === 'image' && item.dataUrl ? (
                        <img
                          src={item.dataUrl}
                          alt={item.name}
                          className="h-10 w-14 shrink-0 border border-ink object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-14 shrink-0 items-center justify-center border border-ink bg-sheet text-vermilion">
                          <FileText className="h-5 w-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-mono text-xs font-bold text-ink">
                          {item.name}
                        </div>
                        <div className="font-mono text-[11px] text-slateink">
                          {item.type.toUpperCase()} • {formatBytes(item.sizeBytes)}
                        </div>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => movePdfQueueItem(idx, -1)}
                        className="border border-ink bg-sheet p-1.5 text-ink hover:bg-ink hover:text-sheet disabled:opacity-30"
                        title="Naikkan urutan"
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === pdfQueue.length - 1}
                        onClick={() => movePdfQueueItem(idx, 1)}
                        className="border border-ink bg-sheet p-1.5 text-ink hover:bg-ink hover:text-sheet disabled:opacity-30"
                        title="Turunkan urutan"
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removePdfQueueItem(item.id)}
                        className="border border-ink bg-[#FEE2E2] p-1.5 text-vermilion hover:bg-vermilion hover:text-[#FAF8F3] dark:bg-vermilion/20 dark:hover:bg-vermilion"
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
          <div className="flex flex-col justify-between border-2 border-ink bg-sheet p-5 shadow-press sm:p-6 lg:col-span-5">
            <div className="space-y-4">
              <div className="border-b-2 border-ink pb-3">
                <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-vermilion">
                  SPESIFIKASI CETAK
                </span>
                <h3 className="font-display text-lg font-bold text-ink">
                  {lang === 'id' ? 'Tata Letak Lembar PDF A4' : 'A4 PDF Sheet Layout'}
                </h3>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: 'a4-id-cards' as PdfPageLayout,
                    code: 'LAYOUT // ID-DUAL',
                    titleId: 'KTP + NPWP Satu Lembar A4 (2 Kartu/Halaman)',
                    titleEn: '2 ID Cards per A4 Sheet (KTP + NPWP)',
                    descId:
                      'Standar lampiran Bank/HRD: menyusun 2 kartu identitas secara proporsional di 1 halaman A4.',
                    descEn:
                      'Places up to 2 ID cards neatly centered on a single A4 portrait sheet.',
                  },
                  {
                    id: 'a4-portrait' as PdfPageLayout,
                    code: 'LAYOUT // A4-STD',
                    titleId: 'Dokumen A4 Standar (1 Berkas/Halaman)',
                    titleEn: 'Standard A4 Portrait (1 Scan per Page)',
                    descId:
                      'Ideal untuk Ijazah, Transkrip Nilai, KK, atau Surat Keterangan dengan margin proporsional.',
                    descEn:
                      'Centers each document scan on a standard A4 portrait page with clean margins.',
                  },
                  {
                    id: 'fit-image' as PdfPageLayout,
                    code: 'LAYOUT // RAW-FIT',
                    titleId: 'Dimensi Asli Gambar (Tanpa Margin)',
                    titleEn: 'Exact Image Dimensions (Zero Margin)',
                    descId:
                      'Ukuran halaman PDF menyesuaikan resolusi piksel masing-masing berkas.',
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
                      className={`w-full border-2 border-ink p-3.5 text-left transition ${
                        isSelected
                          ? 'bg-ink text-sheet shadow-press-vermilion'
                          : 'bg-dossier text-ink hover:bg-sheet'
                      }`}
                    >
                      <div
                        className={`font-mono text-[10px] font-bold ${
                          isSelected ? 'text-[#FCA5A5] dark:text-vermilion' : 'text-vermilion'
                        }`}
                      >
                        {opt.code}
                      </div>
                      <div className="mt-0.5 font-mono text-xs font-bold">
                        {lang === 'id' ? opt.titleId : opt.titleEn}
                      </div>
                      <div
                        className={`mt-1 text-[11px] ${
                          isSelected ? 'text-sheet/75' : 'text-slateink'
                        }`}
                      >
                        {lang === 'id' ? opt.descId : opt.descEn}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 space-y-3 border-t-2 border-ink pt-4">
              <button
                type="button"
                disabled={pdfQueue.length === 0 || isBuildingPdf}
                onClick={handleGenerateCombinedPdf}
                className="btn-press flex w-full items-center justify-center gap-2 bg-vermilion px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#FAF8F3] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileStack className="h-4 w-4" />
                {isBuildingPdf
                  ? lang === 'id'
                    ? 'Menjilid PDF di RAM Lokal...'
                    : 'Binding PDF in Local RAM...'
                  : lang === 'id'
                    ? `Jilid & Buat PDF (${pdfQueue.length} Berkas)`
                    : `Bind & Generate PDF (${pdfQueue.length} Files)`}
              </button>

              {pdfDownloadUrl && (
                <a
                  href={pdfDownloadUrl}
                  download={`bundel-amandok-${todayStr}.pdf`}
                  className="btn-press flex w-full items-center justify-center gap-2 bg-[#0A6847] px-4 py-3 font-mono text-xs font-bold uppercase tracking-wider text-[#FAF8F3]"
                >
                  <Download className="h-4 w-4" />
                  {lang === 'id'
                    ? `Unduh Bundel PDF (${formatBytes(pdfSizeBytes)})`
                    : `Download PDF Bundle (${formatBytes(pdfSizeBytes)})`}
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
