import { PDFDocument } from 'pdf-lib';

export interface PdfQueueItem {
  id: string;
  name: string;
  type: 'image' | 'pdf';
  dataUrl?: string; // For images
  arrayBuffer?: ArrayBuffer; // For uploaded PDFs
  width?: number;
  height?: number;
  sizeBytes: number;
}

export type PdfPageLayout = 'a4-portrait' | 'a4-id-cards' | 'fit-image';

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Merges queued images and PDF files into a single PDF document 100% in browser memory.
 */
export async function buildCombinedPdf(
  items: PdfQueueItem[],
  layout: PdfPageLayout
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.setProducer('AmanDok — 100% Client-Side Document Privacy Toolkit');
  pdfDoc.setCreator('dokumen.ritonga.ai.id');

  if (layout === 'a4-id-cards') {
    // Place up to 2 ID cards (e.g. KTP + NPWP) per A4 portrait page
    let currentPage: ReturnType<typeof pdfDoc.addPage> | null = null;
    let slotOnPage = 0;

    for (const item of items) {
      if (item.type === 'pdf' && item.arrayBuffer) {
        const srcPdf = await PDFDocument.load(item.arrayBuffer);
        const copiedPages = await pdfDoc.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach((p) => pdfDoc.addPage(p));
        currentPage = null;
        slotOnPage = 0;
        continue;
      }

      if (!item.dataUrl) continue;
      const bytes = dataUrlToUint8Array(item.dataUrl);
      const isPng = item.dataUrl.startsWith('data:image/png');
      const embeddedImg = isPng
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      if (!currentPage || slotOnPage >= 2) {
        currentPage = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        slotOnPage = 0;
      }

      // Standard ID Card display width on A4 (~270pt wide, ~170pt tall)
      const maxCardW = 320;
      const maxCardH = 220;
      const scale = Math.min(maxCardW / embeddedImg.width, maxCardH / embeddedImg.height);
      const drawW = embeddedImg.width * scale;
      const drawH = embeddedImg.height * scale;

      const x = (A4_WIDTH - drawW) / 2;
      const y = slotOnPage === 0 ? A4_HEIGHT - drawH - 95 : A4_HEIGHT - drawH * 2 - 165;

      currentPage.drawImage(embeddedImg, {
        x,
        y,
        width: drawW,
        height: drawH,
      });

      slotOnPage++;
    }
  } else {
    for (const item of items) {
      if (item.type === 'pdf' && item.arrayBuffer) {
        const srcPdf = await PDFDocument.load(item.arrayBuffer);
        const copiedPages = await pdfDoc.copyPages(srcPdf, srcPdf.getPageIndices());
        copiedPages.forEach((p) => pdfDoc.addPage(p));
        continue;
      }

      if (!item.dataUrl) continue;
      const bytes = dataUrlToUint8Array(item.dataUrl);
      const isPng = item.dataUrl.startsWith('data:image/png');
      const embeddedImg = isPng
        ? await pdfDoc.embedPng(bytes)
        : await pdfDoc.embedJpg(bytes);

      if (layout === 'fit-image') {
        const page = pdfDoc.addPage([embeddedImg.width, embeddedImg.height]);
        page.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: embeddedImg.width,
          height: embeddedImg.height,
        });
      } else {
        // Default: A4 Portrait with clean 36pt margin
        const margin = 36;
        const page = pdfDoc.addPage([A4_WIDTH, A4_HEIGHT]);
        const availW = A4_WIDTH - margin * 2;
        const availH = A4_HEIGHT - margin * 2;
        const scale = Math.min(availW / embeddedImg.width, availH / embeddedImg.height, 1);

        const drawW = embeddedImg.width * scale;
        const drawH = embeddedImg.height * scale;
        const x = (A4_WIDTH - drawW) / 2;
        const y = (A4_HEIGHT - drawH) / 2;

        page.drawImage(embeddedImg, {
          x,
          y,
          width: drawW,
          height: drawH,
        });
      }
    }
  }

  return await pdfDoc.save();
}
