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
  Sun,
  Moon,
  Lock,
  Info,
  X,
  SlidersHorizontal,
  Cpu,
  HardDriveDownload,
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
  const [isDark, setIsDark] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<StudioTab>('watermark');
  const [showVaultInfo, setShowVaultInfo] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

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

  // Sync theme & language on mount
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('amandok_lang') as Lang | null;
      if (savedLang === 'id' || savedLang === 'en') {
        setLang(savedLang);
      }
      const darkActive = document.documentElement.classList.contains('dark');
      setIsDark(darkActive);
    } catch {
      // ignore storage errors
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    const meta = document.getElementById('meta-theme-color');
    if (nextDark) {
      document.documentElement.classList.add('dark');
      if (meta) meta.setAttribute('content', '#0B0F17');
    } else {
      document.documentElement.classList.remove('dark');
      if (meta) meta.setAttribute('content', '#F4F6F9');
    }
    try {
      localStorage.setItem('amandok_theme', nextDark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  };

  const toggleLanguage = () => {
    const nextLang: Lang = lang === 'id' ? 'en' : 'id';
    setLang(nextLang);
    try {
      localStorage.setItem('amandok_lang', nextLang);
      window.dispatchEvent(new CustomEvent('amandok-lang-change', { detail: nextLang }));
    } catch {
      // ignore
    }
  };

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
        ? 'Contoh KTP simulasi berhasil dimuat ke brankas lokal.'
        : 'Simulated sample ID card loaded into local vault.'
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
    if (!loadedImageEl) return;
    const canvas = previewCanvasRef.current ?? document.createElement('canvas');

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

  const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB client-side memory guard

  const loadSingleDocumentFile = async (file: File) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      showToast(
        lang === 'id'
          ? 'Ukuran berkas terlalu besar (maksimal 25 MB).'
          : 'File size is too large (maximum 25 MB).'
      );
      return;
    }
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
          ? 'Dokumen dimuat di RAM lokal & metadata EXIF/GPS telah dibersihkan.'
          : 'Document loaded in local RAM & EXIF/GPS metadata stripped.'
      );
    } catch {
      showToast(
        lang === 'id'
          ? 'Gagal membaca berkas gambar. Gunakan format JPG, PNG, atau WebP.'
          : 'Failed to read image file. Please use JPG, PNG, or WebP.'
      );
    }
  };

  // Handle user uploading their own image
  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadSingleDocumentFile(file);
    e.target.value = '';
  };

  // Handle drag & drop onto canvas workbench
  const handleWorkbenchDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    if (activeTab === 'pdf') {
      await processPdfQueueFiles(files);
    } else {
      const imgFile = files.find((f) => f.type.startsWith('image/'));
      if (imgFile) {
        await loadSingleDocumentFile(imgFile);
      }
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
        ? `Berkas terkompresi (${formatBytes(compressionResult.compressedBytes)}) berhasil diunduh!`
        : `Compressed file (${formatBytes(compressionResult.compressedBytes)}) downloaded!`
    );
  };

  // Send current active image to PDF queue
  const handleSendCurrentToPdfQueue = () => {
    if (!loadedImageEl) return;
    const canvas = previewCanvasRef.current ?? document.createElement('canvas');
    if (!previewCanvasRef.current) {
      renderDocumentCanvas(
        canvas,
        loadedImageEl,
        watermarkEnabled ? watermarkConfig : null,
        redactions
      );
    }

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
        ? 'Dokumen ditambahkan ke antrean PDF Binder A4!'
        : 'Document added to A4 PDF Binder queue!'
    );
  };

  const processPdfQueueFiles = async (files: File[]) => {
    const addedItems: PdfQueueItem[] = [];
    let skippedOversized = 0;

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        skippedOversized++;
        continue;
      }
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
          ? `${addedItems.length} berkas ditambahkan ke antrean PDF.${skippedOversized > 0 ? ` (${skippedOversized} berkas >25 MB dilewati)` : ''}`
          : `${addedItems.length} file(s) added to PDF queue.${skippedOversized > 0 ? ` (${skippedOversized} file(s) >25 MB skipped)` : ''}`
      );
    } else if (skippedOversized > 0) {
      showToast(
        lang === 'id'
          ? 'Ukuran berkas melebihi batas maksimal 25 MB.'
          : 'File size exceeds the 25 MB maximum limit.'
      );
    }
  };

  // Add external images or PDFs directly to PDF queue
  const handlePdfQueueFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    await processPdfQueueFiles(files);
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
          ? 'Dokumen PDF A4 berhasil digabungkan di memori lokal!'
          : 'Combined A4 PDF generated in local memory!'
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
        ? 'RAM sesi dibersihkan & dikembalikan ke contoh simulasi.'
        : 'Session RAM wiped & reset to sample.'
    );
  };

  const studioTools: {
    id: StudioTab;
    step: string;
    shortId: string;
    shortEn: string;
    titleId: string;
    titleEn: string;
    descId: string;
    descEn: string;
    icon: typeof Stamp;
    badge: string | null;
  }[] = [
    {
      id: 'watermark',
      step: '01',
      shortId: 'Watermark',
      shortEn: 'Watermark',
      titleId: 'Watermark KTP',
      titleEn: 'ID Watermark',
      descId: 'Segel teks anti-pinjol',
      descEn: 'Anti-fraud text stamp',
      icon: Stamp,
      badge: watermarkEnabled ? 'ON' : 'OFF',
    },
    {
      id: 'redact',
      step: '02',
      shortId: 'Sensor NIK',
      shortEn: 'Redact',
      titleId: 'Sensor NIK & TTD',
      titleEn: 'Pixel Redact',
      descId: 'Lebur piksel sensitif',
      descEn: 'Burn sensitive pixels',
      icon: EyeOff,
      badge: redactions.length > 0 ? `${redactions.length}` : null,
    },
    {
      id: 'compress',
      step: '03',
      shortId: 'Target KB',
      shortEn: 'Target KB',
      titleId: 'Target KB & Pasfoto',
      titleEn: 'Target KB & Crop',
      descId: 'Kompres & rasio 3×4',
      descEn: 'CPNS KB & 3×4 crop',
      icon: Minimize2,
      badge: `≤${targetKb}K`,
    },
    {
      id: 'pdf',
      step: '04',
      shortId: 'PDF Binder',
      shortEn: 'PDF Binder',
      titleId: 'Gabung PDF A4',
      titleEn: 'A4 PDF Binder',
      descId: 'Susun lampiran A4',
      descEn: 'Merge into A4 PDF',
      icon: FileStack,
      badge: pdfQueue.length > 0 ? `${pdfQueue.length}` : null,
    },
  ];

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#F4F6F9] text-slate-900 dark:bg-[#0B0F17] dark:text-[#E6EDF7]">
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

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 right-4 z-50 flex items-center gap-2.5 rounded-xl border border-emerald-500/40 bg-slate-900/95 px-4 py-2.5 text-xs font-semibold text-white shadow-2xl backdrop-blur-md lg:bottom-5 lg:right-5"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* =========================================================
          TOP CYBER-VAULT COMMAND BAR (56px Fixed Studio Header)
         ========================================================= */}
      <header className="z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3.5 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#0F1520]/95 sm:px-5">
        {/* Left: Vault Brand Identity + Active File Pill */}
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 shadow-sm shadow-emerald-500/25">
              <ShieldCheck className="h-5 w-5 stroke-[2.2]" />
              <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400 dark:border-[#0F1520]" />
            </div>
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-tight text-slate-900 dark:text-white sm:text-[15px]">
                  AmanDok
                </span>
                <span className="hidden rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 sm:inline-block">
                  Cyber-Vault
                </span>
              </div>
              <p className="hidden text-[11px] font-medium text-slate-500 dark:text-slate-400 md:block">
                {lang === 'id'
                  ? 'Studio Privasi KTP & Dokumen Lokal'
                  : 'Client-Side ID & Document Vault'}
              </p>
            </div>
          </div>

          <div className="hidden h-6 w-px bg-slate-200 dark:bg-slate-800 lg:block" />

          {/* Active File Telemetry Pill (Desktop) */}
          <div className="hidden min-w-0 items-center gap-2 rounded-lg border border-slate-200/80 bg-slate-100/80 px-2.5 py-1 text-xs dark:border-slate-800 dark:bg-slate-900/90 lg:flex">
            <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
            <span className="max-w-[190px] truncate font-semibold text-slate-700 dark:text-slate-200 xl:max-w-[260px]">
              {sourceFileName}
            </span>
            <span className="font-mono text-[10.5px] text-slate-500 dark:text-slate-400">
              {sourceDimensions.width}×{sourceDimensions.height}
            </span>
            {isSampleLoaded && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                SAMPLE
              </span>
            )}
          </div>
        </div>

        {/* Center: Zero-Upload Security Telemetry Badge */}
        <button
          type="button"
          onClick={() => setShowVaultInfo(true)}
          title={
            lang === 'id'
              ? 'Lihat Arsitektur Keamanan Lokal AmanDok'
              : 'View AmanDok Local Security Architecture'
          }
          className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-800 transition hover:border-emerald-500/50 hover:bg-emerald-500/15 dark:text-emerald-300 xl:inline-flex"
        >
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>
            {lang === 'id'
              ? '0 KB Upload Server • Diproses di RAM Browser'
              : '0 KB Server Upload • Browser RAM Sandbox'}
          </span>
          <WifiOff className="h-3 w-3 opacity-80" />
        </button>

        {/* Right: Vault Controls (Sample, Wipe, Lang, Theme, Info) */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            type="button"
            onClick={handleLoadSampleKtp}
            className="hidden items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 sm:inline-flex"
          >
            <Sparkles className="h-3.5 w-3.5 text-teal-500" />
            <span>{lang === 'id' ? 'Contoh KTP' : 'Sample ID'}</span>
          </button>

          <button
            type="button"
            onClick={handleWipeSessionMemory}
            title={lang === 'id' ? 'Bersihkan Memori Sesi' : 'Wipe Session RAM'}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/10 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-500/20 dark:text-rose-300"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="hidden md:inline">
              {lang === 'id' ? 'Bersihkan Sesi' : 'Wipe RAM'}
            </span>
          </button>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-800" />

          <button
            type="button"
            onClick={toggleLanguage}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 font-mono text-[11px] font-bold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title="Switch Language (ID / EN)"
          >
            {lang.toUpperCase()}
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title={isDark ? 'Switch to Light Vault' : 'Switch to Dark Cyber-Vault'}
          >
            {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setShowVaultInfo(true)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
            title={lang === 'id' ? 'Jaminan Privasi Lokal' : 'Local Privacy Guarantee'}
          >
            <Info className="h-4 w-4 text-emerald-500" />
          </button>
        </div>
      </header>

      {/* =========================================================
          MAIN 3-PANE CYBER-VAULT WORKSPACE
         ========================================================= */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pb-16 lg:flex-row lg:overflow-hidden lg:pb-0">
        {/* -------------------------------------------------------
            PANE 1: LEFT VERTICAL PIPELINE RAIL (Desktop Only)
           ------------------------------------------------------- */}
        <aside
          aria-label="AmanDok Pipeline Tools"
          className="hidden shrink-0 flex-col justify-between border-r border-slate-200/90 bg-white p-3 dark:border-slate-800/90 dark:bg-[#0F1520] lg:flex lg:w-[228px]"
        >
          <div className="space-y-1.5">
            <div className="px-2 pb-1.5 pt-1 font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              {lang === 'id' ? 'Alur Proteksi' : 'Vault Pipeline'}
            </div>

            {studioTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTab === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setActiveTab(tool.id)}
                  className={`group relative flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${
                    isActive
                      ? 'border-emerald-500/60 bg-emerald-500/10 shadow-sm dark:border-emerald-500/50 dark:bg-emerald-500/[0.12]'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-100/70 dark:hover:border-slate-800 dark:hover:bg-slate-900/70'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-emerald-500" />
                  )}
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition ${
                      isActive
                        ? 'bg-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/30'
                        : 'bg-slate-100 text-slate-500 group-hover:text-slate-800 dark:bg-slate-800/90 dark:text-slate-400 dark:group-hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`truncate text-xs font-bold ${
                          isActive
                            ? 'text-emerald-950 dark:text-white'
                            : 'text-slate-700 dark:text-slate-200'
                        }`}
                      >
                        {lang === 'id' ? tool.titleId : tool.titleEn}
                      </span>
                      {tool.badge && (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9.5px] font-bold ${
                            isActive
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {tool.badge}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'id' ? tool.descId : tool.descEn}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Left Rail Bottom Quick Upload & Privacy Card */}
          <div className="space-y-2.5 border-t border-slate-200/80 pt-3 dark:border-slate-800/80">
            <button
              type="button"
              onClick={() =>
                activeTab === 'pdf'
                  ? pdfFileInputRef.current?.click()
                  : fileInputRef.current?.click()
              }
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-3 py-2.5 text-xs font-extrabold text-slate-950 shadow-sm shadow-emerald-500/20 transition hover:brightness-105"
            >
              <Upload className="h-3.5 w-3.5 stroke-[2.5]" />
              <span>
                {activeTab === 'pdf'
                  ? lang === 'id'
                    ? 'Tambah File PDF/Gambar'
                    : 'Add PDF / Images'
                  : lang === 'id'
                    ? 'Buka Foto Dokumen'
                    : 'Open Document'}
              </span>
            </button>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-2.5 dark:border-slate-800/90 dark:bg-slate-900/60">
              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                <Cpu className="h-3.5 w-3.5 shrink-0" />
                <span>Zero-Cloud Vault</span>
              </div>
              <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                {lang === 'id'
                  ? 'KTP & dokumen diproses murni via HTML5 Canvas lokal. Matikan Wi-Fi untuk membuktikan.'
                  : 'Processed purely via local HTML5 Canvas. Turn off Wi-Fi anytime to verify.'}
              </p>
            </div>
          </div>
        </aside>

        {/* -------------------------------------------------------
            PANE 2: CENTER INTERACTIVE CANVAS / BINDER WORKBENCH
           ------------------------------------------------------- */}
        <section
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={handleWorkbenchDrop}
          className="relative flex min-h-[380px] flex-1 flex-col overflow-hidden lg:min-h-0"
        >
          {/* Drag-and-Drop Overlay */}
          {isDraggingFile && (
            <div className="pointer-events-none absolute inset-3 z-30 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-emerald-400 bg-slate-950/80 text-white backdrop-blur-sm">
              <Upload className="mb-2 h-10 w-10 text-emerald-400" />
              <p className="text-sm font-bold">
                {lang === 'id'
                  ? 'Lepaskan berkas untuk memuat ke brankas lokal (0 KB Upload)'
                  : 'Drop file to load into local vault (0 KB Upload)'}
              </p>
            </div>
          )}

          {activeTab !== 'pdf' ? (
            <>
              {/* Workbench Floating Top Toolbar */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 bg-white/80 px-4 py-2.5 backdrop-blur-sm dark:border-slate-800/80 dark:bg-[#0F1520]/80">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-emerald-400"
                  >
                    <Upload className="h-3.5 w-3.5 stroke-[2.4]" />
                    <span>
                      {lang === 'id' ? 'Pilih Foto KTP / Dokumen' : 'Select ID / Photo'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setWatermarkConfig((prev) => ({
                        ...prev,
                        rotation: ((prev.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                      }))
                    }
                    title={lang === 'id' ? 'Putar Dokumen 90°' : 'Rotate Document 90°'}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                    <span>90°</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 dark:text-slate-400">
                  {activeTab === 'redact' && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-sans text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      <Crosshair className="h-3 w-3" />
                      {lang === 'id' ? 'Mode Tarik Area Sensor' : 'Drag-to-Redact Mode'}
                    </span>
                  )}
                  <span className="rounded-md border border-slate-200/80 bg-slate-100 px-2 py-0.5 dark:border-slate-800 dark:bg-slate-900">
                    {sourceDimensions.width}×{sourceDimensions.height}px • EXIF Stripped
                  </span>
                </div>
              </div>

              {/* Central Dot-Grid Interactive Viewport */}
              <div
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
                className={`canvas-backdrop relative flex min-h-[290px] flex-1 items-center justify-center overflow-hidden p-4 sm:p-6 ${
                  activeTab === 'redact' ? 'cursor-crosshair select-none' : ''
                }`}
              >
                {activeTab === 'redact' && (
                  <div className="pointer-events-none absolute top-3 z-10 flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-slate-950/90 px-3.5 py-1 text-[11px] font-medium text-emerald-200 shadow-lg backdrop-blur-sm">
                    <Crosshair className="h-3.5 w-3.5 text-emerald-400" />
                    <span>
                      {lang === 'id'
                        ? 'Klik & seret langsung pada NIK / tanda tangan untuk melebur piksel'
                        : 'Click & drag over ID number / signature to burn pixels'}
                    </span>
                  </div>
                )}

                {activeTab === 'compress' && compressionResult ? (
                  <div className="relative flex max-h-full max-w-full flex-col items-center">
                    <img
                      src={compressionResult.dataUrl}
                      alt="Pratinjau Hasil Kompresi & Pasfoto"
                      className="max-h-[46vh] w-auto rounded-lg border border-slate-300/60 object-contain shadow-2xl dark:border-slate-700/80 lg:max-h-[calc(100dvh-230px)]"
                    />
                    <div className="mt-3 flex flex-wrap items-center justify-center gap-2 font-mono text-xs">
                      <span className="rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1 text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
                        {lang === 'id' ? 'Awal:' : 'Raw:'}{' '}
                        <strong>{formatBytes(compressionResult.originalBytes)}</strong>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 font-bold text-emerald-800 dark:text-emerald-300">
                        {lang === 'id' ? 'Hasil:' : 'Output:'}{' '}
                        {formatBytes(compressionResult.compressedBytes)} (Q:
                        {compressionResult.qualityUsed}%)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="relative inline-block max-w-full overflow-hidden rounded-lg ring-1 ring-slate-900/10 shadow-2xl dark:ring-white/10">
                    <canvas
                      ref={previewCanvasRef}
                      className="block max-h-[46vh] w-auto max-w-full object-contain lg:max-h-[calc(100dvh-210px)]"
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

              {/* Workbench Bottom Export & Pipeline Chaining Bar */}
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2.5 border-t border-slate-200/80 bg-white/95 px-4 py-2.5 dark:border-slate-800/80 dark:bg-[#0F1520]/95">
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'compress' && compressionResult ? (
                    <button
                      type="button"
                      onClick={handleDownloadCompressed}
                      className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:brightness-105"
                    >
                      <HardDriveDownload className="h-4 w-4 stroke-[2.2]" />
                      {lang === 'id'
                        ? `Simpan JPG (${formatBytes(compressionResult.compressedBytes)})`
                        : `Save JPG (${formatBytes(compressionResult.compressedBytes)})`}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleDownloadProtectedImage('jpeg')}
                        className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:brightness-105"
                      >
                        <Download className="h-4 w-4 stroke-[2.3]" />
                        {lang === 'id' ? 'Unduh JPG Aman' : 'Download Safe JPG'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownloadProtectedImage('png')}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                      >
                        <Download className="h-3.5 w-3.5" />
                        <span>PNG</span>
                      </button>
                    </>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === 'watermark' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('redact')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <span>{lang === 'id' ? 'Lanjut Sensor' : 'Next: Redact'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  {activeTab === 'redact' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('compress')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <span>{lang === 'id' ? 'Lanjut Target KB' : 'Next: Target KB'}</span>
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSendCurrentToPdfQueue}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-500/20 dark:text-emerald-300"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>{lang === 'id' ? 'Ke Antrean PDF' : 'Add to PDF'}</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            /* CENTER PANE WHEN TAB 4 (PDF BINDER) IS ACTIVE */
            <div className="canvas-backdrop vault-scroll flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
              <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white/95 p-5 shadow-xl backdrop-blur-sm dark:border-slate-800 dark:bg-[#0F1520]/95">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-3.5 dark:border-slate-800">
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white sm:text-base">
                      {lang === 'id'
                        ? 'Antrean Lembar Kerja PDF A4'
                        : 'A4 PDF Binder Queue'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Susun urutan KTP, NPWP, KK, atau Ijazah untuk digabung menjadi 1 PDF'
                        : 'Order ID cards and scans to combine into one local PDF'}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSendCurrentToPdfQueue}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <Plus className="h-3.5 w-3.5 text-emerald-500" />
                      {lang === 'id' ? 'Masukkan KTP Studio' : 'Insert Studio ID'}
                    </button>
                    <button
                      type="button"
                      onClick={() => pdfFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-emerald-400"
                    >
                      <Upload className="h-3.5 w-3.5 stroke-[2.3]" />
                      {lang === 'id' ? 'Tambah Berkas' : 'Add Files'}
                    </button>
                  </div>
                </div>

                {pdfQueue.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-800 dark:bg-slate-950/40">
                    <Layers className="mb-3 h-10 w-10 text-emerald-500/70" />
                    <p className="mb-1 text-sm font-bold text-slate-800 dark:text-slate-200">
                      {lang === 'id'
                        ? 'Antrean PDF Binder Masih Kosong'
                        : 'Your PDF Binder Queue Is Empty'}
                    </p>
                    <p className="mb-5 max-w-md text-xs text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Masukkan KTP ber-watermark dari studio atau seret beberapa berkas JPG/PNG/PDF (NPWP, Ijazah, KK) langsung ke area ini.'
                        : 'Insert your protected ID card from the studio or drag & drop multiple JPG/PNG/PDF files here.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleSendCurrentToPdfQueue}
                        className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 shadow-sm transition hover:bg-emerald-400"
                      >
                        {lang === 'id'
                          ? '+ Masukkan KTP dari Studio'
                          : '+ Insert Current Studio ID'}
                      </button>
                      <button
                        type="button"
                        onClick={() => pdfFileInputRef.current?.click()}
                        className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {lang === 'id' ? 'Pilih File Perangkat' : 'Browse Device Files'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="vault-scroll space-y-2 overflow-y-auto pr-1">
                    {pdfQueue.map((item, idx) => (
                      <li
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2.5 dark:border-slate-800 dark:bg-slate-900/70"
                      >
                        <div className="flex items-center gap-3 overflow-hidden">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            {idx + 1}
                          </span>
                          {item.type === 'image' && item.dataUrl ? (
                            <img
                              src={item.dataUrl}
                              alt={item.name}
                              className="h-10 w-14 shrink-0 rounded-lg border border-slate-200 object-cover dark:border-slate-700"
                            />
                          ) : (
                            <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-rose-500 dark:border-slate-700 dark:bg-slate-950">
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
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            title="Naikkan urutan"
                          >
                            <MoveUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pdfQueue.length - 1}
                            onClick={() => movePdfQueueItem(idx, 1)}
                            className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-200/70 hover:text-slate-900 disabled:opacity-30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            title="Turunkan urutan"
                          >
                            <MoveDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => removePdfQueueItem(item.id)}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-500"
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
            </div>
          )}
        </section>

        {/* -------------------------------------------------------
            PANE 3: RIGHT PRECISION INSPECTOR PANEL
           ------------------------------------------------------- */}
        <aside className="vault-scroll w-full shrink-0 border-t border-slate-200/90 bg-white p-4 dark:border-slate-800/90 dark:bg-[#0F1520] sm:p-5 lg:w-[376px] lg:overflow-y-auto lg:border-l lg:border-t-0 xl:w-[400px]">
          {/* INSPECTOR 1: WATERMARK */}
          {activeTab === 'watermark' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-emerald-500" />
                  <div>
                    <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                      {lang === 'id' ? 'Inspector Segel Watermark' : 'Watermark Inspector'}
                    </h2>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {lang === 'id'
                        ? 'Kunci tujuan pemakaian di atas area KTP'
                        : 'Stamp verification purpose across ID'}
                    </p>
                  </div>
                </div>

                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-800 dark:bg-slate-900">
                  <input
                    type="checkbox"
                    checked={watermarkEnabled}
                    onChange={(e) => setWatermarkEnabled(e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-emerald-500"
                  />
                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">
                    {watermarkEnabled ? 'ON' : 'OFF'}
                  </span>
                </label>
              </div>

              {/* Quick Purpose Presets */}
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                        className={`rounded-lg border px-2.5 py-1 text-[11.5px] font-semibold transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        {lang === 'id' ? preset.labelId : preset.labelEn}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Watermark Text & Subtext */}
              <div className="space-y-2.5">
                <div>
                  <label
                    htmlFor="wm-main-text"
                    className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {lang === 'id' ? 'Teks Segel Utama' : 'Primary Stamp Text'}
                  </label>
                  <input
                    id="wm-main-text"
                    type="text"
                    value={watermarkConfig.text}
                    onChange={(e) =>
                      setWatermarkConfig((prev) => ({ ...prev, text: e.target.value }))
                    }
                    placeholder="HANYA UNTUK VERIFIKASI..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-900 placeholder-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label
                    htmlFor="wm-sub-text"
                    className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-300"
                  >
                    {lang === 'id'
                      ? 'Baris Kedua (Tanggal / Instansi)'
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
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800 placeholder-slate-400 transition focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Pattern Mode & Ink Color */}
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id' ? 'Pola Segel' : 'Stamp Pattern'}
                  </label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-900">
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
                        className={`rounded-md py-1.5 text-xs font-bold transition ${
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

                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {lang === 'id' ? 'Warna Tinta' : 'Ink Color'}
                  </span>
                  <div className="flex items-center gap-2">
                    {WATERMARK_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        title={c.label}
                        onClick={() =>
                          setWatermarkConfig((prev) => ({ ...prev, color: c.hex }))
                        }
                        style={{ backgroundColor: c.hex }}
                        className={`h-6 w-6 rounded-full border border-slate-300 transition dark:border-slate-600 ${
                          watermarkConfig.color === c.hex
                            ? 'scale-110 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-[#0F1520]'
                            : 'opacity-80 hover:opacity-100'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Precision Sliders */}
              <div className="grid grid-cols-2 gap-3.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
                <div>
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Transparansi' : 'Opacity'}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
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
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Kemiringan' : 'Angle'}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
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
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Ukuran Huruf' : 'Font Size'}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
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
                  <div className="mb-1 flex justify-between text-[11.5px]">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Kerapatan' : 'Spacing'}
                    </span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
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

              {/* Timestamp Footer Toggle */}
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                <span className="font-semibold text-slate-700 dark:text-slate-300">
                  {lang === 'id'
                    ? 'Sertakan Pita Timestamp di Tepi Bawah'
                    : 'Include Bottom Timestamp Seal Bar'}
                </span>
                <input
                  type="checkbox"
                  checked={Boolean(watermarkConfig.addTimestampBorder)}
                  onChange={(e) =>
                    setWatermarkConfig((prev) => ({
                      ...prev,
                      addTimestampBorder: e.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded accent-emerald-500"
                />
              </label>
            </div>
          )}

          {/* INSPECTOR 2: PIXEL REDACTION */}
          {activeTab === 'redact' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Sensor Permanen NIK & Tanda Tangan'
                    : 'Permanent Pixel Redaction'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  {lang === 'id'
                    ? 'Tarik kursor pada gambar atau klik pintasan area KTP di bawah.'
                    : 'Drag across the canvas or click quick ID card masks below.'}
                </p>
              </div>

              {/* Redaction Style */}
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Metode Peleburan Piksel' : 'Redaction Method'}
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
                      className={`rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                        activeRedactionStyle === st.id
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      {lang === 'id' ? st.labelId : st.labelEn}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick ID Card Masks */}
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Pintasan Area KTP Standar' : 'Quick ID Area Masks'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { id: 'nik', labelId: '+ Baris NIK', labelEn: '+ ID Number' },
                      { id: 'signature', labelId: '+ Tanda Tangan', labelEn: '+ Signature' },
                      { id: 'address', labelId: '+ Alamat Rumah', labelEn: '+ Address' },
                      { id: 'photo', labelId: '+ Foto Wajah', labelEn: '+ Portrait' },
                    ] as const
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addQuickRedactionPreset(p.id)}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-emerald-500/50 hover:bg-emerald-500/5 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                    >
                      <span>{lang === 'id' ? p.labelId : p.labelEn}</span>
                      <EyeOff className="h-3.5 w-3.5 text-emerald-500" />
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Redaction List */}
              <div className="rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    {lang === 'id'
                      ? `Daftar Zona Sensor (${redactions.length})`
                      : `Redacted Zones (${redactions.length})`}
                  </span>
                  {redactions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRedactions([])}
                      className="text-xs font-bold text-rose-500 hover:underline"
                    >
                      {lang === 'id' ? 'Hapus Semua' : 'Clear All'}
                    </button>
                  )}
                </div>

                {redactions.length === 0 ? (
                  <p className="py-5 text-center text-xs text-slate-400">
                    {lang === 'id'
                      ? 'Belum ada area sensor. Klik & seret langsung pada pratinjau KTP.'
                      : 'No redaction zones yet. Click & drag on the ID preview.'}
                  </p>
                ) : (
                  <ul className="vault-scroll max-h-44 space-y-1.5 overflow-y-auto pr-1">
                    {redactions.map((box, i) => (
                      <li
                        key={box.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-white px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-950"
                      >
                        <span className="font-semibold text-slate-700 dark:text-slate-200">
                          Zona #{i + 1}{' '}
                          <span className="ml-1 rounded bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-600 dark:text-emerald-400">
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

              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-[11.5px] leading-relaxed text-slate-700 dark:text-slate-300">
                <strong className="text-emerald-700 dark:text-emerald-400">
                  Irreversible Burn:
                </strong>{' '}
                {lang === 'id'
                  ? 'Piksel asli di bawah area sensor dihancurkan permanen pada bitmap keluaran.'
                  : 'Underlying pixels are permanently destroyed in the exported bitmap.'}
              </div>
            </div>
          )}

          {/* INSPECTOR 3: TARGET KB & PASFOTO */}
          {activeTab === 'compress' && (
            <div className="space-y-4">
              <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
                <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  {lang === 'id'
                    ? 'Kompresor Target KB & Rasio Pasfoto'
                    : 'Target-KB Compressor & Crop'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                  {lang === 'id'
                    ? 'Otomatis paskan batas unggah SSCASN/CPNS, BUMN, dan e-KYC.'
                    : 'Fit strict portal upload caps (100KB, 200KB, 300KB) automatically.'}
                </p>
              </div>

              {/* Target KB Presets */}
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Target Ukuran Maksimal' : 'Max Size Target'}
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[100, 200, 300, 500].map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => setTargetKb(kb)}
                      className={`rounded-lg border py-2 font-mono text-xs font-bold transition ${
                        targetKb === kb
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      ≤{kb}K
                    </button>
                  ))}
                </div>

                <div className="mt-2.5 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/60">
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="font-medium text-slate-600 dark:text-slate-400">
                      {lang === 'id' ? 'Batas Kustom Presisi:' : 'Custom KB Cap:'}
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

              {/* Aspect Ratio Crop */}
              <div>
                <label className="mb-1.5 block font-mono text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {lang === 'id' ? 'Rasio Pemotongan (Crop)' : 'Aspect Ratio Crop'}
                </label>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      { id: 'original', labelId: 'Asli', labelEn: 'Orig' },
                      { id: 'ktp', labelId: 'KTP', labelEn: 'ID' },
                      { id: '3x4', labelId: '3×4', labelEn: '3×4' },
                      { id: '4x6', labelId: '4×6', labelEn: '4×6' },
                      { id: '1x1', labelId: '1×1', labelEn: '1×1' },
                    ] as { id: CropPreset; labelId: string; labelEn: string }[]
                  ).map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setCropPreset(preset.id)}
                      className={`rounded-lg border py-2 text-xs font-bold transition ${
                        cropPreset === preset.id
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
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
                    ? 'Warna Latar (PNG Transparan)'
                    : 'Backdrop Fill (Transparent PNG)'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'red', label: 'Merah', hex: '#dc2626' },
                    { id: 'blue', label: 'Biru', hex: '#0284c7' },
                    { id: 'white', label: 'Putih', hex: '#ffffff' },
                  ].map((bg) => (
                    <button
                      key={bg.id}
                      type="button"
                      onClick={() => setPasfotoBg(bg.hex)}
                      className={`flex items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition ${
                        pasfotoBg === bg.hex
                          ? 'border-emerald-500 bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                    >
                      <span
                        style={{ backgroundColor: bg.hex }}
                        className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 dark:border-slate-600"
                      />
                      <span>{bg.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Compression Telemetry */}
              {compressionResult && (
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.07] p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {lang === 'id' ? 'Telemetri Kompresi' : 'Compression Telemetry'}
                    </span>
                    <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      {compressionResult.compressedBytes <= targetKb * 1024
                        ? 'TARGET OK'
                        : 'MAX RATIO'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[10px] text-slate-400">Output</div>
                      <div className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">
                        {formatBytes(compressionResult.compressedBytes)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[10px] text-slate-400">Dimensi</div>
                      <div className="font-mono text-xs font-bold text-slate-800 dark:text-slate-200">
                        {compressionResult.width}×{compressionResult.height}
                      </div>
                    </div>
                    <div className="rounded-lg border border-slate-200/70 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
                      <div className="text-[10px] text-slate-400">Kualitas</div>
                      <div className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400">
                        {compressionResult.qualityUsed}%
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* INSPECTOR 4: PDF BINDER LAYOUT & EXPORT */}
          {activeTab === 'pdf' && (
            <div className="flex h-full flex-col justify-between space-y-5">
              <div className="space-y-4">
                <div className="border-b border-slate-200/80 pb-3 dark:border-slate-800">
                  <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    {lang === 'id' ? 'Tata Letak & Ekspor PDF A4' : 'A4 PDF Layout & Export'}
                  </h2>
                  <p className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400">
                    {lang === 'id'
                      ? 'Pilih format penyusunan kartu identitas atau berkas pindaian.'
                      : 'Select how documents are arranged on each PDF page.'}
                  </p>
                </div>

                <div className="space-y-2">
                  {[
                    {
                      id: 'a4-id-cards' as PdfPageLayout,
                      titleId: 'KTP + NPWP Satu Lembar A4 (2 Kartu/Hal)',
                      titleEn: '2 ID Cards per A4 Sheet (KTP + NPWP)',
                      descId:
                        'Standar lampiran HRD & Bank: menyusun hingga 2 kartu identitas proporsional di 1 halaman A4.',
                      descEn:
                        'Places up to 2 ID cards centered proportionally on a single A4 portrait sheet.',
                    },
                    {
                      id: 'a4-portrait' as PdfPageLayout,
                      titleId: 'Dokumen A4 Standar (1 Berkas/Hal)',
                      titleEn: 'Standard A4 Portrait (1 Scan/Page)',
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
                        'Ukuran halaman PDF mengikuti dimensi piksel asli masing-masing gambar.',
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
                        className={`w-full rounded-xl border p-3 text-left transition ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/25'
                            : 'border-slate-200 bg-slate-50 hover:bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-slate-900'
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

              <div className="space-y-2.5 border-t border-slate-200/80 pt-4 dark:border-slate-800">
                <button
                  type="button"
                  disabled={pdfQueue.length === 0 || isBuildingPdf}
                  onClick={handleGenerateCombinedPdf}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-xs font-extrabold text-slate-950 shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileStack className="h-4 w-4 stroke-[2.3]" />
                  {isBuildingPdf
                    ? lang === 'id'
                      ? 'Menyusun PDF Lokal...'
                      : 'Building Local PDF...'
                    : lang === 'id'
                      ? `Gabung & Buat PDF (${pdfQueue.length} Berkas)`
                      : `Merge & Generate PDF (${pdfQueue.length} Files)`}
                </button>

                {pdfDownloadUrl && (
                  <a
                    href={pdfDownloadUrl}
                    download={`dokumen-amandok-${todayStr}.pdf`}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-4 py-3 text-xs font-extrabold text-emerald-800 transition hover:bg-emerald-500/25 dark:text-emerald-300"
                  >
                    <Download className="h-4 w-4" />
                    {lang === 'id'
                      ? `Unduh PDF (${formatBytes(pdfSizeBytes)})`
                      : `Download PDF (${formatBytes(pdfSizeBytes)})`}
                  </a>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* =========================================================
          MOBILE BOTTOM PIPELINE NAVIGATION BAR (< 1024px)
         ========================================================= */}
      <nav
        aria-label="Mobile Studio Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-4 border-t border-slate-200/90 bg-white/95 px-2 backdrop-blur-md dark:border-slate-800/90 dark:bg-[#0F1520]/95 lg:hidden"
      >
        {studioTools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTab === tool.id;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => setActiveTab(tool.id)}
              className={`relative flex flex-col items-center justify-center gap-1 transition ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-0.5 w-10 rounded-b-full bg-emerald-500" />
              )}
              <div className="relative">
                <Icon className="h-4 w-4" />
                {tool.badge && (
                  <span className="absolute -right-5 -top-1.5 rounded bg-emerald-500/20 px-1 font-mono text-[9px] font-bold text-emerald-600 dark:text-emerald-300">
                    {tool.badge}
                  </span>
                )}
              </div>
              <span className="text-[10.5px] font-bold">
                {lang === 'id' ? tool.shortId : tool.shortEn}
              </span>
            </button>
          );
        })}
      </nav>

      {/* =========================================================
          CYBER-VAULT PRIVACY ARCHITECTURE MODAL
         ========================================================= */}
      {showVaultInfo && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          onClick={() => setShowVaultInfo(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#0F1520]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                    {lang === 'id'
                      ? 'Arsitektur Privasi Cyber-Vault AmanDok'
                      : 'AmanDok Cyber-Vault Privacy Architecture'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    100% Client-Side • Zero Cloud Storage • PWA Offline Ready
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVaultInfo(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <strong className="text-slate-900 dark:text-white">
                  1. Tanpa Upload Server (0 KB Network Payload)
                </strong>
                <p className="mt-1">
                  Seluruh foto KTP, NPWP, tanda tangan, dan berkas PDF diproses langsung di memori
                  RAM perangkat Anda menggunakan HTML5 Canvas &amp; WebAssembly/JS lokal. Tidak ada
                  API pengiriman gambar ke server mana pun.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <strong className="text-slate-900 dark:text-white">
                  2. Pembersihan Otomatis Metadata EXIF &amp; Lokasi GPS
                </strong>
                <p className="mt-1">
                  Saat foto dimuat, AmanDok otomatis me-render ulang piksel bersih dan membuang tag
                  EXIF kamera serta koordinat GPS tersembunyi.
                </p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900/70">
                <strong className="text-slate-900 dark:text-white">
                  3. Dapat Diuji dalam Mode Pesawat (Offline)
                </strong>
                <p className="mt-1">
                  Setelah halaman ini terbuka (atau di-install sebagai PWA), Anda dapat mematikan
                  koneksi internet/Wi-Fi sepenuhnya dan seluruh fitur tetap berjalan 100%.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVaultInfo(false)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-emerald-400"
              >
                {lang === 'id' ? 'Mengerti & Kembali ke Studio' : 'Got It'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
