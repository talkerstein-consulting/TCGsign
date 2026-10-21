// OCR for scanned pages, with Tesseract running in a worker in this browser. Its worker, engine
// and English model are served from this app (/ocr/, see vite.config.ts), never a CDN, and the
// model isn't cached in browser storage. Loaded only when Edit meets a page with no text layer.
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Worker } from "tesseract.js";
import { pageImage } from "./engine";
import type { TextLine } from "./text";

/** Render scale for OCR: 3 × 72 = 216 dpi, enough for body text without a huge image. */
const SCALE = 3;

let worker: Promise<Worker> | null = null;
let onProgress: ((p: number) => void) | null = null;

function getWorker() {
  worker ??= (async () => {
    const { createWorker, OEM } = await import("tesseract.js");
    const base = new URL(`${import.meta.env.BASE_URL}ocr/`, location.href).href;
    return createWorker("eng", OEM.LSTM_ONLY, {
      workerPath: `${base}worker.min.js`, corePath: base, langPath: base.replace(/\/$/, ""),
      workerBlobURL: false, cacheMethod: "none",
      logger: (m) => { if (m.status === "recognizing text") onProgress?.(m.progress); },
    });
  })().catch((e) => { worker = null; throw e; });
  return worker;
}

/** Reads page `n` and returns its lines of text. `progress` gets 0–1 while it recognises. */
export async function ocrPage(doc: PDFDocumentProxy, n: number, progress?: (p: number) => void): Promise<TextLine[]> {
  const [w, canvas] = await Promise.all([getWorker(), pageImage(doc, n, SCALE)]);
  onProgress = progress ?? null;
  try {
    const { data } = await w.recognize(canvas, {}, { blocks: true, text: false });
    const W = canvas.width, H = canvas.height;
    const lines: TextLine[] = [];
    for (const block of data.blocks ?? []) for (const para of block.paragraphs) for (const line of para.lines) {
      const text = line.text.trim();
      if (!text || line.confidence < 45) continue;
      const { x0, y0, x1, y1 } = line.bbox;
      const base = line.baseline.y0 + ((line.baseline.y1 - line.baseline.y0) * 0.5);
      // Tallest glyphs reach about 0.72 of the font size above the baseline.
      const size = Math.max(4, (base - y0) / SCALE / 0.72);
      // Tesseract doesn't report fonts reliably, so OCR text starts as plain sans.
      lines.push({
        id: `${n}:ocr:${lines.length}`, page: n, text, source: "ocr", size,
        x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H, baseline: base / H,
        style: { font: "sans", bold: false, italic: false },
      });
    }
    return lines;
  } finally {
    onProgress = null;
  }
}
