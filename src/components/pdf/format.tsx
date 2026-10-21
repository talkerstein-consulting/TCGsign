// Edit's toolbar, laid out like Google Docs': undo, redo, paint format | zoom | font | size | B I U, text
// colour, highlight | insert | alignment | clear formatting. Formatting applies to the selected text,
// or to the next text you add when nothing is selected, as in Docs.
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  AlignCenter, AlignLeft, AlignRight, Baseline, Bold, CalendarDays, Check, ChevronDown, Highlighter, ImagePlus, Italic,
  Minus, PaintRoller, Plus, Redo2, RemoveFormatting, SquareCheck, Type, Underline, Undo2,
} from "lucide-react";
import { FONT_FACES, type TextAlign, type TextStyle } from "../../pdf/text";
import type { ToolId } from "./tools";
import s from "./pdf.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Google Docs' standard text and highlight colours. */
const PALETTE = [
  ["#000000", "#434343", "#666666", "#999999", "#b7b7b7", "#cccccc", "#d9d9d9", "#efefef", "#f3f3f3", "#ffffff"],
  ["#980000", "#ff0000", "#ff9900", "#ffff00", "#00ff00", "#00ffff", "#4a86e8", "#0000ff", "#9900ff", "#ff00ff"],
  ["#e6b8af", "#f4cccc", "#fce5cd", "#fff2cc", "#d9ead3", "#d0e0e3", "#c9daf8", "#cfe2f3", "#d9d2e9", "#ead1dc"],
  ["#cc4125", "#e06666", "#f6b26b", "#ffd966", "#93c47d", "#76a5af", "#6d9eeb", "#6fa8dc", "#8e7cc3", "#c27ba0"],
  ["#85200c", "#990000", "#b45f06", "#bf9000", "#38761d", "#134f5c", "#1155cc", "#0b5394", "#351c75", "#741b47"],
];
const COLOR_NAMES: Record<string, string> = { "#000000": "black", "#ffffff": "white", "#ff0000": "red", "#ffff00": "yellow", "#0000ff": "blue", "#00ff00": "green" };

/** Docs' size list, in points. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96];
const ZOOMS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 2, 3];
const ALIGNS: { id: TextAlign; label: string; key: string; icon: ReactNode }[] = [
  { id: "left", label: "Left align", key: "Ctrl+Shift+L", icon: <AlignLeft aria-hidden /> },
  { id: "center", label: "Center align", key: "Ctrl+Shift+E", icon: <AlignCenter aria-hidden /> },
  { id: "right", label: "Right align", key: "Ctrl+Shift+R", icon: <AlignRight aria-hidden /> },
];

/** A dropdown anchored under its button. Fixed-positioned so the toolbar's scrolling never clips it. */
function Dropdown({ label, trigger, triggerClass, width = 200, children }: {
  label: string; trigger: ReactNode; triggerClass?: string; width?: number; children: (close: () => void) => ReactNode;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setAt(null), []);
  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    const scroll = (e: Event) => { if (!panel.current?.contains(e.target as Node)) close(); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", close);
    };
  }, [at, close]);
  return (
    <>
      <button ref={btn} type="button" className={cx(s.fmtBtn, triggerClass)} aria-label={label} title={label}
        aria-haspopup="true" aria-expanded={!!at} aria-controls={id}
        onClick={() => {
          if (at) return close();
          const r = btn.current!.getBoundingClientRect();
          setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
        }}>
        {trigger}
      </button>
      {at && (
        <div ref={panel} id={id} role="dialog" aria-label={label} className={s.fmtMenu} style={{ top: at.top, left: at.left, width }}>
          {children(close)}
        </div>
      )}
    </>
  );
}

function Palette({ value, onPick, none }: { value: string | null; onPick: (c: string | null) => void; none?: string }) {
  return (
    <div className={s.palette}>
      {none && <button type="button" className={s.paletteNone} onClick={() => onPick(null)}>{value === null && <Check aria-hidden />}{none}</button>}
      <div className={s.swatches}>
        {PALETTE.flat().map((c) => (
          <button key={c} type="button" className={s.swatch} style={{ background: c }} aria-label={COLOR_NAMES[c] ?? c} title={COLOR_NAMES[c] ?? c}
            aria-pressed={value?.toLowerCase() === c} onClick={() => onPick(c)} />
        ))}
      </div>
      <label className={s.paletteCustom}>
        <Plus aria-hidden />Custom
        <input type="color" value={value ?? "#000000"} onChange={(e) => onPick(e.target.value)} />
      </label>
    </div>
  );
}

const Sep = () => <span className={s.fmtSep} aria-hidden />;

export type FormatBarProps = {
  style: TextStyle;
  /** Points. */
  size: number;
  onStyle: (patch: Partial<TextStyle>) => void;
  onSize: (pt: number) => void;
  onClear: () => void;
  painter?: boolean;
  onPainter?: () => void;
  /** Phone: formatting only. */
  compact?: boolean;
  tool?: ToolId; onTool?: (t: ToolId) => void;
  zoom?: number; onZoom?: (z: number) => void;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
};

export function FormatBar({ style, size, onStyle, onSize, onClear, painter, onPainter, compact, tool, onTool, zoom = 1, onZoom, onUndo, onRedo, canUndo, canRedo }: FormatBarProps) {
  const shown = String(Math.round(size * 10) / 10);
  const [sizeText, setSizeText] = useState(shown);
  // Follow the selection's size, unless you're mid-typing a new one.
  const [lastShown, setLastShown] = useState(shown);
  if (shown !== lastShown) { setLastShown(shown); setSizeText(shown); }
  const commitSize = () => {
    const n = Number(sizeText);
    if (Number.isFinite(n) && n >= 1 && n <= 400) onSize(n); else setSizeText(shown);
  };
  const toggle = (k: "bold" | "italic" | "underline", label: string, key: string, icon: ReactNode) => (
    <button type="button" className={s.fmtBtn} aria-pressed={style[k]} aria-label={label} title={`${label} (${key})`} onClick={() => onStyle({ [k]: !style[k] })}>{icon}</button>
  );
  const insert = (id: ToolId, label: string, icon: ReactNode) => (
    <button type="button" className={cx(s.fmtBtn, s.fmtInsert)} aria-pressed={tool === id} aria-label={`Insert ${label.toLowerCase()}`} title={`Insert ${label.toLowerCase()}`} onClick={() => onTool?.(tool === id ? "select" : id)}>
      {icon}<span>{label}</span>
    </button>
  );
  const face = FONT_FACES.find((f) => f.id === style.font)!;

  return (
    // Buttons don't take focus from the text you're typing in, as in Docs.
    <div role="toolbar" aria-label="Text formatting" className={cx(s.fmtBar, compact && s.fmtCompact)}
      onPointerDown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}>
      {!compact && (
        <>
          <button type="button" className={s.fmtBtn} aria-label="Undo" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 aria-hidden /></button>
          <button type="button" className={s.fmtBtn} aria-label="Redo" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={onRedo}><Redo2 aria-hidden /></button>
          <button type="button" className={s.fmtBtn} aria-label="Paint format" title="Paint format: copy the selected text's formatting, then click other text" aria-pressed={!!painter} onClick={onPainter}><PaintRoller aria-hidden /></button>
          <Sep />
          <Dropdown label="Zoom" width={120} triggerClass={s.fmtSelect} trigger={<><span className={s.fmtValue}>{Math.round(zoom * 100)}%</span><ChevronDown aria-hidden /></>}>
            {(close) => ZOOMS.map((z) => (
              <button key={z} type="button" className={s.fmtItem} onClick={() => { onZoom?.(z); close(); }}>
                {z === zoom ? <Check aria-hidden /> : <i />}{z === 1 ? "Fit (100%)" : `${Math.round(z * 100)}%`}
              </button>
            ))}
          </Dropdown>
          <Sep />
        </>
      )}

      <Dropdown label="Font" width={200} triggerClass={cx(s.fmtSelect, s.fmtFont)} trigger={<><span className={s.fmtValue} style={{ fontFamily: face.css }}>{face.label}</span><ChevronDown aria-hidden /></>}>
        {(close) => FONT_FACES.map((f) => (
          <button key={f.id} type="button" className={s.fmtItem} style={{ fontFamily: f.css }} onClick={() => { onStyle({ font: f.id }); close(); }}>
            {f.id === style.font ? <Check aria-hidden /> : <i />}{f.label}
          </button>
        ))}
      </Dropdown>
      <Sep />

      <span className={s.fmtSize}>
        <button type="button" className={s.fmtBtn} aria-label="Decrease font size" title="Decrease font size (Ctrl+Shift+,)" onClick={() => onSize(stepSize(size, -1))}><Minus aria-hidden /></button>
        <input className={s.fmtSizeInput} value={sizeText} inputMode="decimal" aria-label="Font size" title="Font size"
          list={compact ? undefined : "fmt-sizes"} onChange={(e) => setSizeText(e.target.value)} onBlur={commitSize}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitSize(); (e.target as HTMLInputElement).blur(); } }} />
        {!compact && <datalist id="fmt-sizes">{FONT_SIZES.map((n) => <option key={n} value={n} />)}</datalist>}
        <button type="button" className={s.fmtBtn} aria-label="Increase font size" title="Increase font size (Ctrl+Shift+.)" onClick={() => onSize(stepSize(size, 1))}><Plus aria-hidden /></button>
      </span>
      <Sep />

      {toggle("bold", "Bold", "Ctrl+B", <Bold aria-hidden />)}
      {toggle("italic", "Italic", "Ctrl+I", <Italic aria-hidden />)}
      {toggle("underline", "Underline", "Ctrl+U", <Underline aria-hidden />)}
      <Dropdown label="Text color" width={252} trigger={<span className={s.fmtColor}><Baseline aria-hidden /><i style={{ background: style.color }} /></span>}>
        {(close) => <Palette value={style.color} onPick={(c) => { onStyle({ color: c ?? "#000000" }); close(); }} />}
      </Dropdown>
      <Dropdown label="Highlight color" width={252} trigger={<span className={s.fmtColor}><Highlighter aria-hidden /><i style={{ background: style.highlight ?? "transparent" }} /></span>}>
        {(close) => <Palette value={style.highlight} none="None" onPick={(c) => { onStyle({ highlight: c }); close(); }} />}
      </Dropdown>
      <Sep />

      {!compact && (
        <>
          {insert("text", "Text", <Type aria-hidden />)}
          {insert("date", "Date", <CalendarDays aria-hidden />)}
          {insert("check", "Checkbox", <SquareCheck aria-hidden />)}
          {insert("image", "Image", <ImagePlus aria-hidden />)}
          <Sep />
        </>
      )}

      {ALIGNS.map((a) => (
        <button key={a.id} type="button" className={s.fmtBtn} aria-pressed={style.align === a.id} aria-label={a.label} title={`${a.label} (${a.key})`} onClick={() => onStyle({ align: a.id })}>{a.icon}</button>
      ))}
      <Sep />
      <button type="button" className={s.fmtBtn} aria-label="Clear formatting" title="Clear formatting (Ctrl+\)" onClick={onClear}><RemoveFormatting aria-hidden /></button>
    </div>
  );
}

/** One point up or down, like Docs' − and + buttons. */
export const stepSize = (size: number, dir: 1 | -1) => Math.min(400, Math.max(1, Math.round(size) + dir));
