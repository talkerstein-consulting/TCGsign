// PDF-tool components. The editor renders real pages with PDF.js; PageLines and
// PageCanvas are grey placeholders for the style page and screens not built yet.
import {
  useEffect, useId, useRef, useState,
  type CSSProperties, type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent,
  type PointerEvent, type ReactNode, type RefObject,
} from "react";
import { Check, FileUp, GripVertical, RotateCw, ShieldCheck, Trash2 } from "lucide-react";
import { Badge, Button, ProgressBar, Segmented, Input, Field } from "../ui";
import { SHEET_TOOLS, type EditorMode, type ToolId } from "./tools";
import type { Phase, Status } from "../../routes";
import type { FieldImage } from "../../pdf/engine";
import { INK, imageFromFile, trimCanvas, typedSignature } from "../../pdf/signature";
import s from "./pdf.module.css";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- privacy ---------- */

/** The promise local mode makes. Use next to any control that takes a file. */
export function PrivacyNote({ block = false }: { block?: boolean }) {
  if (!block) return <span className={s.privacy}><ShieldCheck aria-hidden />Stays on this device</span>;
  return (
    <div className={s.privacyBlock}>
      <ShieldCheck aria-hidden />
      <div>
        <strong>Your files stay on this device</strong>
        <p>PDFs open and save in this browser. Nothing is uploaded, and nothing is kept unless you choose to save a draft.</p>
      </div>
    </div>
  );
}

/* ---------- drop zone ---------- */

export function DropZone({ onFiles, multiple = false, small = false, busy = false, title, children }: {
  onFiles: (files: File[]) => void; multiple?: boolean; small?: boolean; title?: string; children?: ReactNode;
  /** A file is being opened: the button shows progress and new drops are ignored. */
  busy?: boolean;
}) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const take = (list: FileList | null) => {
    if (busy) return;
    const files = [...(list ?? [])].filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length) onFiles(multiple ? files : files.slice(0, 1));
  };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files); };
  return (
    <div className={cx(s.drop, small && s.dropSmall)} data-over={over} aria-busy={busy || undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <span className={s.dropIcon} aria-hidden><FileUp /></span>
      <h2>{title ?? (multiple ? "Drop PDFs here" : "Drop a PDF here")}</h2>
      {children ?? <p>Or choose a file from this device. On a phone, you can pick from Files, iCloud Drive or Google Drive.</p>}
      <div className={s.row}>
        {/* Cleared after each pick so choosing the same file again still opens it. */}
        <input ref={input} id={id} type="file" accept="application/pdf,.pdf" multiple={multiple} onChange={(e) => { take(e.target.files); e.target.value = ""; }} tabIndex={-1} />
        <Button icon={<FileUp />} busy={busy} onClick={() => input.current?.click()}>{busy ? "Opening…" : multiple ? "Choose PDFs" : "Choose a PDF"}</Button>
      </div>
      <PrivacyNote />
    </div>
  );
}

/* ---------- document row ---------- */

export type DraftDoc = { id: string; name: string; pages: number; sizeMb: number; savedAt: string; expiresInDays: number; signed?: boolean };

export function DocumentRow({ doc, onOpen, actions }: { doc: DraftDoc; onOpen?: () => void; actions?: ReactNode }) {
  const expiring = doc.expiresInDays <= 2;
  return (
    <li className={s.doc}>
      <span className={s.docIcon} aria-hidden><span>PDF</span></span>
      <span className={s.docMain}>
        <button type="button" className={s.docName} onClick={onOpen}>{doc.name}</button>
        <span className={s.docMeta}>{doc.pages} pages · {doc.sizeMb < 0.1 ? `${Math.max(1, Math.round(doc.sizeMb * 1024))} KB` : `${doc.sizeMb.toFixed(1)} MB`} · Saved {doc.savedAt}</span>
      </span>
      <span className={s.docBadge}>
        {doc.signed
          ? <Badge tone="ok"><Check aria-hidden />Signed</Badge>
          : <Badge tone={expiring ? "warn" : "neutral"}>{doc.expiresInDays === 0 ? "Deleted tonight" : `Deletes in ${doc.expiresInDays} day${doc.expiresInDays === 1 ? "" : "s"}`}</Badge>}
      </span>
      <span className={s.docActions}>{actions}</span>
    </li>
  );
}
export function DocumentList({ children }: { children: ReactNode }) { return <ul className={s.docList}>{children}</ul>; }

/* ---------- page thumbnails ---------- */

/** Placeholder page body: grey lines standing in for text until PDF.js renders the real page. */
export function PageLines({ count = 14 }: { count?: number }) {
  return <span className={s.lines} aria-hidden>{Array.from({ length: count }, (_, i) => <i key={i} />)}</span>;
}

type ThumbProps = {
  number: number;
  /** Rotation added on top of how the page currently displays, in degrees clockwise. */
  rotation?: number;
  /** Page width ÷ height as it currently displays (before `rotation`). */
  aspect?: number;
  selected?: boolean;
  dragging?: boolean;
  onSelect?: (e: ReactMouseEvent | ReactKeyboardEvent) => void;
  onRotate?: () => void;
  onDelete?: () => void;
  /** Drag handle. Without it the grip is decorative. */
  onGripPointerDown?: (e: PointerEvent<HTMLSpanElement>) => void;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLDivElement>) => void;
  id?: string;
  children?: ReactNode;
};

/** A page tile. The paper takes the page's real shape and turns with `rotation`. */
export function PageThumb({ number, rotation = 0, aspect = 8.5 / 11, selected, dragging, onSelect, onRotate, onDelete, onGripPointerDown, onKeyDown, id, children }: ThumbProps) {
  const turned = Math.abs(rotation) % 180 === 90;
  const shown = turned ? 1 / aspect : aspect; // tile shape after rotation
  // The content keeps its own shape and is rotated inside the tile; sizes are % of the tile.
  const inner: CSSProperties = turned
    // Turned 90°: the content's width spans the tile's height and vice versa.
    ? { width: `${100 / shown}%`, height: `${shown * 100}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg)` }
    : { width: "100%", height: "100%", transform: `translate(-50%, -50%) rotate(${rotation}deg)` };
  return (
    <div className={s.thumb} role="option" aria-selected={!!selected} aria-label={`Page ${number}${rotation ? `, rotated ${((rotation % 360) + 360) % 360}°` : ""}`}
      tabIndex={0} data-page-id={id} data-dragging={dragging || undefined}
      onClick={onSelect} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(e); } onKeyDown?.(e); }}>
      <span className={cx(s.grip, onGripPointerDown && s.gripLive)} onPointerDown={onGripPointerDown} onClick={(e) => e.stopPropagation()}
        title={onGripPointerDown ? "Drag to move" : undefined} aria-hidden><GripVertical size={16} /></span>
      <span className={s.thumbFrame}>
        <span className={s.thumbPaper} style={{ aspectRatio: String(shown), ...(shown >= 1 ? { width: "100%" } : { height: "100%" }) }}>
          <span className={s.thumbInner} style={inner}>{children ?? <PageLines count={11} />}</span>
        </span>
      </span>
      <span className={s.thumbFoot}>
        <span className={s.thumbNum}>{number}</span>
        <span className={s.thumbTools}>
          <button type="button" aria-label={`Rotate page ${number}`} title="Rotate" onClick={(e) => { e.stopPropagation(); onRotate?.(); }}><RotateCw /></button>
          <button type="button" className={s.del} aria-label={`Delete page ${number}`} title="Delete" onClick={(e) => { e.stopPropagation(); onDelete?.(); }}><Trash2 /></button>
        </span>
      </span>
    </div>
  );
}
export function ThumbGrid({ label, children }: { label: string; children: ReactNode }) {
  return <div role="listbox" aria-label={label} aria-multiselectable="true" className={s.thumbs}>{children}</div>;
}

export { CoverBox, EditorToolbar, FieldBox, handlesFor, isFilled, type Handle } from "./fields";
export { FormatBar, FONT_SIZES, stepSize } from "./format";
export { EDIT_TOOLS, FIELD_LABEL, FIELD_SIZE, SIGN_TOOLS, TOOLS, type EditorMode, type ToolId } from "./tools";

/* ---------- placeholder pages ---------- */

function PlaceholderPage({ n, of, children }: { n: number; of: number; children?: (page: number, height: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setH(e.contentRect.height));
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} className={s.page} aria-label={`Page ${n} of ${of}`}>
      <PageLines count={22} />
      {h > 0 && children?.(n, h)}
      <span className={s.pageLabel}>{n} / {of}</span>
    </div>
  );
}

/** Grey stand-in pages for the style page. The editor renders real pages with PDF.js. */
export function PageCanvas({ pages, children }: { pages: number; children?: (page: number, height: number) => ReactNode }) {
  return (
    <div className={s.desk}>
      {Array.from({ length: pages }, (_, i) => <PlaceholderPage key={i} n={i + 1} of={pages}>{children}</PlaceholderPage>)}
    </div>
  );
}

/* ---------- signatures ---------- */

/** Draw with finger, pen or mouse. touch-action:none keeps the page from scrolling while signing. */
export function SignaturePad({ canvasRef, onChange }: { canvasRef?: RefObject<HTMLCanvasElement | null>; onChange?: (hasInk: boolean) => void }) {
  const own = useRef<HTMLCanvasElement>(null);
  const canvas = canvasRef ?? own;
  const [ink, setInk] = useState(false);
  const drawing = useRef(false);
  const changed = useRef(onChange);
  useEffect(() => { changed.current = onChange; }, [onChange]);

  useEffect(() => {
    const c = canvas.current!;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = r.width * dpr; c.height = r.height * dpr;
      const g = c.getContext("2d")!;
      g.scale(dpr, dpr); g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 2.4;
      g.strokeStyle = INK;
      setInk(false); changed.current?.(false);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
  }, [canvas]);

  const at = (e: PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] as const; };
  const down = (e: PointerEvent) => {
    canvas.current!.setPointerCapture(e.pointerId);
    drawing.current = true;
    const g = canvas.current!.getContext("2d")!; const [x, y] = at(e);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + .1, y + .1); g.stroke();
    if (!ink) { setInk(true); onChange?.(true); }
  };
  const move = (e: PointerEvent) => {
    if (!drawing.current) return;
    const g = canvas.current!.getContext("2d")!; const [x, y] = at(e);
    g.lineTo(x, y); g.stroke();
  };
  const clear = () => {
    const c = canvas.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setInk(false); onChange?.(false);
  };
  return (
    <div className={s.pad}>
      <div className={s.padSurface}>
        <span className={s.padLine} aria-hidden /><span className={s.padX} aria-hidden>×</span>
        {!ink && <span className={s.padHint}>Sign with your finger, pen or mouse</span>}
        <canvas ref={canvas} aria-label="Signature drawing area. Use the Type tab for a keyboard alternative."
          onPointerDown={down} onPointerMove={move} onPointerUp={() => (drawing.current = false)} onPointerCancel={() => (drawing.current = false)} />
      </div>
      <div className={s.padFoot}>
        <PrivacyNote />
        <Button variant="quiet" size="sm" onClick={clear} disabled={!ink}>Clear</Button>
      </div>
    </div>
  );
}

/** Keyboard-accessible alternative to drawing. */
export function TypedSignature({ value, onChange, label = "Type your name" }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className={s.pad}>
      <Field label={label}><Input value={value} onChange={(e) => onChange(e.target.value)} autoComplete="name" /></Field>
      <div className={s.typedPreview} aria-hidden>{value || "Your name"}</div>
    </div>
  );
}

const initialsOf = (name: string) => name.trim().split(/\s+/).map((p) => p[0] ?? "").join("").toUpperCase().slice(0, 3);

/** Draw, type or upload a signature (or initials). `onUse` gets a trimmed PNG. */
export function SignatureCreator({ kind = "signature", defaultName = "", onUse, onCancel }: {
  kind?: "signature" | "initials"; defaultName?: string; onUse?: (img: FieldImage) => void; onCancel?: () => void;
}) {
  const [mode, setMode] = useState("draw");
  const [name, setName] = useState(kind === "initials" ? initialsOf(defaultName) : defaultName);
  const [ink, setInk] = useState(false);
  const [upload, setUpload] = useState<FieldImage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const ready = mode === "draw" ? ink : mode === "type" ? !!name.trim() : !!upload;
  const noun = kind === "initials" ? "initials" : "signature";

  const use = async () => {
    setBusy(true); setError(null);
    try {
      const img = mode === "draw" ? trimCanvas(canvas.current!) : mode === "type" ? await typedSignature(name) : upload;
      if (img) onUse?.(img);
      else setError(mode === "draw" ? "Nothing was drawn. Sign in the box, then try again." : `Your ${noun} came out blank. Try again.`);
    } catch {
      setError(`Your ${noun} couldn't be made. Try again, or use another way (draw, type or upload).`);
    } finally { setBusy(false); }
  };
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setUpload(await imageFromFile(f)); setError(null); }
    catch { setError("That image couldn't be read. Try a PNG or JPG."); }
  };

  return (
    <div className={s.pad}>
      <Segmented label={`How to add your ${noun}`} value={mode} onChange={(m) => { setMode(m); setError(null); }}
        items={[{ value: "draw", label: "Draw" }, { value: "type", label: "Type" }, { value: "upload", label: "Upload image" }]} />
      {mode === "draw" && <SignaturePad canvasRef={canvas} onChange={setInk} />}
      {mode === "type" && <TypedSignature label={kind === "initials" ? "Type your initials" : "Type your name"} value={name} onChange={setName} />}
      {mode === "upload" && (
        <div className={s.pad}>
          <div className={s.uploadBox}>
            {upload ? <img src={upload.src} alt={`Uploaded ${noun}`} /> : <span>PNG or JPG, ideally on a white or clear background.</span>}
          </div>
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className={s.padFoot}>
            <PrivacyNote />
            <Button variant="secondary" size="sm" onClick={() => file.current?.click()}>{upload ? "Choose another" : "Choose image"}</Button>
          </div>
          {error && <span className={s.errorText} role="alert">{error}</span>}
        </div>
      )}
      {error && mode !== "upload" && <span className={s.errorText} role="alert">{error}</span>}
      {onUse && (
        <div className={s.creatorFoot}>
          {onCancel && <Button variant="quiet" onClick={onCancel}>Cancel</Button>}
          <Button disabled={!ready} busy={busy} onClick={use}>Use this {noun}</Button>
        </div>
      )}
    </div>
  );
}

/** A signature or initials: `img` when one has been made, else `text` in the signature face. `saved` is the note under it. */
export function SignatureCard({ text, img, kind = "signature", saved, actions }: { text: string; img?: FieldImage | null; kind?: "signature" | "initials"; saved: string; actions?: ReactNode }) {
  const noun = kind === "initials" ? "Initials" : "Signature";
  return (
    <div className={s.sigCard}>
      <div className={cx(s.sigSample, kind === "initials" && s.initials)}>{img ? <img src={img.src} alt={`Your ${noun.toLowerCase()}`} className={s.sigImg} /> : text}</div>
      <div className={s.sigFoot}><span>{saved === "" ? noun : `${noun} · ${saved}`}</span>{actions}</div>
    </div>
  );
}

/* ---------- bottom sheet ---------- */

/** Phone tool tray. `contained` positions it inside a parent frame (style page previews). */
export function BottomSheet({ title, onClose, contained, children }: { title: string; onClose?: () => void; contained?: boolean; children: ReactNode }) {
  const id = useId();
  return (
    <div role="dialog" aria-labelledby={id} className={cx(s.sheet, contained && s.contained)}>
      <span className={s.grabber} aria-hidden />
      <div className={s.sheetHead}><h3 id={id}>{title}</h3>{onClose && <Button variant="quiet" size="sm" onClick={onClose}>Done</Button>}</div>
      {children}
    </div>
  );
}
export function SheetTools({ mode = "sign", onPick }: { mode?: EditorMode; onPick?: (t: ToolId) => void }) {
  return (
    <div className={s.sheetGrid}>
      {SHEET_TOOLS[mode].map((t) => (
        <button key={t.id} type="button" className={s.sheetTool} onClick={() => onPick?.(t.id)}>{t.icon}{t.label}</button>
      ))}
    </div>
  );
}

/* ---------- storage meter ---------- */

export function StorageMeter({ usedMb, drafts, quotaMb }: { usedMb: number; drafts: number; quotaMb?: number }) {
  return (
    <div className={s.meter}>
      <div className={s.meterHead}>
        <strong>{usedMb.toFixed(1)} MB</strong>
        <span>{drafts} draft{drafts === 1 ? "" : "s"}{quotaMb ? ` · ${quotaMb >= 1024 ? `${(quotaMb / 1024).toFixed(0)} GB` : `${quotaMb} MB`} available to this browser` : ""}</span>
      </div>
      {quotaMb ? <ProgressBar value={usedMb / quotaMb} label="Device storage used" tone="fill" /> : null}
      <p className={s.meterNote}>Browsers can clear saved drafts to free space. Safari deletes them after 7 days without a visit, unless the app is on your Home Screen. Keep anything important by downloading it.</p>
    </div>
  );
}

/* ---------- sitemap chips ---------- */

export function PhaseChip({ phase }: { phase: Phase }) {
  const cls = phase === 1 ? s.p1 : phase === 2 ? s.p2 : phase === 3 ? s.p3 : s.pint;
  const text = phase === "internal" ? "Internal" : phase === 3 ? "Phase 3 · not approved" : `Phase ${phase}`;
  return <span className={cx(s.phase, cls)}>{text}</span>;
}
export function StatusChip({ status }: { status: Status }) {
  return status === "built" ? <Badge tone="ok"><Check aria-hidden />Built</Badge>
    : status === "stub" ? <Badge tone="neutral">Route, no screen yet</Badge>
    : <Badge tone="warn">Planned</Badge>;
}
