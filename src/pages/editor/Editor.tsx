import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  ArrowRight, CircleCheckBig, Combine, Copy, Download, FileClock, FolderOpen, ImageIcon, LayoutGrid, LifeBuoy, ListChecks, LogOut, Maximize2,
  PenLine, Plus, Redo2, RotateCcw, Save, ScanText, ShieldCheck, Signature, SquarePen, Trash2, Type, Undo2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import { Alert, Button, ButtonLink, IconButton, MenuBar, Modal, PageHeader, ProgressBar, Toast, type BarMenu } from "../../components/ui";
import {
  BottomSheet, CoverBox, DropZone, EditorToolbar, FIELD_LABEL, FIELD_SIZE, FieldBox, FormatBar, SheetTools, SignatureCreator, TOOLS,
  isFilled, stepSize, type EditorMode, type Handle, type ToolId,
} from "../../components/pdf";
import type { Box, Field, FieldImage, FieldKind, PageInfo } from "../../pdf/engine";
import {
  DEFAULT_TEXT_PT, DEFAULT_TEXT_STYLE, TEXT_BASELINE, TEXT_PAD_X, TEXT_SIZE, isGoogleFace, textWidth, type TextLine, type TextStyle,
} from "../../pdf/text";
import { imageFromFile } from "../../pdf/signature";
import { loadWebFont, type GoogleFontId } from "../../pdf/fonts";
import { useDocument } from "../../state/document";
import { DRAFT_DAYS } from "../../state/drafts";
import { useOpenFile } from "../useOpenFile";
import { PageView } from "./PageView";
import { usePageText } from "./usePageText";
import s from "./editor.module.css";

const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const today = () => new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

/** Widens a text field so the PDF never draws text past its edge, growing away from its alignment. Never shrinks it. */
function grownToFit(f: Field, text: string, info: PageInfo, style = f.style): Partial<Field> {
  const hPts = f.h * info.height;
  // A little slack past the text, so the caret fits while typing without the input scrolling.
  const need = (textWidth(text, hPts * TEXT_SIZE, style) + TEXT_PAD_X * 2 + hPts * 0.1) / info.width;
  if (need <= f.w) return {};
  const w = Math.min(need, 1), grow = w - f.w;
  const x = style?.align === "right" ? f.x - grow : style?.align === "center" ? f.x - grow / 2 : f.x;
  return { w, x: clamp(x, 0, 1 - w) };
}

/** Font size in points: it follows the box height. */
const sizeOf = (f: Field, info: PageInfo) => f.h * info.height * TEXT_SIZE;

const hexOf = (r: number, g: number, b: number) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/**
 * The page colour around a line of text and the colour of its ink, read from the drawn page:
 * the background is the commonest colour on the box's edge, the ink the pixels least like it.
 */
function sampleColors(canvas: HTMLCanvasElement | null, b: Box) {
  const fallback = { bg: "#ffffff", fg: DEFAULT_TEXT_STYLE.color };
  if (!canvas || !canvas.width || canvas.dataset.drawn === "false") return fallback;
  const x = Math.max(0, Math.floor(b.x * canvas.width) - 2), y = Math.max(0, Math.floor(b.y * canvas.height) - 2);
  const w = Math.min(canvas.width - x, Math.ceil(b.w * canvas.width) + 4), h = Math.min(canvas.height - y, Math.ceil(b.h * canvas.height) + 4);
  if (w < 3 || h < 3) return fallback;
  const data = canvas.getContext("2d")!.getImageData(x, y, w, h).data;
  const px = (i: number, j: number) => { const k = (j * w + i) * 4; return [data[k], data[k + 1], data[k + 2]] as const; };
  // Edge pixels grouped into coarse colour buckets; the background is the average of the biggest bucket.
  const buckets = new Map<string, number[][]>();
  const add = (c: readonly number[]) => { const k = c.map((v) => v >> 3).join(); buckets.set(k, [...(buckets.get(k) ?? []), [...c]]); };
  for (let i = 0; i < w; i++) { add(px(i, 0)); add(px(i, h - 1)); }
  for (let j = 1; j < h - 1; j++) { add(px(0, j)); add(px(w - 1, j)); }
  const edge = [...buckets.values()].sort((p, q) => q.length - p.length)[0];
  const bg = [0, 1, 2].map((k) => edge.reduce((sum, c) => sum + c[k], 0) / edge.length);
  const ink: { d: number; c: readonly number[] }[] = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = px(i, j), d = Math.hypot(c[0] - bg[0], c[1] - bg[1], c[2] - bg[2]);
    if (d > 60) ink.push({ d, c });
  }
  if (!ink.length) return { ...fallback, bg: hexOf(bg[0], bg[1], bg[2]) };
  // The most distinct eighth: anti-aliased (and on scans, blurred) edges blend into the background.
  const core = ink.sort((p, q) => q.d - p.d).slice(0, Math.max(1, Math.ceil(ink.length / 8)));
  const avg = [0, 1, 2].map((k) => core.reduce((sum, p) => sum + p.c[k], 0) / core.length);
  return { bg: hexOf(bg[0], bg[1], bg[2]), fg: hexOf(avg[0], avg[1], avg[2]) };
}

/** Page margins Docs uses, in points: snapping lines up with them. */
const MARGIN_PT = 72;
/** How close, in screen pixels, an edge must come to snap. */
const SNAP_PX = 6;

/**
 * Snaps a moving box's edges and centre to the page centre and margins, other fields and the left edges
 * of page text, like Docs' and Slides' alignment guides. Returns the snapped position and the guides to draw.
 */
function snapBox(b: Box, pageW: number, pageH: number, info: PageInfo, others: Box[], textLefts: number[]) {
  const xs = [0.5, MARGIN_PT / info.width, 1 - MARGIN_PT / info.width, ...textLefts];
  const ys = [0.5, MARGIN_PT / info.height, 1 - MARGIN_PT / info.height];
  for (const o of others) { xs.push(o.x, o.x + o.w / 2, o.x + o.w); ys.push(o.y, o.y + o.h / 2, o.y + o.h); }
  const best = (pos: number, size: number, lines: number[], px: number) => {
    let hit: { delta: number } | null = null;
    for (const off of [0, size / 2, size]) for (const l of lines) {
      const delta = l - (pos + off);
      if (Math.abs(delta) * px <= SNAP_PX && (!hit || Math.abs(delta) < Math.abs(hit.delta))) hit = { delta };
    }
    return hit?.delta ?? 0;
  };
  const x = b.x + best(b.x, b.w, xs, pageW), y = b.y + best(b.y, b.h, ys, pageH);
  const on = (pos: number, size: number, lines: number[], px: number) =>
    [...new Set(lines.filter((l) => [0, size / 2, size].some((off) => Math.abs(l - (pos + off)) * px < 0.5)))];
  return { x, y, gx: on(x, b.w, xs, pageW), gy: on(y, b.h, ys, pageH) };
}

type SignKind = "signature" | "initials";
/** Which fields the signature dialog will fill once the person signs. */
type SignTarget = { kind: SignKind; ids: string[] };

type Drag = {
  id: string; mode: "move" | Handle; startX: number; startY: number; orig: Field;
  pageW: number; pageH: number; moved: boolean; wasSelected: boolean;
  /** Other fields on the page, to snap to. */
  others: Box[];
};

type Guides = { page: number; xs: number[]; ys: number[] };

function useIsPhone() {
  const q = "(max-width: 767px)";
  const [phone, setPhone] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setPhone(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return phone;
}

export default function Editor() {
  const { doc, fields, setFields, checkpoint, undo, redo, canUndo, canRedo, signature, initials, setSignature, setInitials, close, draft, unsaved, saveDraft } = useDocument();
  // Sign (/editor) and Edit (/edit) are two tabs on the same open document; only the tools differ.
  const mode: EditorMode = useLocation().pathname === "/edit" ? "edit" : "sign";
  const { openFile, busy: opening, ui: openUi } = useOpenFile(mode === "edit" ? "/edit" : "/editor");
  const navigate = useNavigate();
  const phone = useIsPhone();

  const [tool, setTool] = useState<ToolId>("select");
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [signTarget, setSignTarget] = useState<SignTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [saving, setSaving] = useState(false);
  // Formatting for the next text you add when no text is selected, as in Docs.
  const [nextStyle, setNextStyle] = useState<TextStyle>(DEFAULT_TEXT_STYLE);
  const [nextSize, setNextSize] = useState(DEFAULT_TEXT_PT);
  /** Paint format: formatting copied from one text, waiting to be applied to the next one clicked. */
  const [painter, setPainter] = useState<{ style: TextStyle; size: number } | null>(null);
  const [guides, setGuides] = useState<Guides | null>(null);
  const pageText = usePageText(mode === "edit" ? doc?.pdf : undefined);

  // Bundled Google fonts matched from the PDF (or picked in the toolbar) load on demand; once one is
  // ready, re-render so text shows and measures in the real font.
  const [, setFontsReady] = useState(0);
  const fontKeys = [
    ...fields.map((f) => f.style),
    ...[...pageText.pages.values()].flatMap((p) => p.lines ?? []).map((l) => l.style),
    nextStyle,
  ].filter((st): st is NonNullable<typeof st> => !!st && isGoogleFace(st.font))
    .map((st) => `${st.font}|${st.bold}|${st.italic}`);
  const fontKey = [...new Set(fontKeys)].sort().join(",");
  useEffect(() => {
    if (!fontKey) return;
    let live = true;
    Promise.allSettled(fontKey.split(",").map((k) => {
      const [id, bold, italic] = k.split("|");
      return loadWebFont(id as GoogleFontId, bold === "true", italic === "true");
    })).then(() => { if (live) setFontsReady((n) => n + 1); });
    return () => { live = false; };
  }, [fontKey]);
  const desk = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [deskWidth, setDeskWidth] = useState(0);
  const drag = useRef<Drag | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<{ page: number; fx: number; fy: number; replace?: string } | null>(null);

  // Fit the widest page to the available width, then apply zoom.
  useLayoutEffect(() => {
    const el = desk.current;
    if (!el) return;
    setDeskWidth(el.getBoundingClientRect().width); // first size now; the observer only reports on a rendered frame
    const ro = new ResizeObserver(([e]) => setDeskWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);
  // Publish the pinned bar's height so the "Tap the page" banner sits just below it.
  useLayoutEffect(() => {
    const el = dock.current;
    if (!el) return;
    const sync = () => el.parentElement?.style.setProperty("--dock-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc, phone]);
  const maxPageW = doc ? Math.max(...doc.pages.map((p) => p.width)) : 612;
  const fit = Math.max(200, Math.min(deskWidth - (phone ? 16 : 48), 880)) / maxPageW;
  const pxPerPt = fit * zoom;

  const update = useCallback((id: string, patch: Partial<Field>, record = true) => {
    setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)), record);
  }, [setFields]);

  const remove = useCallback((id: string) => {
    setFields((fs) => fs.filter((f) => f.id !== id));
    setSelected(null); setEditing(null);
  }, [setFields]);

  /**
   * The field keeps the size it was given, so a signature never spills onto a neighbouring box;
   * the image is scaled to fit inside it (screen and export both draw it contained, never squashed).
   */
  const fitImage = useCallback((_field: Field, image: FieldImage): Partial<Field> => ({ image }), []);

  /** Fills several signature or initials fields at once, as one undo step. */
  const applyImage = useCallback((ids: string[], image: FieldImage) => {
    setFields((fs) => fs.map((f) => (ids.includes(f.id) ? { ...f, ...fitImage(f, image) } : f)));
  }, [setFields, fitImage]);

  const emptyOf = (kind: SignKind) => fields.filter((f) => f.kind === kind && !f.image);

  /** Sign all: every empty signature field, then every empty initials field, using what this session already has. */
  const signAll = () => {
    for (const kind of ["signature", "initials"] as const) {
      const ids = emptyOf(kind).map((f) => f.id);
      if (!ids.length) continue;
      const saved = kind === "signature" ? signature : initials;
      // Nothing made yet: the dialog fills these; press Sign all again for the other kind.
      if (!saved) { setSignTarget({ kind, ids }); return; }
      applyImage(ids, saved);
    }
    setToast("All signature and initials fields are signed.");
  };

  /** Tap on a selected field, or Enter: the field's main action. */
  const activate = useCallback((f: Field) => {
    if (f.kind === "check") update(f.id, { checked: !f.checked });
    else if (f.kind === "text" || f.kind === "date") setEditing(f.id);
    else if (f.kind === "image") { pendingImage.current = { page: f.page, fx: 0, fy: 0, replace: f.id }; imageInput.current?.click(); }
    else {
      const saved = f.kind === "signature" ? signature : initials;
      // Already signed once in this tab: drop it straight in. Tapping a signed field lets you redo it.
      if (saved && !f.image) applyImage([f.id], saved);
      else setSignTarget({ kind: f.kind as SignKind, ids: [f.id] });
    }
  }, [update, signature, initials, applyImage]);

  /** `keep`: stay on this tool for the next tap (Shift on desktop). */
  const place = useCallback((kind: FieldKind, page: number, fx: number, fy: number, image?: FieldImage, keep = false) => {
    const info = doc!.pages[page - 1];
    let [wPts, hPts] = FIELD_SIZE[kind];
    if (image && kind === "image") hPts = (wPts * image.height) / image.width;
    const isText = kind === "text" || kind === "date";
    if (isText) hPts = nextSize / TEXT_SIZE;
    const w = wPts / info.width, h = hPts / info.height;
    let field: Field = {
      id: uid(), kind, page, w, h,
      x: clamp(fx - w / 2, 0, 1 - w), y: clamp(fy - h / 2, 0, 1 - h),
      ...(kind === "date" ? { text: today() } : {}),
      ...(isText ? { style: nextStyle } : {}),
      ...(kind === "check" ? { checked: true } : {}),
      ...(image ? { image } : {}),
    };
    // Reuse this session's signature or initials straight away, in the same undo step as placing.
    const saved = kind === "signature" ? signature : kind === "initials" ? initials : null;
    if (saved) field = { ...field, ...fitImage(field, saved) };
    if (kind === "date") field = { ...field, ...grownToFit(field, field.text!, info) };
    setFields((fs) => [...fs, field]);
    setSelected(field.id);
    if (!keep) setTool("select");
    if (!saved && (kind === "signature" || kind === "initials")) setSignTarget({ kind, ids: [field.id] });
    else if (kind === "text" && !keep) setEditing(field.id);
  }, [doc, setFields, signature, initials, fitImage, nextSize, nextStyle]);

  /**
   * Click on text already on the page: it becomes an edited-text field in the same place, font, size
   * and colour, over a patch of the page colour that hides the original.
   */
  const editLine = useCallback((line: TextLine, canvas: HTMLCanvasElement | null) => {
    const info = doc!.pages[line.page - 1];
    const { bg, fg } = sampleColors(canvas, line);
    const size = painter?.size ?? line.size;
    const h = size / TEXT_SIZE / info.height, pad = TEXT_PAD_X / info.width;
    const style: TextStyle = painter?.style ?? { ...DEFAULT_TEXT_STYLE, ...line.style, color: fg };
    // Same baseline and left edge as the original.
    let field: Field = {
      id: uid(), kind: "text", page: line.page, text: line.text, style, replaces: line.id,
      x: line.x - pad, y: line.baseline - TEXT_BASELINE * h, w: line.w + 2 * pad, h,
      cover: { x: line.x - 1 / info.width, y: line.y - 1 / info.height, w: line.w + 2 / info.width, h: line.h + 2 / info.height, color: bg },
    };
    field = { ...field, ...grownToFit(field, line.text, info) };
    setFields((fs) => [...fs, field]);
    setPainter(null);
    setSelected(field.id);
    setEditing(field.id);
  }, [doc, painter, setFields]);

  /* ---------- formatting (Edit) ---------- */

  const selectedField = fields.find((f) => f.id === selected) ?? null;
  const fmtField = selectedField && (selectedField.kind === "text" || selectedField.kind === "date") ? selectedField : null;
  const fmtStyle = fmtField ? fmtField.style ?? DEFAULT_TEXT_STYLE : nextStyle;
  const fmtSize = fmtField && doc ? sizeOf(fmtField, doc.pages[fmtField.page - 1]) : nextSize;

  /** Restyles text in place: the size keeps the baseline where it is, and the box grows if the text got wider. */
  const restyle = useCallback((f: Field, style: TextStyle, size: number) => {
    const info = doc!.pages[f.page - 1];
    const h = size / TEXT_SIZE / info.height;
    const next: Field = { ...f, style, h: Math.min(h, 1), y: clamp(f.y + TEXT_BASELINE * (f.h - h), 0, Math.max(0, 1 - h)) };
    update(f.id, { style, h: next.h, y: next.y, ...grownToFit(next, f.text ?? "", info, style) });
  }, [doc, update]);

  const applyStyle = useCallback((patch: Partial<TextStyle>) => {
    if (fmtField) restyle(fmtField, { ...fmtStyle, ...patch }, fmtSize);
    else setNextStyle((st) => ({ ...st, ...patch }));
  }, [fmtField, fmtStyle, fmtSize, restyle]);

  const applySize = useCallback((pt: number) => {
    if (fmtField) restyle(fmtField, fmtStyle, pt);
    else setNextSize(pt);
  }, [fmtField, fmtStyle, restyle]);

  const clearFormat = useCallback(() => applyStyle({ ...DEFAULT_TEXT_STYLE }), [applyStyle]);

  const togglePainter = () => setPainter((p) => (p ? null : { style: fmtStyle, size: fmtSize }));

  const duplicate = (f: Field) => {
    const info = doc!.pages[f.page - 1];
    const copy: Field = { ...f, id: uid(), cover: undefined, replaces: undefined, x: clamp(f.x + 12 / info.width, 0, 1 - f.w), y: clamp(f.y + 12 / info.height, 0, 1 - f.h) };
    setFields((fs) => [...fs, copy]);
    setSelected(copy.id);
  };

  const onPagePointer = useCallback((page: number, fx: number, fy: number, e: RPointerEvent<HTMLDivElement>) => {
    setEditing(null);
    if (tool === "select") { setSelected(null); return; }
    // Stop the browser moving focus to the page after this, which would blur a new text field's input.
    e.preventDefault();
    if (tool === "image") { pendingImage.current = { page, fx, fy }; imageInput.current?.click(); setTool("select"); return; }
    place(tool, page, fx, fy, undefined, e.shiftKey);
  }, [tool, place]);

  const onImagePicked = async (file: File | undefined) => {
    const target = pendingImage.current;
    pendingImage.current = null;
    if (!file || !target) return;
    let image: FieldImage;
    try { image = await imageFromFile(file); }
    catch { setToast(`${file.name} couldn't be read as an image. Try a PNG or JPG.`); return; }
    if (target.replace) {
      const f = fields.find((x) => x.id === target.replace);
      if (f) update(f.id, { image });
    } else place("image", target.page, target.fx, target.fy, image);
  };

  /* ---------- drag to move / resize ---------- */

  const startDrag = (f: Field, mode: Drag["mode"]) => (e: RPointerEvent<HTMLElement>) => {
    if (editing === f.id) return;
    e.stopPropagation();
    // Paint format: this click takes the copied formatting instead of starting a drag.
    if (painter && (f.kind === "text" || f.kind === "date")) { e.preventDefault(); restyle(f, painter.style, painter.size); setPainter(null); setSelected(f.id); return; }
    const page = (e.currentTarget as HTMLElement).closest(`.${s.page}`)!.getBoundingClientRect();
    const others = fields.filter((x) => x.page === f.page && x.id !== f.id);
    drag.current = { id: f.id, mode, startX: e.clientX, startY: e.clientY, orig: f, pageW: page.width, pageH: page.height, moved: false, wasSelected: selected === f.id, others };
    setSelected(f.id);
    setEditing(null);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < 4) return;
      if (!d.moved) { d.moved = true; checkpoint(); }
      const fx = dx / d.pageW, fy = dy / d.pageH, o = d.orig;
      if (d.mode === "move") {
        let x = clamp(o.x + fx, 0, 1 - o.w), y = clamp(o.y + fy, 0, 1 - o.h);
        // Alt moves freely, without snapping.
        if (!e.altKey && doc) {
          const lefts = (pageText.pages.get(o.page)?.lines ?? []).map((l) => l.x);
          const snap = snapBox({ x, y, w: o.w, h: o.h }, d.pageW, d.pageH, doc.pages[o.page - 1], d.others, lefts);
          x = clamp(snap.x, 0, 1 - o.w); y = clamp(snap.y, 0, 1 - o.h);
          setGuides(snap.gx.length || snap.gy.length ? { page: o.page, xs: snap.gx, ys: snap.gy } : null);
        } else setGuides(null);
        update(d.id, { x, y }, false);
      } else {
        const hd = d.mode;
        const minW = 8 / (d.pageW / pxPerPt), minH = 8 / (d.pageH / pxPerPt);
        let { x, y, w, h } = o;
        if (hd.includes("e")) w = clamp(o.w + fx, minW, 1 - o.x);
        if (hd.includes("w")) { x = clamp(o.x + fx, 0, o.x + o.w - minW); w = o.w + o.x - x; }
        if (hd.includes("s")) h = clamp(o.h + fy, minH, 1 - o.y);
        if (hd.includes("n")) { y = clamp(o.y + fy, 0, o.y + o.h - minH); h = o.h + o.y - y; }
        // Corners keep the proportions of images, signatures and checkboxes, as Docs does for images.
        if (hd.length === 2 && o.kind !== "text" && o.kind !== "date") {
          const ax = hd.includes("w") ? o.x + o.w : o.x, ay = hd.includes("n") ? o.y + o.h : o.y;
          const most = Math.min(hd.includes("w") ? ax / o.w : (1 - o.x) / o.w, hd.includes("n") ? ay / o.h : (1 - o.y) / o.h);
          const k = clamp(Math.max(w / o.w, h / o.h), Math.max(minW / o.w, minH / o.h), most);
          w = o.w * k; h = o.h * k;
          x = hd.includes("w") ? ax - w : o.x; y = hd.includes("n") ? ay - h : o.y;
        }
        update(d.id, { x, y, w, h }, false);
      }
    };
    const up = () => {
      const d = drag.current;
      drag.current = null;
      setGuides(null);
      if (!d || d.moved) return;
      const f = fields.find((x) => x.id === d.id);
      if (!f) return;
      // Like other signing tools: one tap signs an empty signature or toggles a checkbox.
      // Anything else selects on the first tap and acts on the second, so it can be dragged first.
      const oneTap = f.kind === "check" || ((f.kind === "signature" || f.kind === "initials") && !f.image);
      if (d.wasSelected || oneTap) activate(f);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [checkpoint, update, fields, activate, pxPerPt, doc, pageText.pages]);

  /* ---------- keyboard ---------- */

  // Save draft is defined after the early return below, so the shortcut reaches it through a ref.
  const saveShortcut = useRef<() => void>(() => {});

  // Leaving or reloading the tab with unsaved fields asks first; fields live only in this tab.
  useEffect(() => {
    if (!doc || !fields.length || !unsaved) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [doc, fields.length, unsaved]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const mod = e.ctrlKey || e.metaKey;
      // Ctrl/⌘+S saves a draft (as in Docs) everywhere, even while typing, instead of the browser's "Save page".
      if (mod && !e.shiftKey && e.key.toLowerCase() === "s") { e.preventDefault(); saveShortcut.current(); return; }
      // Docs' formatting shortcuts, also while typing in a text field.
      if (mode === "edit" && mod && (!target.closest("input, textarea, select, dialog") || target.hasAttribute("data-field-input"))) {
        const k = e.key.toLowerCase();
        const fmt: (() => void) | null =
          !e.shiftKey && k === "b" ? () => applyStyle({ bold: !fmtStyle.bold })
          : !e.shiftKey && k === "i" ? () => applyStyle({ italic: !fmtStyle.italic })
          : !e.shiftKey && k === "u" ? () => applyStyle({ underline: !fmtStyle.underline })
          : e.key === "\\" ? clearFormat
          : e.shiftKey && k === "l" ? () => applyStyle({ align: "left" })
          : e.shiftKey && k === "e" ? () => applyStyle({ align: "center" })
          : e.shiftKey && k === "r" ? () => applyStyle({ align: "right" })
          : e.shiftKey && (e.key === ">" || e.key === ".") ? () => applySize(stepSize(fmtSize, 1))
          : e.shiftKey && (e.key === "<" || e.key === ",") ? () => applySize(stepSize(fmtSize, -1))
          : null;
        if (fmt) { e.preventDefault(); fmt(); return; }
      }
      const typing = target.closest("input, textarea, select, [contenteditable='true'], dialog");
      if (typing) return;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
      if (e.key === "Escape") { setTool("select"); setSelected(null); setPainter(null); return; }
      const f = fields.find((x) => x.id === selected);
      if (!f || !doc) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(f.id); return; }
      const arrows: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const a = arrows[e.key];
      if (a) {
        e.preventDefault();
        const info = doc.pages[f.page - 1], step = e.shiftKey ? 10 : 1;
        update(f.id, { x: clamp(f.x + (a[0] * step) / info.width, 0, 1 - f.w), y: clamp(f.y + (a[1] * step) / info.height, 0, 1 - f.h) });
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [fields, selected, doc, undo, redo, remove, update, mode, applyStyle, applySize, clearFormat, fmtStyle, fmtSize]);

  /* ---------- no document ---------- */

  if (!doc) {
    return (
      <>
        {mode === "sign"
          ? <PageHeader banner="signature" eyebrow="Sign" title="Sign a PDF" description="Open a PDF, place your signature and initials, then download the signed copy." />
          : <PageHeader banner="lines" eyebrow="Edit" title="Edit a PDF" description="Open a PDF to add text, dates, checkboxes and images, then download a new copy." />}
        {openUi}
        <DropZone busy={opening} onFiles={(f) => openFile(f[0])} />
      </>
    );
  }

  // Edited page text isn't something to fill in, so the Sign tab doesn't count it.
  const toFill = fields.filter((f) => !f.cover);
  const filled = toFill.filter(isFilled).length;
  const left = toFill.length - filled;
  const emptySigs = emptyOf("signature").length, emptyInits = emptyOf("initials").length;
  const toSign = emptySigs + emptyInits;
  const allDone = toFill.length > 0 && left === 0;
  // Something changed and nothing is waiting to be filled in: signed, or only text edits.
  const canDownload = fields.length > 0 && left === 0;
  // Next empty field in reading order (page, then top to bottom), after the selected one, wrapping around.
  // So Next moves past a checkbox, which it leaves for you to tick yourself.
  const byOrder = (a: Field, b: Field) => a.page - b.page || a.y - b.y || a.x - b.x;
  const empties = toFill.filter((f) => !isFilled(f)).sort(byOrder);
  const current = fields.find((f) => f.id === selected);
  const nextEmpty = (current && empties.find((f) => f.id !== current.id && byOrder(f, current) > 0)) ?? empties.find((f) => f.id !== current?.id) ?? empties[0];
  /** Next: scroll to the next empty field and open it (sign, or type), like a guided signing flow. */
  const goToNextEmpty = () => {
    if (!nextEmpty) return;
    setSelected(nextEmpty.id);
    document.querySelector(`[data-field-id="${nextEmpty.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" });
    if (nextEmpty.kind !== "check") activate(nextEmpty);
  };
  const askClose = () => (fields.length && unsaved ? setConfirmClose(true) : (close(), navigate("/")));
  /** Saves a draft; `then` runs only once it's stored. */
  const save = async (then?: () => void) => {
    setSaving(true);
    try { await saveDraft(); setToast(`Draft saved on this device for ${DRAFT_DAYS} days.`); then?.(); }
    catch { setToast("This browser won't save drafts (private windows often block it). Download from Review instead."); }
    finally { setSaving(false); }
  };
  saveShortcut.current = () => {
    if (saving) return;
    if (!fields.length) setToast("Place a field first, then save a draft.");
    else if (!unsaved) setToast("Already saved on this device.");
    else void save();
  };
  const saveButton = (
    <Button size="sm" variant="quiet" icon={<Save aria-hidden />} busy={saving} disabled={!unsaved || !fields.length}
      title={!fields.length ? "Place a field first" : unsaved ? "Keep this document and its fields on this device" : "Saved"} onClick={() => save()}>
      {draft && !unsaved ? "Saved" : "Save draft"}
    </Button>
  );
  const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const zoomTo = (z: number) => setZoom(Math.round(Math.min(2, Math.max(0.5, z)) * 100) / 100);
  const insertable = TOOLS.filter((t) => (mode === "sign" ? ["signature", "initials"] : ["text", "date", "check", "image"]).includes(t.id));
  // Docs-style menus. Everything here is also on the bar or toolbar; menus just make it findable.
  const menus: BarMenu[] = [
    { label: "File", items: [
      { label: "Open another PDF", icon: <FolderOpen />, onSelect: askClose },
      { label: draft && !unsaved ? "Saved as a draft" : "Save draft", icon: <Save />, shortcut: `${mod}S`, disabled: !unsaved || !fields.length, onSelect: () => save() },
      { label: "Review & download", icon: <Download />, disabled: !canDownload, onSelect: () => navigate("/editor/review") },
      "divider",
      { label: "Saved drafts", icon: <FileClock />, onSelect: () => navigate("/drafts") },
      "divider",
      { label: "Close document", icon: <LogOut />, tone: "danger", onSelect: askClose },
    ] },
    { label: "Edit", items: [
      { label: "Undo", icon: <Undo2 />, shortcut: `${mod}Z`, disabled: !canUndo, onSelect: undo },
      { label: "Redo", icon: <Redo2 />, shortcut: `${mod}Y`, disabled: !canRedo, onSelect: redo },
      "divider",
      { label: "Delete selected field", icon: <Trash2 />, shortcut: "Del", disabled: !selected, onSelect: () => selected && remove(selected) },
    ] },
    { label: "View", items: [
      { label: "Zoom in", icon: <ZoomIn />, disabled: zoom >= 2, onSelect: () => zoomTo(zoom + 0.25) },
      { label: "Zoom out", icon: <ZoomOut />, disabled: zoom <= 0.5, onSelect: () => zoomTo(zoom - 0.25) },
      { label: "Fit to width (100%)", icon: <Maximize2 />, disabled: zoom === 1, onSelect: () => setZoom(1) },
    ] },
    { label: "Insert", items: insertable.map((t) => ({ label: t.label, icon: t.icon, onSelect: () => setTool(t.id) })) },
    { label: "Tools", items: [
      mode === "sign"
        ? { label: "Edit this PDF", icon: <SquarePen />, onSelect: () => navigate("/edit") }
        : { label: "Sign this PDF", icon: <Signature />, onSelect: () => navigate("/editor") },
      ...(mode === "sign" ? [
        { label: "Sign all fields", icon: <Signature />, disabled: toSign === 0, onSelect: signAll },
        { label: "Next empty field", icon: <ArrowRight />, disabled: left === 0, onSelect: goToNextEmpty },
      ] : []),
      "divider",
      { label: "Organize pages", icon: <LayoutGrid />, onSelect: () => navigate("/organize") },
      { label: "Merge PDFs", icon: <Combine />, onSelect: () => navigate("/merge") },
      { label: "My signatures", icon: <PenLine />, onSelect: () => navigate("/signatures") },
    ] },
    { label: "Help", items: [
      { label: "Help & limits", icon: <LifeBuoy />, onSelect: () => navigate("/help") },
      { label: "Privacy & storage", icon: <ShieldCheck />, onSelect: () => navigate("/settings") },
    ] },
  ];
  const placing = tool !== "select";
  const replaced = new Set(fields.map((f) => f.replaces).filter(Boolean));
  const reading = [...pageText.pages.entries()].find(([, p]) => p.state === "ocr");

  return (
    <div className={s.editor}>
      {/* One pinned bar: where you are and the next thing to do, then the field tools. Nothing else. */}
      <div ref={dock} className={s.dock} data-state={mode === "edit" ? "edit" : allDone ? "done" : left > 0 ? "pending" : "empty"}>
        {/* Laid out like Google Docs: the title over the menu bar, actions on the right. */}
        <div className={s.signBar}>
          <span className={s.docHead}>
          <span className={s.progress} aria-live="polite">
            {/* Title, save state and count on one line; the progress line runs alongside. */}
            <span className={s.titleRow}>
              <span className={s.docName} title={doc.name}>{doc.name.replace(/\.pdf$/i, "")}</span>
              {!phone && <span className={s.saveState}>{draft ? (unsaved ? "Unsaved changes" : "Saved on this device") : "Not saved"}</span>}
              {mode === "edit" ? (
                <span className={s.hint}>
                  {reading ? `Reading scanned page ${reading[0]}… ${Math.round((reading[1].progress ?? 0) * 100)}%`
                    : painter ? "Click text to give it the copied formatting. Esc cancels."
                    : phone ? "Tap text to change it, or Add." : "Click any text on the page to change it, or insert new text."}
                </span>
              ) : toFill.length === 0 ? (
                <span className={s.hint}>{phone ? "Tap Add, then Signature." : "Pick Signature below, then tap where you sign."}</span>
              ) : allDone ? (
                <span className={s.donePill}><CircleCheckBig aria-hidden /> All {toFill.length} field{toFill.length === 1 ? "" : "s"} done</span>
              ) : (
                <span className={s.count}>{left} of {toFill.length} left
                  {toSign > 0 && <span className={s.detail}> · {[emptySigs && `${emptySigs} signature`, emptyInits && `${emptyInits} initials`].filter(Boolean).join(", ")}</span>}
                </span>
              )}
            </span>
            {/* Once everything is done the pill says so; the full bar would only repeat it. */}
            {mode === "sign" && toFill.length > 0 && !allDone && <ProgressBar value={filled / toFill.length} label="Fields filled" />}
          </span>
          {!phone && <MenuBar label="Document" menus={menus} />}
          </span>
          <span className={s.actions}>
            {!phone && saveButton}
            {mode === "edit" && <ButtonLink to="/editor" size="sm" variant={canDownload ? "secondary" : "primary"} icon={<Signature aria-hidden />}>Sign</ButtonLink>}
            {/* One orange action at a time: Sign all, else Next field. Review & download appears only once nothing is left to fill. */}
            {mode === "sign" && left > 0 && (phone
              ? <IconButton label="Next field" onClick={goToNextEmpty}><ArrowRight /></IconButton>
              : <Button size="sm" variant={toSign > 0 ? "secondary" : "primary"} onClick={goToNextEmpty}>Next field<ArrowRight aria-hidden /></Button>)}
            {mode === "sign" && toSign > 0 && <Button size="sm" icon={<Signature aria-hidden />} onClick={signAll}>Sign all</Button>}
            {canDownload && (
              <ButtonLink to="/editor/review" size="sm" variant="success" icon={<ListChecks aria-hidden />}>Review & download</ButtonLink>
            )}
          </span>
        </div>
        {!phone && mode === "sign" && (
          <EditorToolbar mode={mode} tool={tool} onTool={setTool} zoom={zoom} onZoom={setZoom}
            onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}
            signature={signature} initials={initials}
            onPlaceSigned={setTool} onCreateSigned={(kind) => setSignTarget({ kind, ids: [] })} />
        )}
        {!phone && mode === "edit" && (
          <div className={s.fmtRow}>
            <FormatBar style={fmtStyle} size={fmtSize} onStyle={applyStyle} onSize={applySize} onClear={clearFormat}
              painter={!!painter} onPainter={togglePainter} tool={tool} onTool={setTool} zoom={zoom} onZoom={setZoom}
              onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo} />
          </div>
        )}
      </div>

      {doc.signed && (
        <div className={s.notice}>
          <Alert tone="warn" title="This PDF already has a digital signature">
            Your changes will be added as a new revision, so the earlier signed version stays intact. PDF viewers will show that the document changed after it was signed.
          </Alert>
        </div>
      )}

      {placing && (
        <div className={s.placingBar} role="status">
          <span>Tap the page where the {FIELD_LABEL[tool as FieldKind].toLowerCase()} should go.{!phone && <span className={s.placingHint}> Hold Shift to place several.</span>}</span>
          <Button variant="quiet" size="sm" icon={<X aria-hidden />} onClick={() => setTool("select")}>Cancel</Button>
        </div>
      )}

      <div ref={desk} className={s.desk} data-placing={placing || undefined} data-painter={painter ? true : undefined}>
        {deskWidth > 0 && doc.pages.map((info, i) => {
          const n = i + 1;
          const text = mode === "edit" ? pageText.pages.get(n) : undefined;
          return (
            <PageView key={i} pdf={doc.pdf} n={n} of={doc.pages.length} info={info} width={info.width * pxPerPt}
              placing={placing} onPagePointer={onPagePointer} onNear={mode === "edit" ? pageText.request : undefined}>
              {(h) => (
                <>
                  {fields.filter((f) => f.page === n && f.cover).map((f) => <CoverBox key={`c${f.id}`} box={f.cover!} />)}
                  {/* Text already on the page: click a line to change it. */}
                  {text?.lines.filter((l) => !replaced.has(l.id)).map((l) => (
                    <button key={l.id} type="button" className={s.textRun} data-ocr={l.source === "ocr" || undefined}
                      aria-label={`Edit text: ${l.text}`} title={l.source === "ocr" ? "Edit text (read by OCR, check it)" : "Edit text"}
                      style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%`, width: `${l.w * 100}%`, height: `${l.h * 100}%` }}
                      onPointerDown={(e) => {
                        if (placing) return;
                        e.preventDefault(); e.stopPropagation();
                        editLine(l, e.currentTarget.closest(`.${s.page}`)?.querySelector("canvas") ?? null);
                      }} />
                  ))}
                  {fields.filter((f) => f.page === n).map((f) => (
                    <FieldBox key={f.id} field={f} pageHeight={h} selected={selected === f.id} editing={editing === f.id}
                      plain={mode === "sign" && !!f.cover}
                      onPointerDown={startDrag(f, "move")} onResizePointerDown={(e, hd) => startDrag(f, hd)(e)}
                      onActivate={() => activate(f)} onDelete={mode === "sign" ? () => remove(f.id) : undefined}
                      bubble={mode === "edit" ? (
                        <>
                          {f.cover && <button type="button" onClick={() => setEditing(f.id)}><Type aria-hidden />Edit</button>}
                          {f.kind === "image" && <button type="button" onClick={() => activate(f)}><ImageIcon aria-hidden />Replace image</button>}
                          {!f.cover && <button type="button" onClick={() => duplicate(f)}><Copy aria-hidden />Duplicate</button>}
                          {f.cover
                            ? <button type="button" onClick={() => remove(f.id)}><RotateCcw aria-hidden />Restore original</button>
                            : <button type="button" data-tone="danger" onClick={() => remove(f.id)}><Trash2 aria-hidden />Delete</button>}
                        </>
                      ) : undefined}
                      onText={(t) => update(f.id, { text: t, ...grownToFit(f, t, info) }, false)}
                      onDoneEditing={() => { setEditing(null); checkpoint(); }} />
                  ))}
                  {guides?.page === n && (
                    <>
                      {guides.xs.map((gx) => <span key={`x${gx}`} className={s.guideX} style={{ left: `${gx * 100}%` }} aria-hidden />)}
                      {guides.ys.map((gy) => <span key={`y${gy}`} className={s.guideY} style={{ top: `${gy * 100}%` }} aria-hidden />)}
                    </>
                  )}
                  {text && text.state !== "done" && (
                    <span className={s.pageStatus} role="status">
                      <ScanText aria-hidden />
                      {text.state === "ocr" ? `Scanned page · reading text ${Math.round((text.progress ?? 0) * 100)}%`
                        : text.state === "error" ? "Couldn't read the text on this page" : "Finding text…"}
                    </span>
                  )}
                  {text?.state === "done" && text.ocr && (
                    <span className={s.pageStatus} data-done>
                      <ScanText aria-hidden />{text.lines.length ? "Scanned page · text read by OCR, check it" : "Scanned page · no text found"}
                    </span>
                  )}
                </>
              )}
            </PageView>
          );
        })}
      </div>

      {phone && !sheet && mode === "edit" && fmtField && (
        <div className={s.phoneFormat}>
          <FormatBar compact style={fmtStyle} size={fmtSize} onStyle={applyStyle} onSize={applySize} onClear={clearFormat} />
        </div>
      )}
      {phone && !sheet && (
        <div className={s.phoneBar}>
          <IconButton label="Undo" disabled={!canUndo} onClick={undo}><Undo2 /></IconButton>
          <IconButton label="Redo" disabled={!canRedo} onClick={redo}><Redo2 /></IconButton>
          <IconButton label="Zoom out" disabled={zoom <= 1} onClick={() => setZoom((z) => Math.max(1, z - 0.5))}><ZoomOut /></IconButton>
          <IconButton label="Zoom in" disabled={zoom >= 3} onClick={() => setZoom((z) => Math.min(3, z + 0.5))}><ZoomIn /></IconButton>
          <Button icon={<Plus aria-hidden />} onClick={() => setSheet(true)}>Add</Button>
        </div>
      )}
      {phone && sheet && (
        <BottomSheet title="Add to page" onClose={() => setSheet(false)}>
          <SheetTools mode={mode} onPick={(t) => { setTool(t); setSheet(false); }} />
          <div className={s.sheetActions}>
            {saveButton}
            <Button variant="quiet" icon={<LogOut aria-hidden />} onClick={() => { setSheet(false); askClose(); }}>Close document</Button>
          </div>
        </BottomSheet>
      )}

      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { onImagePicked(e.target.files?.[0]); e.target.value = ""; }} />

      <Modal open={!!signTarget} onClose={() => setSignTarget(null)} size="md"
        title={signTarget?.kind === "initials" ? "Add your initials" : "Add your signature"}
        description={signTarget && !signTarget.ids.length
          ? "Make it once, then tap the page where it goes. Used only in this tab; nothing is saved."
          : signTarget && signTarget.ids.length > 1
          ? `It goes in all ${signTarget.ids.length} ${signTarget.kind === "initials" ? "initials" : "signature"} fields. Used only in this tab; nothing is saved.`
          : "Used only in this document and this tab. Nothing is saved."}>
        {signTarget && (
          <SignatureCreator key={signTarget.ids.join()} kind={signTarget.kind}
            onCancel={() => setSignTarget(null)}
            onUse={(img) => {
              if (signTarget.kind === "initials") setInitials(img); else setSignature(img);
              if (signTarget.ids.length) applyImage(signTarget.ids, img);
              else setTool(signTarget.kind); // made from the ⋯ menu: now tap where it goes
              if (signTarget.ids.length > 1) setToast(`Signed ${signTarget.ids.length} ${signTarget.kind === "initials" ? "initials" : "signature"} fields.`);
              setSignTarget(null);
            }} />
        )}
      </Modal>

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)} size="sm" title={draft ? "Close without saving changes?" : "Close without downloading?"}
        description={`${fields.length} field${fields.length === 1 ? "" : "s"} on this document`}
        footer={<>
          <Button variant="quiet" onClick={() => setConfirmClose(false)}>Keep editing</Button>
          <Button variant="danger" onClick={() => { setConfirmClose(false); close(); navigate("/"); }}>{draft ? "Discard changes" : "Close and discard"}</Button>
          <Button busy={saving} icon={<Save aria-hidden />} onClick={() => save(() => { setConfirmClose(false); close(); navigate("/"); })}>Save draft and close</Button>
        </>}>
        <p>{draft
          ? "Your saved draft keeps the fields from its last save. Changes since then will be gone."
          : `Your fields and signatures will be gone unless you save a draft, which keeps them on this device for ${DRAFT_DAYS} days. The original file isn't affected.`}</p>
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} onUndo={canUndo ? undo : undefined} />

    </div>
  );
}
