import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent as RPointerEvent } from "react";
import { useNavigate } from "react-router";
import {
  ArrowLeft, ArrowRight, CheckSquare, Download, FilePen, Redo2, RotateCcw, RotateCw, Square, Trash2, Undo2,
} from "lucide-react";
import { Alert, Badge, Button, IconButton, PageHeader, Toast } from "../../components/ui";
import { DropZone, PageThumb, PrivacyNote, ThumbGrid } from "../../components/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Field } from "../../pdf/engine";
import { formatSize } from "../../pdf/format";
import { useDocument, type OpenDoc } from "../../state/document";
import { useOpenFile } from "../useOpenFile";
import s from "./organize.module.css";

/** One page of the new document. `rotation` is absolute (what /Rotate will be). */
type Item = { id: string; index: number; rotation: number };

const THUMB = 160;
const norm = (deg: number) => ((deg % 360) + 360) % 360;

/** Lazily drawn page preview; emptied when scrolled far away. */
function ThumbCanvas({ pdf, n }: { pdf: PDFDocumentProxy; n: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "600px 0px" });
    io.observe(canvas.current!);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const c = canvas.current!;
    if (!near) { c.width = 0; c.height = 0; return; }
    let cancel = () => {};
    // A thumbnail that can't be drawn stays blank; the page itself is still organised and exported.
    import("../../pdf/engine").then(({ renderPage }) => { cancel = renderPage(pdf, n, c, THUMB); }, (e) => console.warn("Couldn't load the PDF engine for thumbnails", e));
    return () => cancel();
  }, [near, pdf, n]);
  return <canvas ref={canvas} aria-hidden />;
}

/** Moves fields to follow their page: dropped with deleted pages, renumbered, and re-centred on rotated pages. */
function remapFields(fields: Field[], items: Item[], doc: OpenDoc): { fields: Field[]; dropped: number } {
  const out: Field[] = [];
  let dropped = 0;
  for (const f of fields) {
    const at = items.findIndex((it) => it.index === f.page - 1);
    if (at < 0) { dropped++; continue; }
    const old = doc.pages[f.page - 1];
    const turn = norm(items[at].rotation - old.rotation);
    const [W, H] = [old.width, old.height];
    const [nW, nH] = turn % 180 ? [H, W] : [W, H];
    const cx = f.x + f.w / 2, cy = f.y + f.h / 2;
    // Rotate the field's centre with the page (clockwise); keep its size in points so text stays upright.
    const [ncx, ncy] = turn === 90 ? [1 - cy, cx] : turn === 180 ? [1 - cx, 1 - cy] : turn === 270 ? [cy, 1 - cx] : [cx, cy];
    const w = Math.min(1, (f.w * W) / nW), h = Math.min(1, (f.h * H) / nH);
    out.push({ ...f, page: at + 1, w, h, x: Math.min(1 - w, Math.max(0, ncx - w / 2)), y: Math.min(1 - h, Math.max(0, ncy - h / 2)) });
  }
  return { fields: out, dropped };
}

export default function Organize() {
  const { doc, fields, replace } = useDocument();
  const { openFile, ui: openUi } = useOpenFile("/organize");
  const navigate = useNavigate();

  const initial = useCallback((): Item[] => (doc ? doc.pages.map((p, i) => ({ id: `p${i}`, index: i, rotation: p.rotation })) : []), [doc]);
  const [items, setItemsState] = useState<Item[]>(initial);
  const [past, setPast] = useState<Item[][]>([]);
  const [future, setFuture] = useState<Item[][]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "continue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [formFields, setFormFields] = useState(0);
  const current = useRef(items);
  useLayoutEffect(() => { current.current = items; }, [items]);

  // A different document was opened: start over.
  const [forDoc, setForDoc] = useState(doc);
  if (forDoc !== doc) { setForDoc(doc); setItemsState(initial()); setPast([]); setFuture([]); setSelected(new Set()); }

  useEffect(() => {
    if (!doc) return;
    // Only used for a warning, so if counting fails we just don't show it.
    import("../../pdf/engine").then(({ countFormFields }) => countFormFields(doc.bytes, doc.password)).then(setFormFields, () => setFormFields(0));
  }, [doc]);

  const commit = (next: Item[]) => { setPast((p) => [...p.slice(-99), items]); setFuture([]); setItemsState(next); };
  const undo = () => { if (!past.length) return; setFuture((f) => [items, ...f]); setItemsState(past[past.length - 1]); setPast((p) => p.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, items]); setItemsState(future[0]); setFuture((f) => f.slice(1)); };

  const targets = (id?: string) => (id ? new Set([id]) : selected);
  const rotate = (by: number, id?: string) => {
    const t = targets(id);
    commit(items.map((it) => (t.has(it.id) ? { ...it, rotation: norm(it.rotation + by) } : it)));
  };
  const remove = (id?: string) => {
    const t = targets(id);
    const next = items.filter((it) => !t.has(it.id));
    commit(next);
    setSelected((sel) => new Set([...sel].filter((x) => !t.has(x))));
    setToast(`${t.size} page${t.size === 1 ? "" : "s"} removed`);
  };
  const move = (by: -1 | 1) => {
    // Moves the selection as a block, keeping its order.
    const next = [...items];
    const order = by < 0 ? next.map((_, i) => i) : next.map((_, i) => next.length - 1 - i);
    for (const i of order) {
      const j = i + by;
      if (selected.has(next[i].id) && j >= 0 && j < next.length && !selected.has(next[j].id)) [next[i], next[j]] = [next[j], next[i]];
    }
    commit(next);
  };

  const select = (id: string, e: MouseEvent | KeyboardEvent) => {
    if (e.shiftKey && anchor) {
      const a = items.findIndex((x) => x.id === anchor), b = items.findIndex((x) => x.id === id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      setSelected(new Set(items.slice(lo, hi + 1).map((x) => x.id)));
      return;
    }
    setSelected((sel) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); return n; });
    setAnchor(id);
  };

  /* ---------- drag to reorder (grip handle; works with touch) ---------- */

  // Listeners go on in the pointerdown handler itself, so even a very quick drag is seen in full.
  const startDrag = (id: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const before = current.current;
    let order = before; // tracked here so the end of the drag doesn't depend on React's render timing
    setDragId(id);

    // A lifted copy of the page follows the pointer; its slot in the grid stays as the drop placeholder.
    const src = e.currentTarget.closest<HTMLElement>("[data-page-id]");
    let ghost: HTMLElement | null = null;
    let grab = { x: 0, y: 0 };
    if (src) {
      const r = src.getBoundingClientRect();
      grab = { x: e.clientX - r.left, y: e.clientY - r.top };
      ghost = src.cloneNode(true) as HTMLElement;
      // Canvases don't clone their pixels, so copy the rendered page across.
      const from = src.querySelectorAll("canvas"), to = ghost.querySelectorAll("canvas");
      from.forEach((c, i) => { to[i].width = c.width; to[i].height = c.height; to[i].getContext("2d")?.drawImage(c, 0, 0); });
      ghost.removeAttribute("data-page-id");
      ghost.setAttribute("aria-hidden", "true");
      Object.assign(ghost.style, {
        position: "fixed", left: "0", top: "0", width: `${r.width}px`, height: `${r.height}px`, margin: "0",
        zIndex: "1000", pointerEvents: "none", opacity: "0.95", boxShadow: "0 18px 40px rgb(25 37 74 / .28)",
        transform: `translate(${r.left}px, ${r.top}px) rotate(2deg) scale(1.03)`, transition: "none",
      });
      document.body.append(ghost);
    }
    const follow = (ev: PointerEvent) => {
      if (ghost) ghost.style.transform = `translate(${ev.clientX - grab.x}px, ${ev.clientY - grab.y}px) rotate(2deg) scale(1.03)`;
      // Near the top or bottom edge, scroll so a long document can be reordered end to end.
      const edge = 72;
      if (ev.clientY < edge) window.scrollBy(0, -Math.ceil((edge - ev.clientY) / 4));
      else if (ev.clientY > window.innerHeight - edge) window.scrollBy(0, Math.ceil((ev.clientY - (window.innerHeight - edge)) / 4));
    };

    const moveTo = (ev: PointerEvent) => {
      follow(ev);
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-page-id]");
      const over = el?.dataset.pageId;
      if (!el || !over || over === id) return;
      const r = el.getBoundingClientRect();
      const after = ev.clientX > r.left + r.width / 2;
      const from = order.findIndex((x) => x.id === id);
      const rest = order.filter((x) => x.id !== id);
      const to = Math.max(0, Math.min(rest.length, rest.findIndex((x) => x.id === over) + (after ? 1 : 0)));
      if (to === from) return;
      order = [...rest.slice(0, to), order[from], ...rest.slice(to)];
      setItemsState(order);
    };
    const end = () => {
      ghost?.remove();
      window.removeEventListener("pointermove", moveTo);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragId(null);
      // One undo step for the whole drag, and only if the order changed.
      if (order !== before) { setPast((p) => [...p.slice(-99), before]); setFuture([]); }
    };
    window.addEventListener("pointermove", moveTo);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  /* ---------- keyboard ---------- */

  const onThumbKey = (id: string) => (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      const i = items.findIndex((x) => x.id === id), j = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (j < 0 || j >= items.length) return;
      const next = [...items]; [next[i], next[j]] = [next[j], next[i]];
      commit(next);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-page-id="${id}"]`)?.focus());
    } else if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); remove(selected.has(id) ? undefined : id); }
    else if (e.key.toLowerCase() === "r") { e.preventDefault(); rotate(e.shiftKey ? -90 : 90, selected.has(id) ? undefined : id); }
  };
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, dialog")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === "a") { e.preventDefault(); setSelected(new Set(items.map((x) => x.id))); }
      else if (e.key === "Escape") setSelected(new Set());
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  /* ---------- export ---------- */

  const build = async () => {
    const { organizePdf, openPdf } = await import("../../pdf/engine");
    const bytes = await organizePdf(doc!.bytes, items.map(({ index, rotation }) => ({ index, rotation })), doc!.password);
    const check = await openPdf(bytes); // prove the new file opens before handing it over
    const n = check.doc.numPages;
    void check.doc.loadingTask.destroy();
    if (n !== items.length) throw new Error(`Expected ${items.length} pages, got ${n}`);
    return bytes;
  };

  const download = async () => {
    setBusy("download"); setError(null);
    try {
      const bytes = await build();
      const name = doc!.name.replace(/\.pdf$/i, "") + "-organized.pdf";
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setToast(`Downloaded ${name} · ${formatSize(bytes.length)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't make the PDF"); }
    finally { setBusy(null); }
  };

  const continueEditing = async () => {
    setBusy("continue"); setError(null);
    try {
      const bytes = await build();
      const { fields: moved } = remapFields(fields, items, doc!);
      await replace(bytes, doc!.name, moved);
      navigate("/editor");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't apply the changes"); setBusy(null); }
  };

  /* ---------- render ---------- */

  if (!doc) {
    return (
      <>
        <PageHeader banner="grid" eyebrow="Tools" title="Organize pages" description="Rotate, reorder and delete pages, then download a new PDF. The original file isn't changed." />
        {openUi}
        <DropZone onFiles={(f) => openFile(f[0])} />
      </>
    );
  }

  const changed = items.length !== doc.pages.length || items.some((it, i) => it.index !== i || it.rotation !== doc.pages[i].rotation);
  const deleted = doc.pages.length - items.length;
  const lostFields = fields.filter((f) => !items.some((it) => it.index === f.page - 1)).length;
  const n = selected.size;

  return (
    <div className={s.organize}>
      <PageHeader eyebrow="Organize pages" title={doc.name.replace(/\.pdf$/i, "")}
        description={<>{items.length} page{items.length === 1 ? "" : "s"}{deleted > 0 ? ` (${deleted} removed)` : ""} · original {formatSize(doc.size)} <PrivacyNote /></>}
        actions={<>
          <Button variant="secondary" icon={<FilePen aria-hidden />} busy={busy === "continue"} disabled={!items.length || !!busy} onClick={continueEditing}>Continue to Sign</Button>
          <Button icon={<Download aria-hidden />} busy={busy === "download"} disabled={!items.length || !!busy} onClick={download}>Download PDF</Button>
        </>} />

      {doc.signed && <Alert tone="warn" title="This PDF has a digital signature">Reorganizing makes a new file, so the existing signature won't be valid in it. Keep the original if you need the signature.</Alert>}
      {formFields > 0 && <Alert tone="warn" title={`This PDF has ${formFields} fillable form field${formFields === 1 ? "" : "s"}`}>Their values show in the new file, but they may stop being editable. Fill them in before organizing if you can.</Alert>}
      {lostFields > 0 && <Alert tone="info" title={`${lostFields} placed field${lostFields === 1 ? " is" : "s are"} on removed pages`}>They'll be dropped when you continue to Sign.</Alert>}
      {!items.length && <Alert tone="err" title="Every page is removed">Undo, or reset, to keep at least one page.</Alert>}
      {error && <Alert tone="err" title="Couldn't make the PDF">{error}</Alert>}

      <div className={s.bar} role="toolbar" aria-label="Page tools">
        <span className={s.count} aria-live="polite">{n ? <><Badge>{n}</Badge> selected</> : "Tap pages to select"}</span>
        <IconButton bare label={n === items.length && n > 0 ? "Select none" : "Select all"} onClick={() => setSelected(n === items.length ? new Set() : new Set(items.map((x) => x.id)))}>
          {n === items.length && n > 0 ? <Square /> : <CheckSquare />}
        </IconButton>
        <span className={s.sep} aria-hidden />
        <IconButton bare label="Rotate left" disabled={!n} onClick={() => rotate(-90)}><RotateCcw /></IconButton>
        <IconButton bare label="Rotate right" disabled={!n} onClick={() => rotate(90)}><RotateCw /></IconButton>
        <IconButton bare label="Move earlier" disabled={!n} onClick={() => move(-1)}><ArrowLeft /></IconButton>
        <IconButton bare label="Move later" disabled={!n} onClick={() => move(1)}><ArrowRight /></IconButton>
        <IconButton bare label="Delete selected" disabled={!n} onClick={() => remove()}><Trash2 /></IconButton>
        <span className={s.sep} aria-hidden />
        <IconButton bare label="Undo" disabled={!past.length} onClick={undo}><Undo2 /></IconButton>
        <IconButton bare label="Redo" disabled={!future.length} onClick={redo}><Redo2 /></IconButton>
        <Button variant="quiet" size="sm" disabled={!changed} onClick={() => { commit(initial()); setSelected(new Set()); }}>Reset</Button>
      </div>

      <div className={s.grid}>
        <ThumbGrid label="Pages, in order">
          {items.map((it, i) => {
            const page = doc.pages[it.index];
            return (
              <PageThumb key={it.id} id={it.id} number={i + 1} aspect={page.width / page.height}
                rotation={norm(it.rotation - page.rotation) > 180 ? norm(it.rotation - page.rotation) - 360 : norm(it.rotation - page.rotation)}
                selected={selected.has(it.id)} dragging={dragId === it.id}
                onSelect={(e) => select(it.id, e)} onRotate={() => rotate(90, it.id)} onDelete={() => remove(it.id)}
                onGripPointerDown={startDrag(it.id)} onKeyDown={onThumbKey(it.id)}>
                <ThumbCanvas pdf={doc.pdf} n={it.index + 1} />
              </PageThumb>
            );
          })}
        </ThumbGrid>
      </div>

      <p className={s.help}>
        Drag a page by its handle to move it. On a keyboard: Space selects, Alt + arrow moves, R rotates, Delete removes, Ctrl + Z undoes.
        {deleted > 0 && " Removed pages are left out of the new file completely."}
      </p>

      <Toast message={toast} onDone={() => setToast(null)} onUndo={past.length ? undo : undefined} />
    </div>
  );
}
