// Text metrics shared by the on-screen field and the exported PDF, so typed text lands
// in the same place in both. Kept apart from engine.ts so screens can use it without loading PDF.js.
import { GOOGLE_FONTS, type GoogleFontId } from "./fonts";

/** Font size as a fraction of the field's height. */
export const TEXT_SIZE = 0.62;
/** Baseline position as a fraction of the field's height, from the top. */
export const TEXT_BASELINE = 0.72;
/** Left and right inset in points. */
export const TEXT_PAD_X = 2;

/** The three standard stand-ins, or a bundled Google font (src/pdf/fonts.ts) matched from the PDF. */
export type FontFace = "sans" | "serif" | "mono" | GoogleFontId;
export type TextAlign = "left" | "center" | "right";
/** Formatting for text and date fields. The size isn't here: it follows the field's height (TEXT_SIZE). */
export type TextStyle = {
  font: FontFace; bold: boolean; italic: boolean; underline: boolean;
  /** #rrggbb */
  color: string;
  highlight: string | null;
  align: TextAlign;
};

export const DEFAULT_TEXT_STYLE: TextStyle = { font: "sans", bold: false, italic: false, underline: false, color: "#1a1a1f", highlight: null, align: "left" };
/** Google Docs' default size, in points. */
export const DEFAULT_TEXT_PT = 11;

/**
 * The standard three are named as Google Docs names them, and each is metric-compatible with the PDF
 * standard font export draws with. The bundled Google fonts follow, shown and exported as themselves.
 */
export const FONT_FACES: { id: FontFace; label: string; css: string; google?: boolean }[] = [
  { id: "sans", label: "Arial", css: "Helvetica, Arial, sans-serif" },
  { id: "serif", label: "Times New Roman", css: "'Times New Roman', Times, serif" },
  { id: "mono", label: "Courier New", css: "'Courier New', Courier, monospace" },
  ...GOOGLE_FONTS.map((f) => ({
    id: f.id, label: f.label, google: true,
    css: `'${f.label}', ${f.kind === "serif" ? "'Times New Roman', serif" : f.kind === "mono" ? "'Courier New', monospace" : "Helvetica, Arial, sans-serif"}`,
  })),
];
export const fontCss = (face: FontFace = "sans") => (FONT_FACES.find((f) => f.id === face) ?? FONT_FACES[0]).css;
export const isGoogleFace = (face: FontFace | undefined): face is GoogleFontId => !!face && face !== "sans" && face !== "serif" && face !== "mono";

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of `text` in points at `size` pt, in the style's font. */
export function textWidth(text: string, size: number, style?: Partial<TextStyle>) {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  measureCtx.font = `${style?.italic ? "italic " : ""}${style?.bold ? 700 : 400} ${size}px ${fontCss(style?.font)}`;
  return measureCtx.measureText(text).width;
}

/** A line of text already on a page, found in its text layer or by OCR. Fractions of the displayed page. */
export type TextLine = {
  id: string;
  page: number;
  text: string;
  /** Box around the glyphs. */
  x: number; y: number; w: number; h: number;
  /** Baseline, from the top. */
  baseline: number;
  /** Font size in points. */
  size: number;
  style: Pick<TextStyle, "font" | "bold" | "italic">;
  source: "pdf" | "ocr";
};

/**
 * Characters the PDF standard fonts (WinAnsi) can't draw. Checked before export so the user can fix them.
 * Bundled Google fonts all cover Latin Extended (most European languages); some also cover Greek and
 * Cyrillic (Roboto, Open Sans, Noto). Text in one of them isn't checked here; export reports any
 * character that particular font is missing.
 */
export function unsupportedChars(text: string, face?: FontFace) {
  if (isGoogleFace(face)) return [];
  const bad = new Set<string>();
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    const ok = (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ".includes(ch);
    if (!ok) bad.add(ch);
  }
  return [...bad];
}
