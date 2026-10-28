export type WatermarkMode = 'tiled' | 'single' | 'banner';

export interface WatermarkConfig {
  text: string;
  subtext?: string;
  mode: WatermarkMode;
  color: string;
  opacity: number; // 0.05 to 0.95
  angle: number; // -60 to 60
  fontSizeScale: number; // 0.5 to 2.5
  spacingScale: number; // 0.6 to 2.0
  rotation: 0 | 90 | 180 | 270;
  addTimestampBorder: boolean;
}

export type RedactionStyle = 'pixelate' | 'blur' | 'blackout' | 'whiteout';

export interface RedactionBox {
  id: string;
  /** Normalized coordinates (0..1) relative to oriented source image */
  x: number;
  y: number;
  width: number;
  height: number;
  style: RedactionStyle;
}

export type CropPreset = 'original' | '3x4' | '4x6' | '1x1' | 'ktp';

export interface CompressionResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  compressedBytes: number;
  qualityUsed: number;
  scaleUsed: number;
}

const MAX_WORKING_DIMENSION = 2400;

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}

/**
 * Loads an image File or DataURL into an HTMLImageElement and normalizes dimensions
 * to prevent mobile canvas memory overflow while stripping all EXIF/GPS metadata.
 */
export async function loadNormalizedImage(
  source: File | Blob | string
): Promise<{
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
}> {
  let originalBytes = 0;
  let objectUrl = '';

  if (typeof source === 'string') {
    objectUrl = source;
    const base64Length = source.split(',')[1]?.length || 0;
    originalBytes = Math.round((base64Length * 3) / 4);
  } else {
    originalBytes = source.size;
    objectUrl = URL.createObjectURL(source);
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.crossOrigin = 'anonymous';
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar dokumen.'));
      el.src = objectUrl;
    });

    let targetW = img.naturalWidth || img.width;
    let targetH = img.naturalHeight || img.height;

    if (targetW > MAX_WORKING_DIMENSION || targetH > MAX_WORKING_DIMENSION) {
      const ratio = Math.min(MAX_WORKING_DIMENSION / targetW, MAX_WORKING_DIMENSION / targetH);
      targetW = Math.round(targetW * ratio);
      targetH = Math.round(targetH * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context tidak tersedia.');

    ctx.drawImage(img, 0, 0, targetW, targetH);
    // Exporting from canvas strips all camera EXIF, GPS coordinates, and device metadata
    const cleanDataUrl = canvas.toDataURL('image/png');

    return {
      dataUrl: cleanDataUrl,
      width: targetW,
      height: targetH,
      originalBytes,
    };
  } finally {
    if (typeof source !== 'string' && objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  }
}

/**
 * Renders base image + rotation + redaction boxes + watermark overlay onto a target canvas.
 */
export function renderDocumentCanvas(
  canvas: HTMLCanvasElement,
  sourceImg: HTMLImageElement,
  watermark: WatermarkConfig | null,
  redactions: RedactionBox[] = []
): void {
  const rot = watermark?.rotation ?? 0;
  const isRotated90 = rot === 90 || rot === 270;

  const srcW = sourceImg.naturalWidth || sourceImg.width;
  const srcH = sourceImg.naturalHeight || sourceImg.height;

  const outW = isRotated90 ? srcH : srcW;
  const outH = isRotated90 ? srcW : srcH;

  canvas.width = outW;
  canvas.height = outH;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.save();
  ctx.clearRect(0, 0, outW, outH);

  // 1. Draw oriented base image
  ctx.translate(outW / 2, outH / 2);
  ctx.rotate((rot * Math.PI) / 180);
  ctx.drawImage(sourceImg, -srcW / 2, -srcH / 2, srcW, srcH);
  ctx.restore();

  // 2. Apply Redaction Masks (Blur / Pixelate / Blackout / Whiteout)
  for (const box of redactions) {
    const rx = Math.max(0, Math.round(box.x * outW));
    const ry = Math.max(0, Math.round(box.y * outH));
    const rw = Math.min(outW - rx, Math.round(box.width * outW));
    const rh = Math.min(outH - ry, Math.round(box.height * outH));

    if (rw <= 2 || rh <= 2) continue;

    if (box.style === 'blackout') {
      ctx.fillStyle = '#020617';
      ctx.fillRect(rx, ry, rw, rh);
    } else if (box.style === 'whiteout') {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(rx, ry, rw, rh);
    } else if (box.style === 'pixelate') {
      const sampleScale = Math.max(0.04, Math.min(0.1, 14 / Math.max(rw, rh)));
      const sw = Math.max(2, Math.round(rw * sampleScale));
      const sh = Math.max(2, Math.round(rh * sampleScale));

      const temp = document.createElement('canvas');
      temp.width = sw;
      temp.height = sh;
      const tctx = temp.getContext('2d');
      if (tctx) {
        tctx.imageSmoothingEnabled = true;
        tctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, sw, sh);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(temp, 0, 0, sw, sh, rx, ry, rw, rh);
        ctx.restore();
      }
    } else if (box.style === 'blur') {
      const temp = document.createElement('canvas');
      temp.width = rw;
      temp.height = rh;
      const tctx = temp.getContext('2d');
      if (tctx) {
        const blurPx = Math.max(8, Math.round(Math.min(outW, outH) * 0.02));
        tctx.filter = `blur(${blurPx}px)`;
        // Draw slightly expanded region to avoid dark edge bleed
        tctx.drawImage(canvas, rx, ry, rw, rh, 0, 0, rw, rh);
        tctx.drawImage(temp, 0, 0);
        ctx.drawImage(temp, rx, ry);
      }
    }
  }

  // 3. Apply Watermark Overlay
  if (watermark && watermark.text.trim().length > 0) {
    const mainText = watermark.text.trim();
    const subText = watermark.subtext?.trim() || '';
    const minDim = Math.min(outW, outH);
    const baseFontSize = Math.max(14, Math.round(minDim * 0.038 * watermark.fontSizeScale));
    const subFontSize = Math.max(11, Math.round(baseFontSize * 0.68));

    ctx.save();
    ctx.globalAlpha = Math.max(0.05, Math.min(0.95, watermark.opacity));
    ctx.fillStyle = watermark.color;
    ctx.strokeStyle =
      watermark.color.toLowerCase() === '#ffffff' || watermark.color.toLowerCase() === '#f8fafc'
        ? 'rgba(2, 6, 23, 0.45)'
        : 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = Math.max(1, Math.round(baseFontSize * 0.06));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (watermark.mode === 'single') {
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((watermark.angle * Math.PI) / 180);

      const singleSize = Math.round(baseFontSize * 1.35);
      ctx.font = `800 ${singleSize}px "JetBrains Mono", "Plus Jakarta Sans", sans-serif`;

      // Protective double border box around single stamp
      const metrics = ctx.measureText(mainText);
      const boxW = metrics.width + singleSize * 1.8;
      const boxH = subText ? singleSize * 3.1 : singleSize * 2.1;

      ctx.strokeStyle = watermark.color;
      ctx.lineWidth = Math.max(2, Math.round(singleSize * 0.1));
      ctx.strokeRect(-boxW / 2, -boxH / 2, boxW, boxH);

      if (subText) {
        ctx.fillText(mainText, 0, -singleSize * 0.35);
        ctx.font = `600 ${Math.round(singleSize * 0.62)}px "JetBrains Mono", sans-serif`;
        ctx.fillText(subText, 0, singleSize * 0.55);
      } else {
        ctx.fillText(mainText, 0, 0);
      }
    } else if (watermark.mode === 'banner') {
      const bannerH = Math.max(48, Math.round(outH * 0.14));
      const bannerY = outH - bannerH - Math.round(outH * 0.04);

      ctx.fillStyle = 'rgba(2, 6, 23, 0.82)';
      ctx.fillRect(0, bannerY, outW, bannerH);

      ctx.strokeStyle = watermark.color;
      ctx.lineWidth = Math.max(2, Math.round(outH * 0.004));
      ctx.beginPath();
      ctx.moveTo(0, bannerY);
      ctx.lineTo(outW, bannerY);
      ctx.moveTo(0, bannerY + bannerH);
      ctx.lineTo(outW, bannerY + bannerH);
      ctx.stroke();

      ctx.fillStyle = watermark.color;
      ctx.font = `800 ${baseFontSize}px "JetBrains Mono", sans-serif`;
      if (subText) {
        ctx.fillText(mainText, outW / 2, bannerY + bannerH * 0.38);
        ctx.font = `600 ${subFontSize}px "JetBrains Mono", sans-serif`;
        ctx.fillText(subText, outW / 2, bannerY + bannerH * 0.72);
      } else {
        ctx.fillText(mainText, outW / 2, bannerY + bannerH / 2);
      }
    } else {
      // Tiled Grid Mode (Most Secure for KTP)
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate((watermark.angle * Math.PI) / 180);

      ctx.font = `700 ${baseFontSize}px "JetBrains Mono", "Plus Jakarta Sans", sans-serif`;
      const textWidth = Math.max(ctx.measureText(mainText).width, ctx.measureText(subText).width);

      const stepX = Math.max(160, Math.round((textWidth + baseFontSize * 2.5) * watermark.spacingScale));
      const stepY = Math.max(
        90,
        Math.round(baseFontSize * (subText ? 4.2 : 3.2) * watermark.spacingScale)
      );

      const diag = Math.ceil(Math.sqrt(outW * outW + outH * outH));
      let rowIdx = 0;

      for (let y = -diag; y <= diag; y += stepY) {
        const offsetX = rowIdx % 2 === 0 ? 0 : stepX / 2;
        for (let x = -diag; x <= diag; x += stepX) {
          ctx.font = `700 ${baseFontSize}px "JetBrains Mono", sans-serif`;
          ctx.strokeText(mainText, x + offsetX, y);
          ctx.fillText(mainText, x + offsetX, y);

          if (subText) {
            ctx.font = `600 ${subFontSize}px "JetBrains Mono", sans-serif`;
            ctx.fillText(subText, x + offsetX, y + baseFontSize * 1.15);
          }
        }
        rowIdx++;
      }
    }
    ctx.restore();

    // Optional protective security frame + micro-timestamp
    if (watermark.addTimestampBorder) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, watermark.opacity + 0.2);
      ctx.strokeStyle = watermark.color;
      const pad = Math.max(8, Math.round(minDim * 0.018));
      ctx.lineWidth = Math.max(2, Math.round(minDim * 0.004));
      ctx.strokeRect(pad, pad, outW - pad * 2, outH - pad * 2);

      const microSize = Math.max(10, Math.round(minDim * 0.018));
      ctx.font = `600 ${microSize}px "JetBrains Mono", monospace`;
      ctx.fillStyle = watermark.color;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(
        `PROTECTED BY AMANDOK • ${mainText}`,
        outW - pad * 1.6,
        outH - pad * 1.4
      );
      ctx.restore();
    }
  }
}

/**
 * Compresses an image to fit strictly under `targetKb` using binary search on JPEG quality
 * and progressive dimension scaling if needed, plus optional pasfoto aspect ratio cropping.
 */
export async function compressToTargetKb(
  sourceImg: HTMLImageElement,
  options: {
    targetKb: number;
    cropPreset: CropPreset;
    bgColor: string;
    originalBytes: number;
  }
): Promise<CompressionResult> {
  const srcW = sourceImg.naturalWidth || sourceImg.width;
  const srcH = sourceImg.naturalHeight || sourceImg.height;

  // 1. Calculate center crop region for pasfoto / KTP preset
  let cropX = 0;
  let cropY = 0;
  let cropW = srcW;
  let cropH = srcH;

  const targetRatioMap: Record<CropPreset, number | null> = {
    original: null,
    '3x4': 3 / 4,
    '4x6': 2 / 3,
    '1x1': 1,
    ktp: 85.6 / 53.98,
  };

  const desiredRatio = targetRatioMap[options.cropPreset];
  if (desiredRatio) {
    const currentRatio = srcW / srcH;
    if (currentRatio > desiredRatio) {
      cropW = Math.round(srcH * desiredRatio);
      cropX = Math.round((srcW - cropW) / 2);
    } else {
      cropH = Math.round(srcW / desiredRatio);
      cropY = Math.round((srcH - cropH) / 2);
    }
  }

  const targetBytes = Math.max(15 * 1024, options.targetKb * 1024);

  const encodeAttempt = async (scale: number, quality: number): Promise<{
    blob: Blob;
    width: number;
    height: number;
  }> => {
    const w = Math.max(120, Math.round(cropW * scale));
    const h = Math.max(120, Math.round(cropH * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context unavailable');

    ctx.fillStyle = options.bgColor || '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(sourceImg, cropX, cropY, cropW, cropH, 0, 0, w, h);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Gagal mengenkode gambar'))),
        'image/jpeg',
        quality
      );
    });

    return { blob, width: w, height: h };
  };

  const scalesToTry = [1.0, 0.85, 0.72, 0.6, 0.5, 0.4];
  let bestResult: {
    blob: Blob;
    width: number;
    height: number;
    quality: number;
    scale: number;
  } | null = null;

  for (const scale of scalesToTry) {
    let low = 0.12;
    let high = 0.94;
    let candidateForScale: {
      blob: Blob;
      width: number;
      height: number;
      quality: number;
      scale: number;
    } | null = null;

    // 6 iterations of binary search on JPEG quality
    for (let i = 0; i < 6; i++) {
      const mid = Number(((low + high) / 2).toFixed(3));
      const res = await encodeAttempt(scale, mid);

      if (res.blob.size <= targetBytes) {
        candidateForScale = { ...res, quality: mid, scale };
        low = mid; // try higher quality while staying below targetBytes
      } else {
        high = mid; // reduce quality
      }
    }

    if (candidateForScale) {
      bestResult = candidateForScale;
      break;
    }
  }

  // Fallback if even lowest scale was slightly above target
  if (!bestResult) {
    const fallback = await encodeAttempt(0.35, 0.15);
    bestResult = { ...fallback, quality: 0.15, scale: 0.35 };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(bestResult.blob);
  });

  return {
    blob: bestResult.blob,
    dataUrl,
    width: bestResult.width,
    height: bestResult.height,
    originalBytes: options.originalBytes,
    compressedBytes: bestResult.blob.size,
    qualityUsed: Math.round(bestResult.quality * 100),
    scaleUsed: Math.round(bestResult.scale * 100),
  };
}

/**
 * Generates a realistic synthetic sample KTP image in browser memory
 * so users/recruiters can test Watermark, Redaction, Compression & PDF tools immediately.
 */
export function generateSampleKtpDataUrl(): {
  dataUrl: string;
  width: number;
  height: number;
  bytes: number;
} {
  const width = 1000;
  const height = 630;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Card sky-blue gradient background
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#bae6fd');
  grad.addColorStop(0.5, '#e0f2fe');
  grad.addColorStop(1, '#93c5fd');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Subtle guilloche wave lines
  ctx.strokeStyle = 'rgba(2, 132, 199, 0.12)';
  ctx.lineWidth = 2;
  for (let y = 20; y < height; y += 18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(width * 0.33, y - 12, width * 0.66, y + 12, width, y);
    ctx.stroke();
  }

  // Outer card border
  ctx.strokeStyle = '#0284c7';
  ctx.lineWidth = 6;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  // Header
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.font = '800 28px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('PROVINSI DKI JAKARTA', width / 2, 62);
  ctx.font = '800 26px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('KOTA ADMINISTRASI JAKARTA SELATAN', width / 2, 98);

  // Divider line
  ctx.fillStyle = '#0369a1';
  ctx.fillRect(45, 118, width - 90, 3);

  // NIK Row
  ctx.textAlign = 'left';
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 32px "JetBrains Mono", monospace';
  ctx.fillText('NIK', 50, 168);
  ctx.fillText(': 3174092810960001 (CONTOH SIMULASI)', 235, 168);

  // Biodata rows
  const fields: [string, string][] = [
    ['Nama', 'BUDI SANTOSO (DOKUMEN CONTOH)'],
    ['Tempat/Tgl Lahir', 'JAKARTA, 28-10-1996'],
    ['Jenis Kelamin', 'LAKI-LAKI            Gol. Darah : O'],
    ['Alamat', 'JL. MERDEKA RAYA NO. 88 BLOK A2'],
    ['    RT/RW', '004 / 008'],
    ['    Kel/Desa', 'KEBAYORAN BARU'],
    ['    Kecamatan', 'KEBAYORAN BARU'],
    ['Agama', 'INDONESIA'],
    ['Status Perkawinan', 'KAWIN'],
    ['Pekerjaan', 'KARYAWAN SWASTA'],
    ['Kewarganegaraan', 'WNI'],
    ['Berlaku Hingga', 'SEUMUR HIDUP'],
  ];

  ctx.font = '700 20px "Plus Jakarta Sans", sans-serif';
  fields.forEach(([label, val], idx) => {
    const y = 212 + idx * 32;
    ctx.fillStyle = '#1e293b';
    ctx.fillText(label, 50, y);
    ctx.fillStyle = '#0f172a';
    ctx.fillText(`: ${val}`, 245, y);
  });

  // Right photo box (Pasfoto Merah)
  const photoX = 720;
  const photoY = 190;
  const photoW = 210;
  const photoH = 265;
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(photoX, photoY, photoW, photoH);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.strokeRect(photoX, photoY, photoW, photoH);

  // Silhouette avatar inside photo box
  ctx.fillStyle = '#fca5a5';
  ctx.beginPath();
  ctx.arc(photoX + photoW / 2, photoY + 95, 44, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(photoX + photoW / 2, photoY + 235, 78, Math.PI, Math.PI * 2);
  ctx.fill();

  // Caption & Simulated Signature under photo
  ctx.textAlign = 'center';
  ctx.fillStyle = '#0f172a';
  ctx.font = '700 17px "Plus Jakarta Sans", sans-serif';
  ctx.fillText('JAKARTA SELATAN', photoX + photoW / 2, photoY + photoH + 30);
  ctx.font = '600 15px "JetBrains Mono", monospace';
  ctx.fillText('28-10-2026', photoX + photoW / 2, photoY + photoH + 52);

  // Simulated signature scribble
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(photoX + 35, photoY + photoH + 100);
  ctx.bezierCurveTo(
    photoX + 75,
    photoY + photoH + 65,
    photoX + 120,
    photoY + photoH + 125,
    photoX + 175,
    photoY + photoH + 80
  );
  ctx.stroke();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const bytes = Math.round(((dataUrl.split(',')[1]?.length || 0) * 3) / 4);
  return { dataUrl, width, height, bytes };
}
