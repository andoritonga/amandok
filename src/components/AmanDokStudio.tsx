import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Download,
  Eraser,
  EyeOff,
  FilePlus2,
  FileStack,
  Gauge,
  Languages,
  Lock,
  Moon,
  Plus,
  RotateCw,
  ShieldCheck,
  Stamp,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  compressToTargetKb,
  formatBytes,
  generateSampleKtpDataUrl,
  loadNormalizedImage,
  renderDocumentCanvas,
  type CompressionResult,
  type CropPreset,
  type RedactionBox,
  type RedactionStyle,
  type WatermarkConfig,
  type WatermarkMode,
} from '../utils/imageProcessor';
import {
  buildCombinedPdf,
  type PdfPageLayout,
  type PdfQueueItem,
} from '../utils/pdfBuilder';

type StudioTab = 'watermark' | 'redact' | 'compress' | 'pdf';
type Lang = 'id' | 'en';

interface LoadedDocument {
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  fileName: string;
  isSample: boolean;
}

const VALID_TABS: StudioTab[] = ['watermark', 'redact', 'compress', 'pdf'];

const TEXT = {
  id: {
    brandSub: 'Studio Privasi Lokal',
    privacyBtn: 'Privasi',
    privacyAria: 'Buka rincian arsitektur privasi lokal',
    langAria: 'Ubah bahasa ke English',
    themeDarkAria: 'Aktifkan mode gelap',
    themeLightAria: 'Aktifkan mode terang',
    wipeBtn: 'Kosongkan Meja',
    wipeAria: 'Kosongkan seluruh dokumen dari memori peramban',
    sampleNotice:
      'Sedang menampilkan contoh KTP sintetis. Unggah dokumen asli Anda untuk mulai memproses secara lokal.',
    uploadRealBtn: 'Unggah Dokumen Asli',
    sampleBadge: 'Contoh Sintetis',
    emptyTitle: 'Meja Dokumen Kosong',
    emptyDesc:
      'Semua pemrosesan berjalan 100% di peramban Anda. Nol byte dokumen dikirim atau disimpan di server mana pun.',
    emptyChooseBtn: 'Pilih Gambar dari Perangkat',
    emptySampleBtn: 'Muat Contoh KTP Sintetis',
    changeImage: 'Ganti Gambar',
    rotateBtn: 'Putar 90°',
    exportImgBtn: 'Unduh Gambar',
    addToPdfBtn: 'Tambah ke Antrean PDF',
    loadingImage: 'Membaca dan membersihkan metadata EXIF gambar...',
    loadingCompress: 'Menjalankan kompresi target ukuran KB...',
    loadingPdf: 'Menyusun dokumen PDF lokal...',
    errorReadFile: 'Gagal membaca berkas gambar. Pastikan format JPG, PNG, atau WEBP valid.',
    errorCompress: 'Gagal mengompres gambar di peramban. Coba gunakan berkas dengan dimensi lebih kecil.',
    errorPdf: 'Gagal membuat berkas PDF. Periksa kembali item gambar di antrean.',
    dismissError: 'Tutup pesan galat',
    tabs: {
      watermark: { label: 'Watermark', short: 'Watermark', desc: 'Cap teks anti-penyalahgunaan' },
      redact: { label: 'Sensor NIK', short: 'Sensor', desc: 'Tutup data sensitif permanen' },
      compress: { label: 'Kompres KB', short: 'Kompres', desc: 'Target ukuran & pas foto' },
      pdf: { label: 'Gabung PDF', short: 'PDF', desc: 'Susun berkas ke dokumen PDF' },
    },
    watermark: {
      presetsTitle: 'Preset Tujuan Verifikasi',
      presets: [
        { key: 'fintech', label: 'Fintech / Pinjol', text: 'HANYA UNTUK VERIFIKASI FINTECH' },
        { key: 'hr', label: 'Lamaran Kerja', text: 'UNTUK LAMARAN KERJA RESMI' },
        { key: 'ewallet', label: 'E-Wallet / Bank', text: 'VERIFIKASI AKUN PEMBAYARAN' },
        { key: 'rent', label: 'Sewa / Properti', text: 'UNTUK ADMINISTRASI SEWA' },
      ],
      modeTitle: 'Pola Sebaran',
      modeSingle: 'Diagonal Tunggal',
      modeTiled: 'Pola Berulang',
      purposeLabel: 'Teks Tujuan (Baris 1)',
      dateLabel: 'Tanggal & Keterangan (Baris 2)',
      fontSizeLabel: 'Skala Ukuran Huruf',
      opacityLabel: 'Ketebalan Tinta',
      angleLabel: 'Sudut Miring',
      colorLabel: 'Warna Tinta',
      colors: [
        { hex: '#0f172a', name: 'Hitam Arsip' },
        { hex: '#dc2626', name: 'Merah Dokumen' },
        { hex: '#2563eb', name: 'Biru Tinta' },
        { hex: '#047857', name: 'Hijau Segel' },
        { hex: '#475569', name: 'Abu Slate' },
        { hex: '#ffffff', name: 'Putih Bersih' },
      ],
    },
    redact: {
      hint: 'Seret langsung pada kanvas dokumen untuk menutup area NIK, alamat, atau tanda tangan.',
      styleLabel: 'Gaya Penyensoran Permanen',
      styles: [
        { key: 'pixelate', label: 'Pixelate' },
        { key: 'blur', label: 'Blur' },
        { key: 'blackout', label: 'Blok Hitam' },
        { key: 'whiteout', label: 'Blok Putih' },
      ] as { key: RedactionStyle; label: string }[],
      quickLabel: 'Pintasan Area Standar KTP',
      addNik: '+ Area NIK',
      addSig: '+ Tanda Tangan',
      listTitle: 'Daftar Kotak Sensor',
      clearAll: 'Hapus Semua',
      none: 'Belum ada area sensor. Seret di kanvas atau pakai pintasan di atas.',
      boxPrefix: 'Kotak Sensor',
      deleteBox: 'Hapus kotak sensor',
    },
    compress: {
      targetLabel: 'Batas Maksimum Ukuran Berkas',
      cropLabel: 'Rasio Bingkai & Pas Foto',
      crops: [
        { key: 'original', label: 'Asli' },
        { key: '3x4', label: 'Pas Foto 3:4' },
        { key: 'ktp', label: 'Kartu KTP' },
      ] as { key: CropPreset; label: string }[],
      bgLabel: 'Warna Latar Pas Foto (3:4)',
      bgs: [
        { hex: '#D91E18', label: 'Merah' },
        { hex: '#0052CC', label: 'Biru' },
        { hex: '#FFFFFF', label: 'Putih' },
      ],
      runBtn: 'Kompres & Terapkan Rasio',
      resultTitle: 'Hasil Kompresi Lokal',
      beforeLabel: 'Asli',
      afterLabel: 'Hasil',
      savedLabel: 'Hemat',
      downloadCompressed: 'Unduh JPEG Terkompresi',
    },
    pdf: {
      layoutLabel: 'Tata Letak Halaman PDF',
      layouts: [
        { key: 'a4-portrait', label: 'A4 Portrait (1/halaman)' },
        { key: 'a4-id-cards', label: 'A4 Kartu ID (2/halaman)' },
        { key: 'fit-image', label: 'Sesuai Ukuran Gambar' },
      ] as { key: PdfPageLayout; label: string }[],
      addCurrentBtn: 'Tambah Dokumen Saat Ini',
      addFilesBtn: 'Pilih Gambar dari Perangkat',
      queueTitle: 'Antrean Halaman PDF',
      emptyQueue: 'Antrean PDF masih kosong. Tambahkan gambar dari alat lain atau pilih berkas.',
      moveUp: 'Geser ke atas',
      moveDown: 'Geser ke bawah',
      removeItem: 'Hapus dari antrean',
      buildBtn: 'Gabungkan & Siapkan PDF',
      readyText: 'PDF siap diunduh secara lokal:',
      downloadPdfBtn: 'Unduh Berkas PDF',
    },
    dialog: {
      title: 'Arsitektur Privasi Lokal (Zero-Upload)',
      closeAria: 'Tutup dialog arsitektur privasi',
      intro:
        'AmanDok memproses seluruh gambar dan dokumen Anda langsung di memori peramban menggunakan HTML5 Canvas API dan pdf-lib.',
      items: [
        {
          heading: 'Nol Koneksi Unggah Dokumen',
          body: 'Tidak ada file atau hasil ekspor yang dikirim ke server eksternal maupun pihak ketiga.',
        },
        {
          heading: 'Pembersihan Metadata EXIF Otomatis',
          body: 'Saat gambar dimuat ulang lewat kanvas, informasi sensitif kamera dan koordinat GPS ikut terhapus.',
        },
        {
          heading: 'Memori Terisolasi Tanpa Penyimpanan Permanen',
          body: 'Gambar dokumen tidak pernah ditulis ke localStorage atau IndexedDB. Tekan Kosongkan Meja untuk mencabut seluruh URL objek dari RAM.',
        },
      ],
      doneBtn: 'Tutup Penjelasan',
    },
    footer: {
      guarantee: '100% Lokal di Peramban (Zero-Upload). EXIF/GPS dibersihkan saat ekspor.',
      attribution: 'Dikembangkan oleh Yohannes C. Ritonga',
    },
    statusBar: {
      docLabel: 'Dokumen',
      none: 'Kosong',
      redactionsLabel: 'Sensor',
      queueLabel: 'Antrean PDF',
    },
  },
  en: {
    brandSub: 'Local Privacy Studio',
    privacyBtn: 'Privacy',
    privacyAria: 'Open local privacy architecture details',
    langAria: 'Switch language to Indonesian',
    themeDarkAria: 'Switch to dark theme',
    themeLightAria: 'Switch to light theme',
    wipeBtn: 'Wipe Desk',
    wipeAria: 'Clear all documents from browser memory',
    sampleNotice:
      'Showing a synthetic ID sample. Upload your real document to begin local processing.',
    uploadRealBtn: 'Upload Real Document',
    sampleBadge: 'Synthetic Sample',
    emptyTitle: 'Document Desk Empty',
    emptyDesc:
      'All processing runs 100% inside your browser. Zero document bytes are transmitted to or stored on any server.',
    emptyChooseBtn: 'Choose Image from Device',
    emptySampleBtn: 'Load Synthetic ID Sample',
    changeImage: 'Replace Image',
    rotateBtn: 'Rotate 90°',
    exportImgBtn: 'Download Image',
    addToPdfBtn: 'Add to PDF Queue',
    loadingImage: 'Decoding image and stripping EXIF metadata...',
    loadingCompress: 'Running target-KB compression...',
    loadingPdf: 'Building local PDF document...',
    errorReadFile: 'Failed to read image file. Please provide a valid JPG, PNG, or WEBP file.',
    errorCompress: 'Failed to compress image in browser. Try a smaller source file.',
    errorPdf: 'Failed to build PDF document. Check the queued image items.',
    dismissError: 'Dismiss error message',
    tabs: {
      watermark: { label: 'Watermark', short: 'Watermark', desc: 'Anti-abuse verification text' },
      redact: { label: 'Redact ID', short: 'Redact', desc: 'Permanent pixel masking' },
      compress: { label: 'Compress KB', short: 'Compress', desc: 'Target size & ID photo crop' },
      pdf: { label: 'Merge PDF', short: 'PDF', desc: 'Combine pages into one PDF' },
    },
    watermark: {
      presetsTitle: 'Verification Presets',
      presets: [
        { key: 'fintech', label: 'Fintech / KYC', text: 'FOR FINTECH KYC VERIFICATION ONLY' },
        { key: 'hr', label: 'Job Application', text: 'FOR OFFICIAL JOB APPLICATION' },
        { key: 'ewallet', label: 'E-Wallet / Bank', text: 'PAYMENT ACCOUNT VERIFICATION' },
        { key: 'rent', label: 'Lease / Property', text: 'FOR RENTAL ADMINISTRATION ONLY' },
      ],
      modeTitle: 'Layout Pattern',
      modeSingle: 'Single Diagonal',
      modeTiled: 'Tiled Pattern',
      purposeLabel: 'Purpose Text (Line 1)',
      dateLabel: 'Date & Reference (Line 2)',
      fontSizeLabel: 'Font Size Scale',
      opacityLabel: 'Ink Opacity',
      angleLabel: 'Tilt Angle',
      colorLabel: 'Ink Color',
      colors: [
        { hex: '#0f172a', name: 'Archive Black' },
        { hex: '#dc2626', name: 'Document Red' },
        { hex: '#2563eb', name: 'Stamp Blue' },
        { hex: '#047857', name: 'Seal Green' },
        { hex: '#475569', name: 'Slate Gray' },
        { hex: '#ffffff', name: 'Pure White' },
      ],
    },
    redact: {
      hint: 'Drag directly across the document canvas to cover ID numbers, addresses, or signatures.',
      styleLabel: 'Permanent Redaction Style',
      styles: [
        { key: 'pixelate', label: 'Pixelate' },
        { key: 'blur', label: 'Blur' },
        { key: 'blackout', label: 'Solid Black' },
        { key: 'whiteout', label: 'Solid White' },
      ] as { key: RedactionStyle; label: string }[],
      quickLabel: 'Quick ID Area Presets',
      addNik: '+ ID Number Box',
      addSig: '+ Signature Box',
      listTitle: 'Redaction Boxes',
      clearAll: 'Clear All',
      none: 'No redaction boxes yet. Drag on canvas or use the quick presets above.',
      boxPrefix: 'Redaction Box',
      deleteBox: 'Delete redaction box',
    },
    compress: {
      targetLabel: 'Maximum File Size Limit',
      cropLabel: 'Aspect Ratio & ID Photo Frame',
      crops: [
        { key: 'original', label: 'Original' },
        { key: '3x4', label: '3:4 ID Photo' },
        { key: 'ktp', label: 'ID Card' },
      ] as { key: CropPreset; label: string }[],
      bgLabel: 'ID Photo Background (3:4)',
      bgs: [
        { hex: '#D91E18', label: 'Red' },
        { hex: '#0052CC', label: 'Blue' },
        { hex: '#FFFFFF', label: 'White' },
      ],
      runBtn: 'Compress & Apply Crop',
      resultTitle: 'Local Compression Output',
      beforeLabel: 'Original',
      afterLabel: 'Output',
      savedLabel: 'Saved',
      downloadCompressed: 'Download Compressed JPEG',
    },
    pdf: {
      layoutLabel: 'PDF Page Layout',
      layouts: [
        { key: 'a4-portrait', label: 'A4 Portrait (1/page)' },
        { key: 'a4-id-cards', label: 'A4 ID Cards (2/page)' },
        { key: 'fit-image', label: 'Fit Image Dimensions' },
      ] as { key: PdfPageLayout; label: string }[],
      addCurrentBtn: 'Add Active Document',
      addFilesBtn: 'Add Images from Device',
      queueTitle: 'PDF Page Queue',
      emptyQueue: 'Your PDF queue is empty. Add your active canvas or upload images from device.',
      moveUp: 'Move up',
      moveDown: 'Move down',
      removeItem: 'Remove from queue',
      buildBtn: 'Merge & Prepare PDF',
      readyText: 'PDF built locally and ready:',
      downloadPdfBtn: 'Download PDF File',
    },
    dialog: {
      title: 'Local Privacy Architecture (Zero-Upload)',
      closeAria: 'Close privacy architecture dialog',
      intro:
        'AmanDok processes every image and PDF page entirely in browser memory via the HTML5 Canvas API and pdf-lib.',
      items: [
        {
          heading: 'Zero Upload Network Calls',
          body: 'No source documents or exported files are ever uploaded to or cached on external servers.',
        },
        {
          heading: 'Automatic EXIF & GPS Stripping',
          body: 'Redrawing images on the local canvas strips embedded camera hardware tags and location coordinates.',
        },
        {
          heading: 'RAM-Only Session Isolation',
          body: 'Document pixels are never saved in localStorage or IndexedDB. Use Wipe Desk to revoke object URLs immediately.',
        },
      ],
      doneBtn: 'Close Details',
    },
    footer: {
      guarantee: '100% Browser-Local (Zero-Upload). Camera EXIF/GPS stripped on export.',
      attribution: 'Engineered by Yohannes C. Ritonga',
    },
    statusBar: {
      docLabel: 'Document',
      none: 'Empty',
      redactionsLabel: 'Redactions',
      queueLabel: 'PDF Queue',
    },
  },
} as const;

function getTodayFormatted(lang: Lang): string {
  const now = new Date();
  return now.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getInitialLang(): Lang {
  if (typeof window === 'undefined') return 'id';
  try {
    return localStorage.getItem('amandok_lang') === 'en' ? 'en' : 'id';
  } catch {
    return 'id';
  }
}

function getInitialTheme(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

function getInitialTab(): StudioTab {
  if (typeof window === 'undefined') return 'watermark';
  const param = new URLSearchParams(window.location.search).get('tab');
  if (param && VALID_TABS.includes(param as StudioTab)) {
    return param as StudioTab;
  }
  return 'watermark';
}

export default function AmanDokStudio() {
  const [lang, setLang] = useState<Lang>('id');
  const [isDark, setIsDark] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<StudioTab>('watermark');

  const [docState, setDocState] = useState<LoadedDocument | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [watermarkEnabled, setWatermarkEnabled] = useState<boolean>(true);
  const [wmConfig, setWmConfig] = useState<WatermarkConfig>({
    text: 'HANYA UNTUK VERIFIKASI FINTECH',
    subtext: '',
    mode: 'tiled',
    color: '#dc2626',
    opacity: 0.34,
    angle: -32,
    fontSizeScale: 1.0,
    spacingScale: 1.0,
    rotation: 0,
    addTimestampBorder: false,
  });

  const [redactions, setRedactions] = useState<RedactionBox[]>([]);
  const [redactionStyle, setRedactionStyle] = useState<RedactionStyle>('pixelate');
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);

  const [targetKb, setTargetKb] = useState<number>(100);
  const [cropPreset, setCropPreset] = useState<CropPreset>('original');
  const [bgColor, setBgColor] = useState<string>('#D91E18');
  const [compressResult, setCompressResult] = useState<CompressionResult | null>(null);

  const [pdfQueue, setPdfQueue] = useState<PdfQueueItem[]>([]);
  const [pdfLayout, setPdfLayout] = useState<PdfPageLayout>('a4-portrait');
  const [pdfDownloadUrl, setPdfDownloadUrl] = useState<string | null>(null);
  const [pdfByteSize, setPdfByteSize] = useState<number>(0);

  const [privacyOpen, setPrivacyOpen] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfFileInputRef = useRef<HTMLInputElement | null>(null);
  const privacyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pdfUrlRef = useRef<string | null>(null);

  const t = TEXT[lang];

  const loadSampleDocument = useCallback((currentLang: Lang) => {
    const sample = generateSampleKtpDataUrl();
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setDocState({
        dataUrl: sample.dataUrl,
        width: sample.width,
        height: sample.height,
        originalBytes: sample.bytes,
        fileName: 'contoh-ktp-sintetis.png',
        isSample: true,
      });
      setRedactions([]);
      setCompressResult(null);
      setErrorMessage(null);
      setWmConfig((prev) => ({
        ...prev,
        subtext: getTodayFormatted(currentLang),
      }));
    };
    img.src = sample.dataUrl;
  }, []);

  useEffect(() => {
    const initialLang = getInitialLang();
    setLang(initialLang);
    setIsDark(getInitialTheme());
    setActiveTab(getInitialTab());
    loadSampleDocument(initialLang);

    return () => {
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
        pdfUrlRef.current = null;
      }
    };
  }, [loadSampleDocument]);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('amandok_lang', lang);
    } catch {
      // Ignore storage failures
    }
  }, [lang]);

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    const meta = document.getElementById('amandok-theme-color');
    if (meta) {
      meta.setAttribute('content', isDark ? '#090d16' : '#f1f5f9');
    }
    try {
      localStorage.setItem('amandok_theme', isDark ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [isDark]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !docState) return;

    const previewRedactions: RedactionBox[] = [...redactions];
    if (dragStart && dragCurrent) {
      const x = Math.min(dragStart.x, dragCurrent.x);
      const y = Math.min(dragStart.y, dragCurrent.y);
      const width = Math.abs(dragCurrent.x - dragStart.x);
      const height = Math.abs(dragCurrent.y - dragStart.y);
      if (width > 0.005 && height > 0.005) {
        previewRedactions.push({
          id: 'draft-drag',
          x,
          y,
          width,
          height,
          style: redactionStyle,
        });
      }
    }

    renderDocumentCanvas(
      canvas,
      img,
      watermarkEnabled ? wmConfig : null,
      previewRedactions
    );
  }, [
    docState,
    watermarkEnabled,
    wmConfig,
    redactions,
    dragStart,
    dragCurrent,
    redactionStyle,
  ]);

  useEffect(() => {
    if (!privacyOpen) return;

    const previousFocused = document.activeElement as HTMLElement | null;
    const dialogNode = dialogRef.current;
    if (dialogNode) {
      const firstFocusable = dialogNode.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setPrivacyOpen(false);
        return;
      }
      if (event.key === 'Tab' && dialogNode) {
        const focusables = Array.from(
          dialogNode.querySelectorAll<HTMLElement>(
            'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocused && typeof previousFocused.focus === 'function') {
        previousFocused.focus();
      } else {
        privacyTriggerRef.current?.focus();
      }
    };
  }, [privacyOpen]);

  const handleToggleLang = () => {
    const nextLang: Lang = lang === 'id' ? 'en' : 'id';
    setLang(nextLang);
    setWmConfig((prev) => ({
      ...prev,
      subtext: getTodayFormatted(nextLang),
      text:
        prev.text === TEXT.id.watermark.presets[0].text
          ? TEXT.en.watermark.presets[0].text
          : prev.text === TEXT.en.watermark.presets[0].text
            ? TEXT.id.watermark.presets[0].text
            : prev.text,
    }));
  };

  const handleLoadImageFile = async (file: File) => {
    setErrorMessage(null);
    setStatusMessage(t.loadingImage);
    try {
      const normalized = await loadNormalizedImage(file);
      const img = new Image();
      img.onload = () => {
        loadedImageRef.current = img;
        setDocState({
          dataUrl: normalized.dataUrl,
          width: normalized.width,
          height: normalized.height,
          originalBytes: normalized.originalBytes,
          fileName: file.name,
          isSample: false,
        });
        setRedactions([]);
        setCompressResult(null);
        setStatusMessage(null);
      };
      img.onerror = () => {
        setStatusMessage(null);
        setErrorMessage(t.errorReadFile);
      };
      img.src = normalized.dataUrl;
    } catch {
      setStatusMessage(null);
      setErrorMessage(t.errorReadFile);
    }
  };

  const handleRotateDocument = () => {
    const img = loadedImageRef.current;
    if (!img || !docState) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.naturalHeight || docState.height;
    tempCanvas.height = img.naturalWidth || docState.width;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return;

    ctx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    ctx.rotate((90 * Math.PI) / 180);
    ctx.drawImage(img, -docState.width / 2, -docState.height / 2, docState.width, docState.height);

    const rotatedDataUrl = tempCanvas.toDataURL('image/png');
    const nextImg = new Image();
    nextImg.onload = () => {
      loadedImageRef.current = nextImg;
      setDocState((prev) =>
        prev
          ? {
              ...prev,
              dataUrl: rotatedDataUrl,
              width: tempCanvas.width,
              height: tempCanvas.height,
            }
          : null
      );
      setRedactions([]);
      setCompressResult(null);
    };
    nextImg.src = rotatedDataUrl;
  };

  const handleWipeDesk = () => {
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current);
      pdfUrlRef.current = null;
    }
    loadedImageRef.current = null;
    setDocState(null);
    setRedactions([]);
    setCompressResult(null);
    setPdfQueue([]);
    setPdfDownloadUrl(null);
    setPdfByteSize(0);
    setStatusMessage(null);
    setErrorMessage(null);
  };

  const getRelativeCanvasPoint = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'redact' || !docState) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getRelativeCanvasPoint(event.clientX, event.clientY);
    if (point) {
      setDragStart(point);
      setDragCurrent(point);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (activeTab !== 'redact' || !dragStart) return;
    const point = getRelativeCanvasPoint(event.clientX, event.clientY);
    if (point) {
      setDragCurrent(point);
    }
  };

  const handlePointerUp = () => {
    if (activeTab !== 'redact' || !dragStart || !dragCurrent) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    const x = Math.min(dragStart.x, dragCurrent.x);
    const y = Math.min(dragStart.y, dragCurrent.y);
    const width = Math.abs(dragCurrent.x - dragStart.x);
    const height = Math.abs(dragCurrent.y - dragStart.y);

    if (width > 0.015 && height > 0.015) {
      setRedactions((prev) => [
        ...prev,
        {
          id: `redact-${Date.now()}-${prev.length + 1}`,
          x,
          y,
          width,
          height,
          style: redactionStyle,
        },
      ]);
    }
    setDragStart(null);
    setDragCurrent(null);
  };

  const handleAddQuickRedaction = (preset: 'nik' | 'signature') => {
    if (!docState) return;
    const box: RedactionBox =
      preset === 'nik'
        ? {
            id: `nik-${Date.now()}`,
            x: 0.25,
            y: 0.22,
            width: 0.36,
            height: 0.08,
            style: redactionStyle,
          }
        : {
            id: `sig-${Date.now()}`,
            x: 0.72,
            y: 0.72,
            width: 0.22,
            height: 0.16,
            style: redactionStyle,
          };
    setRedactions((prev) => [...prev, box]);
  };

  const exportCanvasDataUrl = (): string | null => {
    const canvas = canvasRef.current;
    if (!canvas || !docState) return null;
    return canvas.toDataURL('image/png');
  };

  const handleDownloadCanvasImage = () => {
    const dataUrl = exportCanvasDataUrl();
    if (!dataUrl || !docState) return;
    const baseName = docState.fileName.replace(/\.[^.]+$/, '');
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = `${baseName}-amandok.png`;
    anchor.click();
  };

  const handleAddCurrentToPdfQueue = () => {
    const dataUrl =
      activeTab === 'compress' && compressResult ? compressResult.dataUrl : exportCanvasDataUrl();
    if (!dataUrl || !docState) return;
    const width = activeTab === 'compress' && compressResult ? compressResult.width : docState.width;
    const height =
      activeTab === 'compress' && compressResult ? compressResult.height : docState.height;
    const sizeBytes =
      activeTab === 'compress' && compressResult
        ? compressResult.compressedBytes
        : docState.originalBytes;

    setPdfQueue((prev) => [
      ...prev,
      {
        id: `pdf-${Date.now()}-${prev.length + 1}`,
        name: docState.fileName,
        type: 'image',
        dataUrl,
        width,
        height,
        sizeBytes,
      },
    ]);
    setActiveTab('pdf');
  };

  const handleRunCompression = async () => {
    const canvas = canvasRef.current;
    const img = loadedImageRef.current;
    if (!canvas || !img || !docState) return;

    setErrorMessage(null);
    setStatusMessage(t.loadingCompress);
    try {
      const renderedUrl = canvas.toDataURL('image/png');
      const renderedImg = new Image();
      await new Promise<void>((resolve, reject) => {
        renderedImg.onload = () => resolve();
        renderedImg.onerror = () => reject(new Error('Image decode error'));
        renderedImg.src = renderedUrl;
      });

      const result = await compressToTargetKb(renderedImg, {
        targetKb,
        cropPreset,
        bgColor,
        originalBytes: docState.originalBytes,
      });
      setCompressResult(result);
      setStatusMessage(null);
    } catch {
      setStatusMessage(null);
      setErrorMessage(t.errorCompress);
    }
  };

  const handleDownloadCompressed = () => {
    if (!compressResult || !docState) return;
    const baseName = docState.fileName.replace(/\.[^.]+$/, '');
    const anchor = document.createElement('a');
    anchor.href = compressResult.dataUrl;
    anchor.download = `${baseName}-${targetKb}kb.jpg`;
    anchor.click();
  };

  const handleAddPdfFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(t.loadingImage);
    try {
      const added: PdfQueueItem[] = [];
      for (const file of Array.from(files)) {
        const normalized = await loadNormalizedImage(file);
        added.push({
          id: `pdf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          type: 'image',
          dataUrl: normalized.dataUrl,
          width: normalized.width,
          height: normalized.height,
          sizeBytes: normalized.originalBytes,
        });
      }
      setPdfQueue((prev) => [...prev, ...added]);
      setStatusMessage(null);
    } catch {
      setStatusMessage(null);
      setErrorMessage(t.errorReadFile);
    }
  };

  const handleMovePdfItem = (index: number, direction: -1 | 1) => {
    setPdfQueue((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(targetIndex, 0, item);
      return copy;
    });
  };

  const handleBuildPdf = async () => {
    if (pdfQueue.length === 0) return;
    setErrorMessage(null);
    setStatusMessage(t.loadingPdf);
    try {
      const bytes = await buildCombinedPdf(pdfQueue, pdfLayout);
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current);
      }
      const buffer = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(buffer).set(bytes);
      const blob = new Blob([buffer], { type: 'application/pdf' });
      const nextUrl = URL.createObjectURL(blob);
      pdfUrlRef.current = nextUrl;
      setPdfDownloadUrl(nextUrl);
      setPdfByteSize(blob.size);
      setStatusMessage(null);
    } catch {
      setStatusMessage(null);
      setErrorMessage(t.errorPdf);
    }
  };

  const savingsPct =
    compressResult && compressResult.originalBytes > 0
      ? Math.max(
          0,
          Math.round(
            ((compressResult.originalBytes - compressResult.compressedBytes) /
              compressResult.originalBytes) *
              100
          )
        )
      : 0;

  return (
    <div className="flex-1 flex flex-col min-h-0 w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleLoadImageFile(file);
          e.currentTarget.value = '';
        }}
      />

      <input
        ref={pdfFileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="sr-only"
        onChange={(e) => {
          void handleAddPdfFiles(e.target.files);
          e.currentTarget.value = '';
        }}
      />

      {/* Single compact top studio header */}
      <header className="sticky top-0 z-30 studio-header shrink-0">
        <div className="max-w-[1600px] mx-auto px-3 sm:px-5 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-surface)',
                border: '1px solid var(--accent-border)',
                color: 'var(--accent-text)',
              }}
            >
              <ShieldCheck className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm sm:text-base font-bold tracking-tight truncate"
                  style={{ color: 'var(--text-primary)' }}
                >
                  AmanDok
                </span>
                <span
                  className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border"
                  style={{
                    backgroundColor: 'var(--accent-surface)',
                    borderColor: 'var(--accent-border)',
                    color: 'var(--accent-text)',
                  }}
                >
                  <Lock className="w-3 h-3" aria-hidden="true" />
                  Zero-Upload
                </span>
              </div>
              <p
                className="hidden sm:block text-xs truncate"
                style={{ color: 'var(--text-muted)' }}
              >
                {t.brandSub}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              ref={privacyTriggerRef}
              type="button"
              onClick={() => setPrivacyOpen(true)}
              aria-haspopup="dialog"
              aria-label={t.privacyAria}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
              <span className="hidden sm:inline">{t.privacyBtn}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleLang}
              aria-label={t.langAria}
              className="inline-flex items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-2.5 rounded-lg text-xs font-bold border transition-transform active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <Languages className="w-3.5 h-3.5 hidden sm:inline shrink-0" aria-hidden="true" />
              <span>{lang.toUpperCase()}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsDark((prev) => !prev)}
              aria-label={isDark ? t.themeLightAria : t.themeDarkAria}
              className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border transition-transform active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              {isDark ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            <button
              type="button"
              onClick={handleWipeDesk}
              aria-label={t.wipeAria}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-2.5 sm:px-3 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.97]"
              style={{
                backgroundColor: 'var(--danger-surface)',
                borderColor: 'var(--danger-border)',
                color: 'var(--danger-text)',
              }}
            >
              <Trash2 className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="hidden md:inline">{t.wipeBtn}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Tablet top horizontal tool switcher (768px - 1023px) */}
      <nav
        aria-label="Tool Switcher"
        className="hidden md:flex lg:hidden items-center justify-center gap-2 px-4 py-2 border-b shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        {VALID_TABS.map((tabKey) => {
          const active = activeTab === tabKey;
          const Icon =
            tabKey === 'watermark'
              ? Stamp
              : tabKey === 'redact'
                ? EyeOff
                : tabKey === 'compress'
                  ? Gauge
                  : FileStack;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
              style={{
                backgroundColor: active ? 'var(--accent-surface)' : 'var(--bg-subtle)',
                borderColor: active ? 'var(--accent-border)' : 'var(--border-subtle)',
                color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
              }}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{t.tabs[tabKey].label}</span>
            </button>
          );
        })}
      </nav>

      {/* Main 3-state studio workspace */}
      <div className="flex-1 flex flex-col md:grid md:grid-cols-[minmax(0,1fr)_320px] lg:flex lg:flex-row lg:min-h-0">
        {/* Desktop left tool rail (>= 1024px) */}
        <aside
          aria-label="Studio Tools"
          className="hidden lg:flex lg:flex-col w-60 shrink-0 border-r p-3 justify-between gap-4"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          <div className="space-y-1.5">
            {VALID_TABS.map((tabKey) => {
              const active = activeTab === tabKey;
              const Icon =
                tabKey === 'watermark'
                  ? Stamp
                  : tabKey === 'redact'
                    ? EyeOff
                    : tabKey === 'compress'
                      ? Gauge
                      : FileStack;
              return (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className="w-full min-h-[52px] px-3 py-2.5 rounded-lg border text-left flex items-start gap-3 transition-transform active:scale-[0.99]"
                  style={{
                    backgroundColor: active ? 'var(--accent-surface)' : 'transparent',
                    borderColor: active ? 'var(--accent-border)' : 'transparent',
                    color: active ? 'var(--accent-text)' : 'var(--text-primary)',
                  }}
                >
                  <Icon className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold leading-tight">
                      {t.tabs[tabKey].label}
                    </span>
                    <span
                      className="block text-xs mt-0.5 leading-snug"
                      style={{ color: 'var(--text-muted)' }}
                    >
                      {t.tabs[tabKey].desc}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-lg p-3 border text-xs space-y-2 tabular-nums"
            style={{
              backgroundColor: 'var(--bg-subtle)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-secondary)',
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>{t.statusBar.docLabel}</span>
              <span className="font-semibold truncate max-w-[115px]" style={{ color: 'var(--text-primary)' }}>
                {docState ? formatBytes(docState.originalBytes) : t.statusBar.none}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>{t.statusBar.redactionsLabel}</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {redactions.length}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span style={{ color: 'var(--text-muted)' }}>{t.statusBar.queueLabel}</span>
              <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
                {pdfQueue.length}
              </span>
            </div>
          </div>
        </aside>

        {/* Center document stage */}
        <section
          aria-label="Document Preview Stage"
          className="flex-1 min-w-0 flex flex-col lg:min-h-0"
        >
          {/* Visible sample indicator banner on both mobile and desktop */}
          {docState?.isSample && (
            <div
              className="px-3 sm:px-5 py-2.5 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              style={{
                backgroundColor: 'var(--accent-surface)',
                borderColor: 'var(--accent-border)',
              }}
            >
              <p className="text-xs leading-snug" style={{ color: 'var(--text-primary)' }}>
                <span className="font-bold mr-1.5" style={{ color: 'var(--accent-text)' }}>
                  [{t.sampleBadge}]
                </span>
                {t.sampleNotice}
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3.5 rounded-lg text-xs font-semibold shrink-0 transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--accent-solid)',
                  color: 'var(--accent-on-solid)',
                }}
              >
                <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{t.uploadRealBtn}</span>
              </button>
            </div>
          )}

          {/* Status & Error notifications */}
          {statusMessage && (
            <div
              role="status"
              aria-live="polite"
              className="px-4 py-2.5 border-b text-xs font-medium flex items-center gap-2"
              style={{
                backgroundColor: 'var(--bg-subtle)',
                borderColor: 'var(--border-subtle)',
                color: 'var(--text-primary)',
              }}
            >
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="px-4 py-2.5 border-b text-xs font-medium flex items-center justify-between gap-3"
              style={{
                backgroundColor: 'var(--danger-surface)',
                borderColor: 'var(--danger-border)',
                color: 'var(--danger-text)',
              }}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                aria-label={t.dismissError}
                className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-md shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          )}

          {/* Active canvas stage or empty desk */}
          <div className="flex-1 min-h-[260px] sm:min-h-[340px] lg:min-h-0 flex flex-col document-mat p-3 sm:p-5 lg:overflow-y-auto custom-scrollbar">
            {!docState ? (
              <div className="m-auto max-w-md w-full rounded-xl p-6 sm:p-8 text-center studio-panel space-y-5">
                <div
                  className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center"
                  style={{
                    backgroundColor: 'var(--accent-surface)',
                    border: '1px solid var(--accent-border)',
                    color: 'var(--accent-text)',
                  }}
                >
                  <ShieldCheck className="w-6 h-6" aria-hidden="true" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {t.emptyTitle}
                  </h2>
                  <p className="text-xs sm:text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {t.emptyDesc}
                  </p>
                </div>
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--accent-solid)',
                      color: 'var(--accent-on-solid)',
                    }}
                  >
                    <Upload className="w-4 h-4" aria-hidden="true" />
                    <span>{t.emptyChooseBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => loadSampleDocument(lang)}
                    className="w-full min-h-[44px] px-4 py-2.5 rounded-lg text-sm font-semibold border inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                    <span>{t.emptySampleBtn}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full max-w-3xl mx-auto my-auto flex flex-col gap-3">
                {/* Compact stage action strip */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.changeImage}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRotateDocument}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.rotateBtn}</span>
                    </button>
                  </div>

                  <div
                    className="inline-flex items-center gap-2 px-3 min-h-[44px] rounded-lg border text-xs font-medium tabular-nums"
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>
                      {docState.width} x {docState.height} px
                    </span>
                    <span aria-hidden="true">|</span>
                    <span>{formatBytes(docState.originalBytes)}</span>
                  </div>
                </div>

                {/* Framed Document Canvas */}
                <div
                  className="relative rounded-xl p-2 sm:p-3 studio-panel flex items-center justify-center overflow-hidden"
                >
                  <canvas
                    ref={canvasRef}
                    width={docState.width}
                    height={docState.height}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    className={`max-w-full max-h-[52vh] lg:max-h-[60vh] h-auto rounded-lg select-none ${
                      activeTab === 'redact' ? 'cursor-crosshair touch-none' : 'cursor-default'
                    }`}
                  />

                  {activeTab === 'compress' && cropPreset !== 'original' && (
                    <div
                      aria-hidden="true"
                      className={`pointer-events-none absolute inset-4 rounded-lg crop-frame ${
                        cropPreset === '3x4'
                          ? 'aspect-[3/4] max-h-[82%] mx-auto my-auto'
                          : 'aspect-[1.586/1] max-w-[88%] mx-auto my-auto'
                      }`}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Control Inspector (or bottom flow on mobile < 768px) */}
        <aside
          aria-label="Tool Controls"
          className="w-full md:w-80 lg:w-[340px] xl:w-[360px] shrink-0 border-t md:border-t-0 md:border-l p-4 space-y-5 lg:overflow-y-auto custom-scrollbar"
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderColor: 'var(--border-subtle)',
          }}
        >
          {/* TAB 1: WATERMARK */}
          {activeTab === 'watermark' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t.tabs.watermark.label}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.tabs.watermark.desc}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.watermark.presetsTitle}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {t.watermark.presets.map((preset) => {
                    const selected = wmConfig.text === preset.text && watermarkEnabled;
                    return (
                      <button
                        key={preset.key}
                        type="button"
                        onClick={() => {
                          setWatermarkEnabled(true);
                          setWmConfig((prev) => ({ ...prev, text: preset.text }));
                        }}
                        className="min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold border text-left transition-transform active:scale-[0.98]"
                        style={{
                          backgroundColor: selected ? 'var(--accent-surface)' : 'var(--bg-subtle)',
                          borderColor: selected ? 'var(--accent-border)' : 'var(--border-subtle)',
                          color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                        }}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.watermark.modeTitle}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(['tiled', 'single'] as WatermarkMode[]).map((mode) => {
                    const selected = wmConfig.mode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setWmConfig((prev) => ({ ...prev, mode }))}
                        className="min-h-[44px] px-3 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
                        style={{
                          backgroundColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--bg-subtle)',
                          borderColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--border-subtle)',
                          color: selected ? 'var(--neutral-active-text)' : 'var(--text-primary)',
                        }}
                      >
                        {mode === 'tiled' ? t.watermark.modeTiled : t.watermark.modeSingle}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="wm-purpose-input"
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.watermark.purposeLabel}
                </label>
                <input
                  id="wm-purpose-input"
                  type="text"
                  value={wmConfig.text}
                  onChange={(e) => {
                    setWatermarkEnabled(true);
                    setWmConfig((prev) => ({ ...prev, text: e.target.value }));
                  }}
                  className="w-full min-h-[44px] px-3 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="wm-date-input"
                  className="block text-xs font-semibold"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {t.watermark.dateLabel}
                </label>
                <input
                  id="wm-date-input"
                  type="text"
                  value={wmConfig.subtext || ''}
                  onChange={(e) => {
                    setWatermarkEnabled(true);
                    setWmConfig((prev) => ({ ...prev, subtext: e.target.value }));
                  }}
                  className="w-full min-h-[44px] px-3 rounded-lg border text-sm"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label htmlFor="wm-size-slider" style={{ color: 'var(--text-secondary)' }}>
                    {t.watermark.fontSizeLabel}
                  </label>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {Math.round(wmConfig.fontSizeScale * 100)}%
                  </span>
                </div>
                <input
                  id="wm-size-slider"
                  type="range"
                  min={50}
                  max={200}
                  step={5}
                  value={Math.round(wmConfig.fontSizeScale * 100)}
                  onChange={(e) =>
                    setWmConfig((prev) => ({
                      ...prev,
                      fontSizeScale: Number(e.target.value) / 100,
                    }))
                  }
                  className="studio-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label htmlFor="wm-opacity-slider" style={{ color: 'var(--text-secondary)' }}>
                    {t.watermark.opacityLabel}
                  </label>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {Math.round(wmConfig.opacity * 100)}%
                  </span>
                </div>
                <input
                  id="wm-opacity-slider"
                  type="range"
                  min={10}
                  max={85}
                  value={Math.round(wmConfig.opacity * 100)}
                  onChange={(e) =>
                    setWmConfig((prev) => ({
                      ...prev,
                      opacity: Number(e.target.value) / 100,
                    }))
                  }
                  className="studio-range"
                />
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <label htmlFor="wm-angle-slider" style={{ color: 'var(--text-secondary)' }}>
                    {t.watermark.angleLabel}
                  </label>
                  <span className="tabular-nums" style={{ color: 'var(--text-primary)' }}>
                    {wmConfig.angle}°
                  </span>
                </div>
                <input
                  id="wm-angle-slider"
                  type="range"
                  min={-60}
                  max={60}
                  value={wmConfig.angle}
                  onChange={(e) =>
                    setWmConfig((prev) => ({ ...prev, angle: Number(e.target.value) }))
                  }
                  className="studio-range"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.watermark.colorLabel}
                </p>
                <div className="flex flex-wrap gap-2">
                  {t.watermark.colors.map((swatch) => {
                    const selected = wmConfig.color === swatch.hex;
                    return (
                      <button
                        key={swatch.hex}
                        type="button"
                        onClick={() =>
                          setWmConfig((prev) => ({ ...prev, color: swatch.hex }))
                        }
                        aria-label={swatch.name}
                        title={swatch.name}
                        className="w-11 h-11 rounded-lg border flex items-center justify-center transition-transform active:scale-[0.95]"
                        style={{
                          backgroundColor: swatch.hex,
                          borderColor: selected ? 'var(--accent-solid)' : 'var(--border-strong)',
                          boxShadow: selected ? '0 0 0 2px var(--accent-solid)' : undefined,
                          color: swatch.hex === '#ffffff' ? '#0f172a' : '#ffffff',
                        }}
                      >
                        {selected && <Check className="w-4 h-4" aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2 space-y-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  disabled={!docState}
                  onClick={handleDownloadCanvasImage}
                  className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--accent-solid)',
                    color: 'var(--accent-on-solid)',
                  }}
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>{t.exportImgBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={!docState}
                  onClick={handleAddCurrentToPdfQueue}
                  className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold border inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                  <span>{t.addToPdfBtn}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: REDACT */}
          {activeTab === 'redact' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t.tabs.redact.label}
                </h2>
                <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {t.redact.hint}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.redact.styleLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {t.redact.styles.map((item) => {
                    const selected = redactionStyle === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setRedactionStyle(item.key)}
                        className="min-h-[44px] px-2 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
                        style={{
                          backgroundColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--bg-subtle)',
                          borderColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--border-subtle)',
                          color: selected ? 'var(--neutral-active-text)' : 'var(--text-primary)',
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.redact.quickLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={!docState}
                    onClick={() => handleAddQuickRedaction('nik')}
                    className="min-h-[44px] px-3 rounded-lg text-xs font-semibold border disabled:opacity-45 transition-transform active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {t.redact.addNik}
                  </button>
                  <button
                    type="button"
                    disabled={!docState}
                    onClick={() => handleAddQuickRedaction('signature')}
                    className="min-h-[44px] px-3 rounded-lg text-xs font-semibold border disabled:opacity-45 transition-transform active:scale-[0.98]"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-primary)',
                    }}
                  >
                    {t.redact.addSig}
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {t.redact.listTitle} ({redactions.length})
                  </p>
                  {redactions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRedactions([])}
                      className="min-h-[44px] px-2.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1"
                      style={{ color: 'var(--danger-text)' }}
                    >
                      <Eraser className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{t.redact.clearAll}</span>
                    </button>
                  )}
                </div>

                {redactions.length === 0 ? (
                  <p
                    className="text-xs rounded-lg p-3 border leading-relaxed"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t.redact.none}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {redactions.map((box, index) => (
                      <li
                        key={box.id}
                        className="rounded-lg border px-3 py-1.5 flex items-center justify-between gap-2"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {t.redact.boxPrefix} #{index + 1}
                          </p>
                          <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {Math.round(box.width * 100)}% x {Math.round(box.height * 100)}%
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setRedactions((prev) => prev.filter((item) => item.id !== box.id))
                          }
                          aria-label={`${t.redact.deleteBox} #${index + 1}`}
                          className="min-h-[44px] min-w-[44px] rounded-lg inline-flex items-center justify-center shrink-0"
                          style={{ color: 'var(--danger-text)' }}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-2 space-y-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  disabled={!docState}
                  onClick={handleDownloadCanvasImage}
                  className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--accent-solid)',
                    color: 'var(--accent-on-solid)',
                  }}
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>{t.exportImgBtn}</span>
                </button>
                <button
                  type="button"
                  disabled={!docState}
                  onClick={handleAddCurrentToPdfQueue}
                  className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold border inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                  <span>{t.addToPdfBtn}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: COMPRESS */}
          {activeTab === 'compress' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t.tabs.compress.label}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.tabs.compress.desc}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.compress.targetLabel}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[100, 200, 500, 1024].map((kb) => {
                    const selected = targetKb === kb;
                    const label = kb === 1024 ? '<= 1 MB' : `<= ${kb} KB`;
                    return (
                      <button
                        key={kb}
                        type="button"
                        onClick={() => setTargetKb(kb)}
                        className="min-h-[44px] px-3 rounded-lg text-xs font-semibold border tabular-nums transition-transform active:scale-[0.98]"
                        style={{
                          backgroundColor: selected ? 'var(--accent-surface)' : 'var(--bg-subtle)',
                          borderColor: selected ? 'var(--accent-border)' : 'var(--border-subtle)',
                          color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.compress.cropLabel}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {t.compress.crops.map((crop) => {
                    const selected = cropPreset === crop.key;
                    return (
                      <button
                        key={crop.key}
                        type="button"
                        onClick={() => setCropPreset(crop.key)}
                        className="min-h-[44px] px-2 rounded-lg text-xs font-semibold border transition-transform active:scale-[0.98]"
                        style={{
                          backgroundColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--bg-subtle)',
                          borderColor: selected
                            ? 'var(--neutral-active-bg)'
                            : 'var(--border-subtle)',
                          color: selected ? 'var(--neutral-active-text)' : 'var(--text-primary)',
                        }}
                      >
                        {crop.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {cropPreset === '3x4' && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    {t.compress.bgLabel}
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {t.compress.bgs.map((bg) => {
                      const selected = bgColor === bg.hex;
                      return (
                        <button
                          key={bg.hex}
                          type="button"
                          onClick={() => setBgColor(bg.hex)}
                          className="min-h-[44px] px-2 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-1.5"
                          style={{
                            backgroundColor: selected ? 'var(--accent-surface)' : 'var(--bg-subtle)',
                            borderColor: selected ? 'var(--accent-border)' : 'var(--border-subtle)',
                            color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                          }}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border shrink-0"
                            style={{ backgroundColor: bg.hex, borderColor: 'var(--border-strong)' }}
                            aria-hidden="true"
                          />
                          <span>{bg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                type="button"
                disabled={!docState}
                onClick={() => void handleRunCompression()}
                className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                style={{
                  backgroundColor: 'var(--accent-solid)',
                  color: 'var(--accent-on-solid)',
                }}
              >
                <Gauge className="w-4 h-4" aria-hidden="true" />
                <span>{t.compress.runBtn}</span>
              </button>

              {compressResult && (
                <div
                  className="rounded-xl border p-3.5 space-y-3"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      {t.compress.resultTitle}
                    </p>
                    <span
                      className="text-xs font-bold tabular-nums"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      -{savingsPct}% {t.compress.savedLabel}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs tabular-nums">
                    <div
                      className="rounded-lg p-2 border"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <span className="block" style={{ color: 'var(--text-muted)' }}>
                        {t.compress.beforeLabel}
                      </span>
                      <strong style={{ color: 'var(--text-primary)' }}>
                        {formatBytes(compressResult.originalBytes)}
                      </strong>
                    </div>
                    <div
                      className="rounded-lg p-2 border"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                      }}
                    >
                      <span className="block" style={{ color: 'var(--text-muted)' }}>
                        {t.compress.afterLabel}
                      </span>
                      <strong style={{ color: 'var(--accent-text)' }}>
                        {formatBytes(compressResult.compressedBytes)}
                      </strong>
                    </div>
                  </div>

                  <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <img
                      src={compressResult.dataUrl}
                      alt={t.compress.resultTitle}
                      width={compressResult.width}
                      height={compressResult.height}
                      className="w-full max-h-40 object-contain"
                      style={{ backgroundColor: 'var(--bg-mat)' }}
                    />
                  </div>

                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {compressResult.width} x {compressResult.height} px | JPEG{' '}
                    {Math.round(compressResult.qualityUsed * 100)}%
                  </p>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleDownloadCompressed}
                      className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--accent-solid)',
                        color: 'var(--accent-on-solid)',
                      }}
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>{t.compress.downloadCompressed}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleAddCurrentToPdfQueue}
                      className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold border inline-flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                      style={{
                        backgroundColor: 'var(--bg-surface)',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--text-primary)',
                      }}
                    >
                      <FilePlus2 className="w-4 h-4" aria-hidden="true" />
                      <span>{t.addToPdfBtn}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PDF MERGER */}
          {activeTab === 'pdf' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {t.tabs.pdf.label}
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {t.tabs.pdf.desc}
                </p>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.pdf.layoutLabel}
                </p>
                <div className="space-y-2">
                  {t.pdf.layouts.map((layout) => {
                    const selected = pdfLayout === layout.key;
                    return (
                      <button
                        key={layout.key}
                        type="button"
                        onClick={() => setPdfLayout(layout.key)}
                        className="w-full min-h-[44px] px-3 rounded-lg text-xs font-semibold border text-left transition-transform active:scale-[0.99]"
                        style={{
                          backgroundColor: selected ? 'var(--accent-surface)' : 'var(--bg-subtle)',
                          borderColor: selected ? 'var(--accent-border)' : 'var(--border-subtle)',
                          color: selected ? 'var(--accent-text)' : 'var(--text-primary)',
                        }}
                      >
                        {layout.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  disabled={!docState}
                  onClick={handleAddCurrentToPdfQueue}
                  className="w-full min-h-[44px] px-3 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-2 disabled:opacity-45"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>{t.pdf.addCurrentBtn}</span>
                </button>
                <button
                  type="button"
                  onClick={() => pdfFileInputRef.current?.click()}
                  className="w-full min-h-[44px] px-3 rounded-lg text-xs font-semibold border inline-flex items-center justify-center gap-2"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                    color: 'var(--text-primary)',
                  }}
                >
                  <Upload className="w-4 h-4" aria-hidden="true" />
                  <span>{t.pdf.addFilesBtn}</span>
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
                  {t.pdf.queueTitle} ({pdfQueue.length})
                </p>

                {pdfQueue.length === 0 ? (
                  <p
                    className="text-xs rounded-lg p-3 border leading-relaxed"
                    style={{
                      backgroundColor: 'var(--bg-subtle)',
                      borderColor: 'var(--border-subtle)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {t.pdf.emptyQueue}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pdfQueue.map((item, idx) => (
                      <li
                        key={item.id}
                        className="rounded-lg border p-2 flex items-center gap-2"
                        style={{
                          backgroundColor: 'var(--bg-subtle)',
                          borderColor: 'var(--border-subtle)',
                        }}
                      >
                        {item.dataUrl && (
                          <img
                            src={item.dataUrl}
                            alt={item.name}
                            width={item.width || 44}
                            height={item.height || 44}
                            className="w-11 h-11 object-cover rounded border shrink-0"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                            {idx + 1}. {item.name}
                          </p>
                          <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                            {formatBytes(item.sizeBytes)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMovePdfItem(idx, -1)}
                            aria-label={`${t.pdf.moveUp} ${item.name}`}
                            className="min-h-[44px] min-w-[44px] rounded-lg border inline-flex items-center justify-center disabled:opacity-35"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === pdfQueue.length - 1}
                            onClick={() => handleMovePdfItem(idx, 1)}
                            aria-label={`${t.pdf.moveDown} ${item.name}`}
                            className="min-h-[44px] min-w-[44px] rounded-lg border inline-flex items-center justify-center disabled:opacity-35"
                            style={{
                              backgroundColor: 'var(--bg-surface)',
                              borderColor: 'var(--border-subtle)',
                              color: 'var(--text-primary)',
                            }}
                          >
                            <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setPdfQueue((prev) => prev.filter((q) => q.id !== item.id))
                            }
                            aria-label={`${t.pdf.removeItem} ${item.name}`}
                            className="min-h-[44px] min-w-[44px] rounded-lg border inline-flex items-center justify-center"
                            style={{
                              backgroundColor: 'var(--danger-surface)',
                              borderColor: 'var(--danger-border)',
                              color: 'var(--danger-text)',
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="pt-2 space-y-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  type="button"
                  disabled={pdfQueue.length === 0}
                  onClick={() => void handleBuildPdf()}
                  className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-45 transition-transform active:scale-[0.98]"
                  style={{
                    backgroundColor: 'var(--accent-solid)',
                    color: 'var(--accent-on-solid)',
                  }}
                >
                  <FileStack className="w-4 h-4" aria-hidden="true" />
                  <span>{t.pdf.buildBtn}</span>
                </button>

                {pdfDownloadUrl && (
                  <div
                    className="rounded-lg border p-3 space-y-2"
                    style={{
                      backgroundColor: 'var(--accent-surface)',
                      borderColor: 'var(--accent-border)',
                    }}
                  >
                    <p className="text-xs font-medium tabular-nums" style={{ color: 'var(--text-primary)' }}>
                      {t.pdf.readyText} <strong>{formatBytes(pdfByteSize)}</strong>
                    </p>
                    <a
                      href={pdfDownloadUrl}
                      download="amandok-dokumen.pdf"
                      className="w-full min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2"
                      style={{
                        backgroundColor: 'var(--accent-solid)',
                        color: 'var(--accent-on-solid)',
                      }}
                    >
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>{t.pdf.downloadPdfBtn}</span>
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Studio Footer landmark (compact bar on desktop, normal flow above mobile dock on < md) */}
      <footer
        className="border-t px-4 py-3 pb-24 md:pb-3 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
          color: 'var(--text-muted)',
        }}
      >
        <span>{t.footer.guarantee}</span>
        <span>{t.footer.attribution}</span>
      </footer>

      {/* Mobile Bottom Tool Dock (< 768px) */}
      <nav
        aria-label="Mobile Tool Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t px-2 py-1.5"
        style={{
          backgroundColor: 'var(--bg-surface)',
          borderColor: 'var(--border-subtle)',
        }}
      >
        <div className="grid grid-cols-4 gap-1.5">
          {VALID_TABS.map((tabKey) => {
            const active = activeTab === tabKey;
            const Icon =
              tabKey === 'watermark'
                ? Stamp
                : tabKey === 'redact'
                  ? EyeOff
                  : tabKey === 'compress'
                    ? Gauge
                    : FileStack;
            return (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className="min-h-[48px] px-1 py-1.5 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-transform active:scale-[0.97]"
                style={{
                  backgroundColor: active ? 'var(--accent-surface)' : 'transparent',
                  borderColor: active ? 'var(--accent-border)' : 'transparent',
                  color: active ? 'var(--accent-text)' : 'var(--text-secondary)',
                }}
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span className="truncate max-w-full">{t.tabs[tabKey].short}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Accessible Privacy & Architecture Modal Dialog */}
      {privacyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.65)' }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setPrivacyOpen(false);
            }
          }}
        >
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="privacy-dialog-title"
            className="w-full max-w-lg rounded-xl border p-5 sm:p-6 space-y-4 shadow-xl"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
              color: 'var(--text-primary)',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-surface)',
                    border: '1px solid var(--accent-border)',
                    color: 'var(--accent-text)',
                  }}
                >
                  <Lock className="w-4 h-4" aria-hidden="true" />
                </span>
                <h2 id="privacy-dialog-title" className="text-base font-bold">
                  {t.dialog.title}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                aria-label={t.dialog.closeAria}
                className="min-h-[44px] min-w-[44px] rounded-lg border inline-flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {t.dialog.intro}
            </p>

            <div className="space-y-3">
              {t.dialog.items.map((item) => (
                <div
                  key={item.heading}
                  className="rounded-lg border p-3 space-y-1"
                  style={{
                    backgroundColor: 'var(--bg-subtle)',
                    borderColor: 'var(--border-subtle)',
                  }}
                >
                  <h3 className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                    {item.heading}
                  </h3>
                  <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {item.body}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPrivacyOpen(false)}
                className="min-h-[44px] px-4 rounded-lg text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--accent-solid)',
                  color: 'var(--accent-on-solid)',
                }}
              >
                {t.dialog.doneBtn}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
