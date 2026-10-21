// A field placed on a page. Positioned in fractions of the page so it holds its place at any zoom.
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import { Check, MoreHorizontal, PenLine, Plus, Redo2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import { IconButton } from "../ui";
import type { Box, Field, FieldImage } from "../../pdf/engine";
import { DEFAULT_TEXT_STYLE, TEXT_BASELINE, TEXT_SIZE, fontCss } from "../../pdf/text";
import { EDIT_TOOLS, FIELD_LABEL, SIGN_TOOLS, type EditorMode, type ToolId } from "./tools";
import s from "./pdf.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/** Resize handles, by the side or corner they sit on. */
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";
const ALL_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
/** Text keeps the height its font size gives it, so only its width changes; a checkbox stays square. */
export const handlesFor = (f: Field): Handle[] =>
  f.kind === "text" || f.kind === "date" ? ["w", "e"] : f.kind === "check" ? ["nw", "ne", "se", "sw"] : ALL_HANDLES;

/** The page colour painted over original text that's been edited. */
export function CoverBox({ box }: { box: Box & { color: string } }) {
  return <div className={s.cover} aria-hidden style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%`, background: box.color }} />;
}

export function isFilled(f: Field) {
  return f.kind === "check" ? !!f.checked : f.kind === "text" || f.kind === "date" ? !!f.text?.trim() : !!f.image;
}

type FieldBoxProps = {
  field: Field;
  /** Rendered page height in CSS pixels; text size follows it. */
  pageHeight: number;
  selected?: boolean;
  editing?: boolean;
  onPointerDown?: (e: RPointerEvent<HTMLDivElement>) => void;
  onResizePointerDown?: (e: RPointerEvent<HTMLSpanElement>, handle: Handle) => void;
  /** Tap on an already-selected field, or Enter: sign, edit text, or toggle the checkbox. */
  onActivate?: () => void;
  onText?: (text: string) => void;
  onDoneEditing?: () => void;
  onDelete?: () => void;
  /** Actions shown under the selected field, like Docs' image bubble. */
  bubble?: ReactNode;
  /** Edited page text, shown as it will print: no outline, not draggable (on the Sign tab). */
  plain?: boolean;
};

export function FieldBox({ field, pageHeight, selected: picked, editing, onPointerDown, onResizePointerDown, onActivate, onText, onDoneEditing, onDelete, bubble, plain }: FieldBoxProps) {
  // Plain text can't be picked, even if it was still selected when you switched tabs.
  const selected = picked && !plain;
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) return;
    // After the browser's own pointer/focus handling for the tap that started editing.
    const id = setTimeout(() => { input.current?.focus(); input.current?.select(); }, 0);
    return () => clearTimeout(id);
  }, [editing]);

  const boxH = field.h * pageHeight;
  const style: CSSProperties = {
    left: `${field.x * 100}%`, top: `${field.y * 100}%`, width: `${field.w * 100}%`, height: `${field.h * 100}%`,
    ["--fs" as string]: `${boxH * TEXT_SIZE}px`,
    // Puts the text baseline where export draws it (TEXT_BASELINE of the box height).
    ["--lh" as string]: `${boxH}px`,
    ["--shift" as string]: `${(TEXT_BASELINE - 0.715) * boxH}px`,
  };
  const st = field.style ?? DEFAULT_TEXT_STYLE;
  const textStyle: CSSProperties = {
    fontFamily: fontCss(st.font), fontWeight: st.bold ? 700 : 400, fontStyle: st.italic ? "italic" : "normal",
    color: st.color, textDecoration: st.underline ? "underline" : "none", textAlign: st.align,
  };
  const label = field.cover ? "Edited text" : FIELD_LABEL[field.kind];
  const empty = !isFilled(field) && field.kind !== "check";
  const valueText = field.kind === "check" ? (field.checked ? "checked" : "not checked") : field.text || (field.image ? "signed" : "empty");

  return (
    <div className={cx(s.placed, field.kind === "check" && s.placedCheck, field.kind === "image" && s.placedImage)} style={style}
      data-selected={!!selected} data-empty={empty && !field.cover} data-field-id={field.id} data-plain={plain || undefined}
      data-edit={field.cover ? true : undefined} role={plain ? undefined : "button"} tabIndex={plain ? -1 : 0}
      aria-label={`${label} field on page ${field.page}, ${valueText}`}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => { if (e.key === "Enter" && !editing) { e.preventDefault(); onActivate?.(); } }}>
      {selected && <span className={s.fieldTag}>{label}</span>}

      {editing && (field.kind === "text" || field.kind === "date") ? (
        <input ref={input} className={s.fieldInput} value={field.text ?? ""} aria-label={`${label} value`} spellCheck data-field-input
          style={{ ...textStyle, background: st.highlight ?? undefined }}
          onChange={(e) => onText?.(e.target.value)} onBlur={onDoneEditing}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Escape") { e.stopPropagation(); onDoneEditing?.(); } }}
          onPointerDown={(e) => e.stopPropagation()} />
      ) : field.image ? (
        <img className={s.fieldImg} src={field.image.src} alt="" draggable={false} data-kind={field.kind} />
      ) : field.kind === "check" ? (
        field.checked ? <Check className={s.tick} strokeWidth={3.2} aria-hidden /> : null
      ) : field.text ? (
        <span className={s.fieldText} style={textStyle}>
          {st.highlight ? <mark className={s.fieldMark} style={{ background: st.highlight }}>{field.text}</mark> : field.text}
        </span>
      ) : field.cover ? null : (
        <span className={s.fieldHint}>{field.kind === "signature" || field.kind === "initials" ? `Tap to ${field.kind === "signature" ? "sign" : "initial"}` : field.kind === "image" ? "Tap to add image" : `Tap to type`}</span>
      )}

      {selected && onDelete && (
        <button type="button" className={s.fieldDelete} aria-label={`Delete ${label.toLowerCase()} field`} title="Delete"
          onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }}><X size={14} /></button>
      )}
      {selected && onResizePointerDown && handlesFor(field).map((h) => (
        <span key={h} className={s.handle} data-handle={h} onPointerDown={(e) => onResizePointerDown(e, h)} aria-hidden />
      ))}
      {selected && !editing && bubble && <div className={s.bubble} onPointerDown={(e) => e.stopPropagation()}>{bubble}</div>}
    </div>
  );
}

/* ---------- editor toolbar ---------- */

type SignKind = "signature" | "initials";

/**
 * The ⋯ beside Signature, like Acrobat's Sign menu: place the signature or initials you've made,
 * or make (or redo) one. Positioned fixed so the toolbar's horizontal scroll can't clip it.
 */
function SignMenu({ signature, initials, onPlace, onCreate }: {
  signature?: FieldImage | null; initials?: FieldImage | null; onPlace: (k: SignKind) => void; onCreate: (k: SignKind) => void;
}) {
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();
  const open = () => {
    const r = btn.current!.getBoundingClientRect();
    setAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 288)) });
  };
  const close = useCallback(() => setAt(null), []);
  useEffect(() => {
    if (!at) return;
    const away = (e: PointerEvent) => { if (!panel.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { close(); btn.current?.focus(); } };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    (panel.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    return () => {
      document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close);
    };
  }, [at, close]);
  const pick = (fn: () => void) => () => { close(); fn(); };
  const section = (kind: SignKind, saved: FieldImage | null | undefined) => {
    const noun = kind === "signature" ? "signature" : "initials";
    return (
      <>
        <p className={s.menuLabel}>{kind === "signature" ? "Signature" : "Initials"}</p>
        {saved && (
          <button type="button" role="menuitem" className={s.savedSign} onClick={pick(() => onPlace(kind))} title={`Place your ${noun}`}>
            <img src={saved.src} alt={`Your ${noun}`} />
          </button>
        )}
        <button type="button" role="menuitem" className={s.menuRow} onClick={pick(() => onCreate(kind))}>
          {saved ? <PenLine aria-hidden /> : <Plus aria-hidden />}{saved ? `Redo ${noun}` : `Add ${noun}`}
        </button>
      </>
    );
  };
  return (
    <>
      <button ref={btn} type="button" className={s.toolMore} aria-label="Signature options" title="Signature options"
        aria-haspopup="menu" aria-expanded={!!at} aria-controls={id} onClick={() => (at ? close() : open())}>
        <MoreHorizontal aria-hidden />
      </button>
      {at && (
        <div ref={panel} id={id} role="menu" aria-label="Signature options" className={s.signMenu} style={{ top: at.top, left: at.left }}
          onKeyDown={(e) => {
            if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
            e.preventDefault();
            const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
            const i = items.indexOf(document.activeElement as HTMLElement);
            items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }}>
          {section("signature", signature)}
          {section("initials", initials)}
        </div>
      )}
    </>
  );
}

export function EditorToolbar({ mode = "sign", tool, onTool, zoom, onZoom, onUndo, onRedo, canUndo, canRedo, signature, initials, onPlaceSigned, onCreateSigned }: {
  mode?: EditorMode; tool: ToolId; onTool: (t: ToolId) => void; zoom: number; onZoom: (z: number) => void;
  onUndo?: () => void; onRedo?: () => void; canUndo?: boolean; canRedo?: boolean;
  signature?: FieldImage | null; initials?: FieldImage | null;
  onPlaceSigned?: (k: SignKind) => void; onCreateSigned?: (k: SignKind) => void;
}) {
  const tools = mode === "sign" ? SIGN_TOOLS : EDIT_TOOLS;
  const button = (t: (typeof tools)[number]) => (
    <button key={t.id} type="button" className={s.tool} aria-pressed={tool === t.id} onClick={() => onTool(t.id)}>{t.icon}{t.label}</button>
  );
  return (
    <div role="toolbar" aria-label={mode === "sign" ? "Signing tools" : "Editing tools"} className={s.toolbar}>
      {mode === "sign" ? (
        <>
          {/* One cell: tap it to place a signature; the ⋯ in its corner opens the signature menu. */}
          <span className={s.signCell}>
            {button(tools[0])}
            <SignMenu signature={signature} initials={initials}
              onPlace={(k) => (onPlaceSigned ? onPlaceSigned(k) : onTool(k))} onCreate={(k) => onCreateSigned?.(k)} />
          </span>
          <span className={s.toolSep} aria-hidden />
          {tools.slice(1).map(button)}
        </>
      ) : (
        <>
          {button(tools[0])}
          <span className={s.toolSep} aria-hidden />
          {tools.slice(1).map(button)}
        </>
      )}
      <span className={s.toolSep} aria-hidden />
      {/* Actions run at once, unlike the tools above that wait for a tap on the page, so they look different. */}
      <IconButton bare label="Undo (Ctrl+Z)" disabled={!canUndo} onClick={onUndo}><Undo2 /></IconButton>
      <IconButton bare label="Redo (Ctrl+Shift+Z)" disabled={!canRedo} onClick={onRedo}><Redo2 /></IconButton>
      <span className={s.zoom}>
        <IconButton bare label="Zoom out" disabled={zoom <= 0.5} onClick={() => onZoom(Math.max(0.5, zoom - 0.25))}><ZoomOut /></IconButton>
        <span aria-live="polite">{Math.round(zoom * 100)}%</span>
        <IconButton bare label="Zoom in" disabled={zoom >= 3} onClick={() => onZoom(Math.min(3, zoom + 0.25))}><ZoomIn /></IconButton>
      </span>
    </div>
  );
}
