// PDF engine: PDF.js renders, @cantoo/pdf-lib writes. Everything runs in this browser.
//
// Coordinates: a field is stored as fractions (0–1) of its page as the user sees it,
// i.e. after the page's /Rotate is applied, origin top-left. At export each corner goes
// through PDF.js's viewport.convertToPdfPoint at scale 1, which applies the page's
// rotation and its MediaBox/CropBox offset, giving PDF user-space points (1/72 in).
import { AnnotationMode, getDocument, GlobalWorkerOptions, Util, type PDFDocumentProxy, type PageViewport } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import {
  PDFArray, PDFDict, PDFDocument, PDFName, PDFRef, PDFStream, StandardFonts, TextRenderingMode, beginText, degrees, endText,
  popGraphicsState, pushGraphicsState, rgb, rotateAndSkewTextDegreesAndTranslate, setCharacterSqueeze, setFontAndSize,
  setTextRenderingMode, showText, type Color, type PDFContext, type PDFFont, type PDFImage, type PDFObject, type PDFPage,
} from "@cantoo/pdf-lib";
import { NotAPdf, PasswordNeeded } from "./errors";
import { DEFAULT_TEXT_STYLE, TEXT_BASELINE, TEXT_PAD_X, TEXT_SIZE, unsupportedChars, type FontFace, type TextLine, type TextStyle } from "./text";

GlobalWorkerOptions.workerSrc = workerUrl;

export type FieldKind = "signature" | "initials" | "text" | "date" | "check" | "image";
export type FieldImage = { src: string; width: number; height: number };
export type Field = {
  id: string;
  kind: FieldKind;
  /** 1-based page number */
  page: number;
  /** Fractions of the displayed page, origin top-left. */
  x: number; y: number; w: number; h: number;
  /** text and date */
  text?: string;
  /** signature, initials, image */
  image?: FieldImage;
  /** checkbox */
  checked?: boolean;
  /** text and date: font, weight, colour, alignment. Size follows the box height. */
  style?: TextStyle;
  /**
   * Edited page text: the original words' area, painted in the page colour before the new
   * text is drawn. It stays put if the new text is moved. The original stays in the file underneath.
   */
  cover?: Box & { color: string };
  /** The TextLine this field replaces. */
  replaces?: string;
};

export type Box = { x: number; y: number; w: number; h: number };

/** Page size in points as displayed (rotation applied). */
export type PageInfo = { width: number; height: number; rotation: number };

export type OpenResult = {
  doc: PDFDocumentProxy;
  pages: PageInfo[];
  /** Has at least one certificate signature (a /ByteRange entry). */
  signed: boolean;
};

export { NotAPdf, PasswordNeeded };

/** Look for a signature dictionary. Signature values must be direct objects, so a byte scan finds them. */
function hasSignature(bytes: Uint8Array) {
  const needle = [47, 66, 121, 116, 101, 82, 97, 110, 103, 101]; // "/ByteRange"
  outer: for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

export async function openPdf(bytes: Uint8Array, password?: string): Promise<OpenResult> {
  // PDF.js transfers the buffer to its worker, so give it a copy and keep the original intact.
  // fontExtraProperties: font names and serif/monospace flags, so edited text can keep its font.
  const task = getDocument({ data: bytes.slice(), password, fontExtraProperties: true });
  let doc: PDFDocumentProxy;
  try {
    doc = await task.promise;
  } catch (e) {
    const err = e as { name?: string; code?: number };
    if (err.name === "PasswordException") throw new PasswordNeeded(err.code === 2);
    if (err.name === "InvalidPDFException" || err.name === "FormatError") throw new NotAPdf("Not a valid PDF");
    throw e;
  }
  const pages: PageInfo[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const vp = (await doc.getPage(n)).getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height, rotation: vp.rotation });
  }
  return { doc, pages, signed: hasSignature(bytes) };
}

/** Draws page `n` into `canvas` at `cssWidth` pixels wide, sharp on high-DPI screens. Returns a cancel function. */
/** Draws page `n` into `canvas`. Returns a cancel function. A failure (other than cancelling) goes to `onError`. */
export function renderPage(doc: PDFDocumentProxy, n: number, canvas: HTMLCanvasElement, cssWidth: number, onError?: (e: unknown) => void) {
  let cancelled = false;
  let cancelTask = () => {};
  void (async () => {
    const page = await doc.getPage(n);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const viewport = page.getViewport({ scale: (cssWidth / base.width) * dpr });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const task = page.render({ canvas, viewport });
    cancelTask = () => task.cancel();
    await task.promise.catch((e: { name?: string }) => { if (e?.name !== "RenderingCancelledException") throw e; });
  })().catch((e) => { if (!cancelled) (onError ?? ((err) => console.warn(`Page ${n} couldn't be drawn`, err)))(e); });
  return () => { cancelled = true; cancelTask(); };
}

/* ---------- text already on the page ---------- */

type Run = { str: string; x: number; base: number; size: number; w: number; font: string };
type FontInfo = { name?: string; bold?: boolean; black?: boolean; italic?: boolean; isSerifFont?: boolean; isMonospace?: boolean };

/** Family, weight and slant from the font PDF.js loaded for this text (subset prefixes like "ABCDEF+" ignored). */
function styleOf(info: FontInfo | undefined, family?: string): TextLine["style"] {
  const name = (info?.name ?? "").replace(/^[A-Z]{6}\+/, "");
  const font: FontFace = info?.isMonospace || /courier|mono|consol/i.test(name) || family === "monospace" ? "mono"
    : info?.isSerifFont || /times|serif|georgia|garamond|cambria|minion|book/i.test(name) || family === "serif" ? "serif" : "sans";
  return {
    font,
    bold: !!(info?.bold || info?.black) || /bold|black|heavy|semibold|demi/i.test(name),
    italic: !!info?.italic || /italic|oblique/i.test(name),
  };
}

/**
 * Lines of text in page `n`'s text layer, in display space (rotation applied). Rotated or vertical text
 * is left out. Returns [] for scanned pages, which need OCR instead.
 */
export async function findText(doc: PDFDocumentProxy, n: number): Promise<TextLine[]> {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  // Loads the fonts, so their names and flags are available below (cached once the page has been drawn).
  await page.getOperatorList();

  const runs: Run[] = [];
  for (const item of content.items) {
    if (!("str" in item) || !item.str.trim()) continue;
    const tx = Util.transform(vp.transform, item.transform);
    const size = Math.hypot(tx[2], tx[3]);
    // Upright text only: no rotation or skew once the page's own rotation is applied.
    if (size < 1 || tx[0] <= 0 || Math.abs(tx[1]) > tx[0] * 0.02 || Math.abs(tx[2]) > size * 0.02) continue;
    runs.push({ str: item.str, x: tx[4], base: tx[5], size, w: item.width, font: item.fontName });
  }
  runs.sort((a, b) => a.base - b.base || a.x - b.x);

  // Join runs on the same baseline that sit close together; a wide gap (a table column) starts a new line.
  const lines: { runs: Run[]; x: number; end: number; base: number; size: number; text: string }[] = [];
  for (const r of runs) {
    const line = lines.find((l) => Math.abs(l.base - r.base) < l.size * 0.3 && r.x >= l.end - l.size * 0.5 && r.x - l.end < l.size * 1.2
      && Math.max(l.size, r.size) / Math.min(l.size, r.size) < 1.4);
    if (!line) { lines.push({ runs: [r], x: r.x, end: r.x + r.w, base: r.base, size: r.size, text: r.str }); continue; }
    const gap = r.x - line.end;
    line.text += (gap > line.size * 0.12 && !line.text.endsWith(" ") && !r.str.startsWith(" ") ? " " : "") + r.str;
    line.runs.push(r);
    line.end = Math.max(line.end, r.x + r.w);
    line.size = Math.max(line.size, r.size);
  }

  return lines.map((l, i) => {
    // The longest run decides the font.
    const main = l.runs.reduce((a, b) => (b.str.length > a.str.length ? b : a));
    const info = page.commonObjs.has(main.font) ? (page.commonObjs.get(main.font) as FontInfo) : undefined;
    const top = l.base - l.size * 0.86, bottom = l.base + l.size * 0.22;
    return {
      id: `${n}:pdf:${i}`, page: n, text: l.text.trim(), source: "pdf" as const, size: l.size,
      x: l.x / vp.width, y: top / vp.height, w: (l.end - l.x) / vp.width, h: (bottom - top) / vp.height,
      baseline: l.base / vp.height,
      style: styleOf(info, content.styles[main.font]?.fontFamily),
    };
  }).filter((l) => l.text);
}

/** Draws page `n` onto a new canvas at `scale` (1 = 72 dpi). `annotations: false` leaves out comments and form fields. */
export async function pageImage(doc: PDFDocumentProxy, n: number, scale: number, annotations = true) {
  const page = await doc.getPage(n);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  await page.render({ canvas, viewport, annotationMode: annotations ? AnnotationMode.ENABLE_FORMS : AnnotationMode.DISABLE }).promise;
  return canvas;
}

/* ---------- export ---------- */

type Pt = [number, number];
const toPdf = (vp: PageViewport, f: Box, fx: number, fy: number): Pt => {
  const [x, y] = vp.convertToPdfPoint((f.x + fx * f.w) * vp.width, (f.y + fy * f.h) * vp.height);
  return [x, y];
};

async function embedImage(pdf: PDFDocument, src: string): Promise<PDFImage> {
  const bytes = new Uint8Array(await (await fetch(src)).arrayBuffer());
  return src.startsWith("data:image/png") ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

/** Draws an upright box in display space: anchor is its bottom-left, rotated with the page. */
function drawImageIn(page: PDFPage, vp: PageViewport, f: Field, img: PDFImage, image: FieldImage, bottomAlign: boolean) {
  const boxW = f.w * vp.width, boxH = f.h * vp.height;
  const s = Math.min(boxW / image.width, boxH / image.height);
  const w = image.width * s, h = image.height * s;
  // Inset within the box, as fractions of the box: centred horizontally, bottom-aligned for signatures.
  const left = (boxW - w) / 2 / boxW;
  const bottom = bottomAlign ? 1 : 1 - (boxH - h) / 2 / boxH;
  const [x, y] = toPdf(vp, f, left, bottom);
  page.drawImage(img, { x, y, width: w, height: h, rotate: degrees(vp.rotation) });
}

const hex = (c: string): Color => {
  const n = parseInt(c.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

/** A filled upright box in display space, rotated with the page. */
function drawBox(page: PDFPage, vp: PageViewport, b: Box, color: Color) {
  const [x, y] = toPdf(vp, b, 0, 1);
  page.drawRectangle({ x, y, width: b.w * vp.width, height: b.h * vp.height, color, rotate: degrees(vp.rotation) });
}

/** Regular, bold, italic, bold italic. */
const FONT_NAMES: Record<FontFace, [StandardFonts, StandardFonts, StandardFonts, StandardFonts]> = {
  sans: [StandardFonts.Helvetica, StandardFonts.HelveticaBold, StandardFonts.HelveticaOblique, StandardFonts.HelveticaBoldOblique],
  serif: [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold, StandardFonts.TimesRomanItalic, StandardFonts.TimesRomanBoldItalic],
  mono: [StandardFonts.Courier, StandardFonts.CourierBold, StandardFonts.CourierOblique, StandardFonts.CourierBoldOblique],
};

function drawTextIn(page: PDFPage, vp: PageViewport, f: Field, text: string, font: PDFFont, style: TextStyle) {
  const boxW = f.w * vp.width, boxH = f.h * vp.height;
  const size = boxH * TEXT_SIZE;
  const width = font.widthOfTextAtSize(text, size);
  const left = style.align === "center" ? (boxW - width) / 2 : style.align === "right" ? boxW - TEXT_PAD_X - width : TEXT_PAD_X;
  const rotate = degrees(vp.rotation);
  if (style.highlight) drawBox(page, vp, { x: f.x + (left / boxW) * f.w, y: f.y, w: (width / boxW) * f.w, h: f.h }, hex(style.highlight));
  const color = hex(style.color);
  const [x, y] = toPdf(vp, f, left / boxW, TEXT_BASELINE);
  page.drawText(text, { x, y, size, font, color, rotate });
  if (style.underline) {
    const uy = TEXT_BASELINE + (size * 0.12) / boxH;
    const a = toPdf(vp, f, left / boxW, uy), b = toPdf(vp, f, (left + width) / boxW, uy);
    page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness: Math.max(0.5, size * 0.06), color });
  }
}

function drawCheck(page: PDFPage, vp: PageViewport, f: Field) {
  const thickness = Math.max(1, f.h * vp.height * 0.12);
  const color = rgb(0.1, 0.1, 0.12);
  const a = toPdf(vp, f, 0.18, 0.52), b = toPdf(vp, f, 0.42, 0.78), c = toPdf(vp, f, 0.84, 0.22);
  page.drawLine({ start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, thickness, color });
  page.drawLine({ start: { x: b[0], y: b[1] }, end: { x: c[0], y: c[1] }, thickness, color });
}


/* ---------- removing edited-over text ---------- */

/** 200 dpi: crisp body text when printed, without huge files. Very large pages get fewer dots. */
const FLATTEN_DPI = 200;
const FLATTEN_MAX_PIXELS = 16_000_000;

const overlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

async function canvasBytes(canvas: HTMLCanvasElement, type: string, quality?: number) {
  const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, quality));
  if (!blob) throw new Error("Couldn't encode the page image");
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Rebuilds a page so the text under edits is gone from the file: its drawing is replaced by an image
 * of the page with the covers painted in, plus invisible text for the lines that weren't edited, so
 * the page can still be searched and copied. Comments, links and form fields on the page are kept.
 */
async function flattenPage(pdf: PDFDocument, page: PDFPage, doc: PDFDocumentProxy, n: number, covers: (Box & { color: string })[], replaced: Set<string>, helvetica: () => Promise<PDFFont>) {
  const base = (await doc.getPage(n)).getViewport({ scale: 1 });
  const scale = Math.min(FLATTEN_DPI / 72, Math.sqrt(FLATTEN_MAX_PIXELS / (base.width * base.height)));
  // Annotations stay on the page as they are, so they're left out of the image rather than drawn twice.
  const canvas = await pageImage(doc, n, scale, false);
  const ctx = canvas.getContext("2d")!;
  for (const c of covers) {
    ctx.fillStyle = c.color;
    ctx.fillRect(Math.floor(c.x * canvas.width), Math.floor(c.y * canvas.height), Math.ceil(c.w * canvas.width) + 1, Math.ceil(c.h * canvas.height) + 1);
  }
  // Whichever is smaller: PNG for clean text pages, JPEG for scans and photos.
  const [png, jpg] = await Promise.all([canvasBytes(canvas, "image/png"), canvasBytes(canvas, "image/jpeg", 0.9)]);
  const lines = (await findText(doc, n)).filter((l) => !replaced.has(l.id) && !covers.some((c) => overlap(l, c) > l.w * l.h * 0.3));
  canvas.width = canvas.height = 0;

  // A fresh, empty drawing and resources: nothing on this page refers to the old content any more.
  page.node.set(PDFName.of("Contents"), pdf.context.obj([]));
  page.node.set(PDFName.of("Resources"), pdf.context.obj({}));
  page.node.delete(PDFName.of("Thumb")); // a stored preview would still show the old text

  const img = png.length <= jpg.length ? await pdf.embedPng(png) : await pdf.embedJpg(jpg);
  drawImageIn(page, base, { id: "", kind: "image", page: n, x: 0, y: 0, w: 1, h: 1 }, img, { src: "", width: img.width, height: img.height }, false);

  // Invisible text where the untouched lines are, stretched to the same width, for search and copy.
  if (!lines.length) return;
  const font = await helvetica();
  const key = page.node.newFontDictionary(font.name, font.ref);
  const ops = [pushGraphicsState(), beginText(), setTextRenderingMode(TextRenderingMode.Invisible)];
  for (const l of lines) {
    const bad = new Set(unsupportedChars(l.text));
    const text = [...l.text].map((ch) => (bad.has(ch) ? "?" : ch)).join("");
    const natural = font.widthOfTextAtSize(text, l.size);
    if (!natural) continue;
    const [x, y] = toPdf(base, { x: l.x, y: l.baseline, w: 0, h: 0 }, 0, 0);
    ops.push(
      setFontAndSize(key, l.size),
      setCharacterSqueeze((100 * l.w * base.width) / natural),
      // Same rotation as visible text (drawText's rotate), so it runs along the line on turned pages.
      rotateAndSkewTextDegreesAndTranslate(base.rotation, 0, 0, x, y),
      showText(font.encodeText(text)),
    );
  }
  ops.push(endText(), popGraphicsState());
  page.pushOperators(...ops);
}

/** Deletes every object nothing in the document points to any more, so it isn't written to the file. */
function dropUnreachable(ctx: PDFContext) {
  const seen = new Set<string>();
  const stack: (PDFObject | undefined)[] = [ctx.trailerInfo.Root, ctx.trailerInfo.Info];
  while (stack.length) {
    const o = stack.pop();
    if (o instanceof PDFRef) {
      if (seen.has(o.tag)) continue;
      seen.add(o.tag);
      stack.push(ctx.lookup(o));
    } else if (o instanceof PDFDict) {
      for (const [, v] of o.entries()) stack.push(v);
    } else if (o instanceof PDFArray) {
      stack.push(...o.asArray());
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }
  let dropped = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) if (!seen.has(ref.tag)) { ctx.delete(ref); dropped++; }
  return dropped;
}

export type ExportOptions = {
  /**
   * Remove the original text under edits from the file, not just cover it: pages with edits are
   * rebuilt as an image plus invisible searchable text, and the file is rewritten without them.
   * A file that already has a digital signature then loses it.
   */
  removeEdited?: boolean;
};

export type ExportResult = {
  bytes: Uint8Array; incremental: boolean; skipped: number;
  /** Pages rebuilt to remove edited-over text. */
  flattened: number[];
};

/**
 * Writes filled fields onto a copy of the original file. Empty fields are left out.
 * Already-signed files are saved as an incremental update so the earlier signed
 * revision stays intact (unless edited text is being removed); viewers will report
 * the document changed after signing.
 */
export async function exportPdf(original: Uint8Array, doc: PDFDocumentProxy, fields: Field[], password?: string, options: ExportOptions = {}): Promise<ExportResult> {
  const signed = hasSignature(original);
  const covered = [...new Set(fields.filter((f) => f.cover).map((f) => f.page))].sort((a, b) => a - b);
  const flatten = options.removeEdited ? covered : [];
  // Removing text means rewriting the file: an incremental update would keep the old revision inside it.
  const incremental = signed && !flatten.length;
  const pdf = await PDFDocument.load(original.slice(), { password, forIncrementalUpdate: incremental, updateMetadata: false });
  const pages = pdf.getPages();
  const fonts = new Map<StandardFonts, PDFFont>();
  const fontFor = async (st: TextStyle) => {
    const name = FONT_NAMES[st.font][(st.bold ? 1 : 0) + (st.italic ? 2 : 0)];
    let font = fonts.get(name);
    if (!font) { font = await pdf.embedFont(name); fonts.set(name, font); }
    return font;
  };
  const images = new Map<string, PDFImage>();
  let skipped = 0;

  const replaced = new Set(fields.map((f) => f.replaces).filter((r): r is string => !!r));
  for (const n of flatten) {
    await flattenPage(pdf, pages[n - 1], doc, n, fields.filter((f) => f.page === n && f.cover).map((f) => f.cover!), replaced, () => fontFor(DEFAULT_TEXT_STYLE));
  }

  // Covers first, so moved replacement text is never painted over by another edit's cover.
  // Rebuilt pages already have them painted into the image.
  for (const f of fields) {
    if (f.cover && !flatten.includes(f.page)) drawBox(pages[f.page - 1], (await doc.getPage(f.page)).getViewport({ scale: 1 }), f.cover, hex(f.cover.color));
  }

  for (const f of fields) {
    const filled = f.kind === "check" ? f.checked : f.kind === "text" || f.kind === "date" ? !!f.text?.trim() : !!f.image;
    // An emptied edit of page text still covers the original: that's how page text is deleted.
    if (!filled) { if (!f.cover) skipped++; continue; }
    const vp = (await doc.getPage(f.page)).getViewport({ scale: 1 });
    const page = pages[f.page - 1];
    if (f.image) {
      let img = images.get(f.image.src);
      if (!img) { img = await embedImage(pdf, f.image.src); images.set(f.image.src, img); }
      drawImageIn(page, vp, f, img, f.image, f.kind !== "image");
    } else if (f.kind === "check") {
      drawCheck(page, vp, f);
    } else {
      const style = f.style ?? DEFAULT_TEXT_STYLE;
      drawTextIn(page, vp, f, f.text!.trim(), await fontFor(style), style);
    }
  }

  if (flatten.length) dropUnreachable(pdf.context);
  // commit() returns the complete file: the original bytes untouched, then the update.
  const bytes = incremental ? await pdf.commit() : await pdf.save();
  return { bytes, incremental: incremental && startsWith(bytes, original), skipped, flattened: flatten };
}

const startsWith = (a: Uint8Array, prefix: Uint8Array) =>
  a.length >= prefix.length && prefix.every((b, i) => a[i] === b);

export { countFormFields, organizePdf, type OrganizedPage } from "./organize";
export { mergePdfs, type MergeSource } from "./merge";
