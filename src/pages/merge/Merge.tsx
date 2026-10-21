import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { useNavigate } from "react-router";
import { ArrowDown, ArrowUp, Download, FilePen, FilePlus2, GripVertical, Lock, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Field, IconButton, Input, PageHeader, Toast } from "../../components/ui";
import { DropZone, PrivacyNote } from "../../components/pdf";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { NotAPdf, PasswordNeeded } from "../../pdf/errors";
import { formatSize } from "../../pdf/format";
import { useDocument } from "../../state/document";
import s from "./merge.module.css";

type Status = "reading" | "ready" | "locked" | "damaged";
type Source = {
  id: string;
  file: File;
  bytes: Uint8Array;
  status: Status;
  pdf?: PDFDocumentProxy;
  pages?: number;
  signed?: boolean;
  formFields?: number;
  password?: string;
  /** The last password tried was wrong. */
  incorrect?: boolean;
};

const uid = () => Math.random().toString(36).slice(2, 10);
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** First page, small. */
function FirstPage({ pdf }: { pdf: PDFDocumentProxy }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let cancel = () => {};
    import("../../pdf/engine").then(({ renderPage }) => { if (canvas.current) cancel = renderPage(pdf, 1, canvas.current, 56); }, (e) => console.warn("Couldn't load the PDF engine for thumbnails", e));
    return () => cancel();
  }, [pdf]);
  return <canvas ref={canvas} className={s.thumbCanvas} aria-hidden />;
}

export default function Merge() {
  const { replace } = useDocument();
  const navigate = useNavigate();
  const [sources, setSources] = useState<Source[]>([]);
  const [name, setName] = useState("merged.pdf");
  const [dragId, setDragId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"download" | "continue" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [passwords, setPasswords] = useState<Record<string, string>>({});
  const addInput = useRef<HTMLInputElement>(null);

  // Latest list for handlers and for cleanup on unmount.
  const current = useRef(sources);
  useLayoutEffect(() => { current.current = sources; }, [sources]);
  useEffect(() => () => { for (const x of current.current) void x.pdf?.loadingTask.destroy(); }, []);

  const patch = (id: string, p: Partial<Source>) => setSources((list) => list.map((x) => (x.id === id ? { ...x, ...p } : x)));

  /** Opens a source to learn its page count and whether it's usable. */
  const inspect = async (src: Source, password?: string) => {
    try {
      const { openPdf, countFormFields } = await import("../../pdf/engine");
      const { doc, pages, signed } = await openPdf(src.bytes, password);
      const formFields = await countFormFields(src.bytes, password);
      // The file may have been removed while it was being read.
      if (!current.current.some((x) => x.id === src.id)) { void doc.loadingTask.destroy(); return; }
      patch(src.id, { status: "ready", pdf: doc, pages: pages.length, signed, formFields, password, incorrect: false });
    } catch (e) {
      if (e instanceof PasswordNeeded) patch(src.id, { status: "locked", incorrect: e.incorrect });
      else if (e instanceof NotAPdf) patch(src.id, { status: "damaged" });
      else patch(src.id, { status: "damaged" });
    }
  };

  const add = async (files: File[]) => {
    // A file the browser can't read (moved, deleted, or no permission) is listed as damaged, not lost.
    const added: Source[] = await Promise.all(files.map(async (file) => {
      try { return { id: uid(), file, bytes: new Uint8Array(await file.arrayBuffer()), status: "reading" as const }; }
      catch { return { id: uid(), file, bytes: new Uint8Array(), status: "damaged" as const }; }
    }));
    setSources((list) => [...list, ...added]);
    current.current = [...current.current, ...added];
    added.filter((x) => x.status === "reading").forEach((x) => void inspect(x));
  };

  const remove = (id: string) => {
    const gone = sources.find((x) => x.id === id);
    void gone?.pdf?.loadingTask.destroy();
    setSources((list) => list.filter((x) => x.id !== id));
    if (gone) setToast(`Removed ${gone.file.name}`);
  };

  const moveBy = (id: string, by: -1 | 1) => {
    setSources((list) => {
      const i = list.findIndex((x) => x.id === id), j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list]; [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const unlock = (src: Source) => {
    const pw = passwords[src.id];
    if (!pw) return;
    patch(src.id, { status: "reading" });
    void inspect(src, pw);
  };

  /* ---------- drag to reorder (handle; works with touch) ---------- */

  // Listeners go on in the pointerdown handler, so a quick drag is seen in full.
  const startDrag = (id: string) => (e: RPointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    let order = current.current;
    setDragId(id);
    const moveTo = (ev: PointerEvent) => {
      const el = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>("[data-source-id]");
      const over = el?.dataset.sourceId;
      if (!el || !over || over === id) return;
      const r = el.getBoundingClientRect();
      const below = ev.clientY > r.top + r.height / 2;
      const from = order.findIndex((x) => x.id === id);
      const rest = order.filter((x) => x.id !== id);
      const to = Math.max(0, Math.min(rest.length, rest.findIndex((x) => x.id === over) + (below ? 1 : 0)));
      if (to === from) return;
      order = [...rest.slice(0, to), order[from], ...rest.slice(to)];
      setSources(order);
    };
    const end = () => {
      window.removeEventListener("pointermove", moveTo);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setDragId(null);
    };
    window.addEventListener("pointermove", moveTo);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  const onRowKey = (id: string) => (e: KeyboardEvent<HTMLLIElement>) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
    e.preventDefault();
    moveBy(id, e.key === "ArrowUp" ? -1 : 1);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-source-id="${id}"]`)?.focus());
  };

  /* ---------- build ---------- */

  const ready = sources.filter((x) => x.status === "ready");
  const blocked = sources.filter((x) => x.status !== "ready");
  const totalPages = ready.reduce((t, x) => t + (x.pages ?? 0), 0);
  const fileName = name.trim().toLowerCase().endsWith(".pdf") ? name.trim() : `${name.trim() || "merged"}.pdf`;
  const canMerge = ready.length >= 2 && !blocked.some((x) => x.status === "reading");

  const build = async () => {
    const { mergePdfs, openPdf } = await import("../../pdf/engine");
    const bytes = await mergePdfs(ready.map((x) => ({ bytes: x.bytes, password: x.password })));
    const check = await openPdf(bytes); // prove the new file opens with every page before handing it over
    const n = check.doc.numPages;
    void check.doc.loadingTask.destroy();
    if (n !== totalPages) throw new Error(`Expected ${totalPages} pages, got ${n}`);
    return bytes;
  };

  const download = async () => {
    setBusy("download"); setError(null);
    try {
      const bytes = await build();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setToast(`Downloaded ${fileName} · ${plural(totalPages, "page")} · ${formatSize(bytes.length)}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't make the PDF"); }
    finally { setBusy(null); }
  };

  const continueEditing = async () => {
    setBusy("continue"); setError(null);
    try {
      const bytes = await build();
      await replace(bytes, fileName, []);
      navigate("/editor");
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't open the merged PDF"); setBusy(null); }
  };

  /* ---------- render ---------- */

  const intro = "Combine PDFs into one, in the order you choose. Files are read in this browser and nothing is uploaded.";

  if (!sources.length) {
    return (
      <>
        <PageHeader banner="merge" eyebrow="Tools" title="Merge PDFs" description={intro} />
        <DropZone multiple onFiles={add} title="Drop the PDFs to combine">
          <p>Choose two or more files. You can add more and change the order next.</p>
        </DropZone>
      </>
    );
  }

  const signed = ready.filter((x) => x.signed);
  const withForms = ready.filter((x) => (x.formFields ?? 0) > 0);
  const skipped = sources.filter((x) => x.status === "locked" || x.status === "damaged");

  return (
    <div className={s.merge}>
      <PageHeader eyebrow="Tools" title="Merge PDFs"
        description={<>{plural(ready.length, "file")} · {plural(totalPages, "page")} in the merged PDF <PrivacyNote /></>}
        actions={<>
          <Button variant="secondary" icon={<FilePen aria-hidden />} busy={busy === "continue"} disabled={!canMerge || !!busy} onClick={continueEditing}>Continue to Sign</Button>
          <Button icon={<Download aria-hidden />} busy={busy === "download"} disabled={!canMerge || !!busy} onClick={download}>Download PDF</Button>
        </>} />

      {ready.length < 2 && !sources.some((x) => x.status === "reading") && (
        <Alert tone="info" title="Add at least two PDFs">Merging needs two or more files that open. Use Add PDFs below.</Alert>
      )}
      {skipped.length > 0 && (
        <Alert tone="warn" title={`${plural(skipped.length, "file")} won't be included`}>
          {skipped.map((x) => `${x.file.name} (${x.status === "locked" ? "needs its password" : "not a valid PDF"})`).join(", ")}. {skipped.length === 1 ? "It's" : "They're"} left out of the merged PDF.{skipped.some((x) => x.status === "locked") ? " Enter a password to include a protected file." : ""}{skipped.some((x) => x.status === "damaged") ? " Damaged files can't be included; export them again from the app that made them." : ""}
        </Alert>
      )}
      {signed.length > 0 && (
        <Alert tone="warn" title="Digital signatures won't carry over">
          {signed.map((x) => x.file.name).join(", ")} {signed.length === 1 ? "has" : "have"} a digital signature. The merged PDF is a new file, so the signature won't be valid in it.
        </Alert>
      )}
      {withForms.length > 0 && (
        <Alert tone="warn" title="Fillable form fields may stop working">
          {withForms.map((x) => x.file.name).join(", ")} {withForms.length === 1 ? "has" : "have"} form fields. Their values show in the merged PDF, but they may no longer be editable.
        </Alert>
      )}
      {error && <Alert tone="err" title="Couldn't make the PDF">{error}</Alert>}

      <ol className={s.list} aria-label="Files, in merge order">
        {sources.map((x, i) => (
          <li key={x.id} className={s.row} data-source-id={x.id} data-dragging={dragId === x.id || undefined} data-status={x.status}
            tabIndex={0} aria-label={`${i + 1}. ${x.file.name}`} onKeyDown={onRowKey(x.id)}>
            <span className={s.grip} onPointerDown={startDrag(x.id)} title="Drag to move" aria-hidden><GripVertical size={18} /></span>
            <span className={s.order} aria-hidden>{i + 1}</span>
            <span className={s.thumb} aria-hidden>
              {x.pdf ? <FirstPage pdf={x.pdf} /> : x.status === "locked" ? <Lock size={18} /> : <span className={s.thumbPdf}>PDF</span>}
            </span>
            <span className={s.main}>
              <span className={s.name}>{x.file.name}</span>
              <span className={s.meta}>
                {x.status === "ready" ? `${plural(x.pages ?? 0, "page")} · ${formatSize(x.file.size)}`
                  : x.status === "reading" ? "Reading…"
                  : x.status === "locked" ? "Password protected"
                  : "Not a valid PDF, or it's damaged"}
              </span>
              {x.status === "locked" && (
                <form className={s.unlock} onSubmit={(e) => { e.preventDefault(); unlock(x); }}>
                  <Field label={`Password for ${x.file.name}`} error={x.incorrect ? "That password didn't work. Try again." : undefined}>
                    <Input type="password" autoComplete="off" value={passwords[x.id] ?? ""} aria-invalid={x.incorrect || undefined}
                      onChange={(e) => setPasswords((p) => ({ ...p, [x.id]: e.target.value }))} />
                  </Field>
                  <Button type="submit" variant="secondary" size="sm" disabled={!passwords[x.id]}>Unlock</Button>
                </form>
              )}
            </span>
            <span className={s.badges}>
              {x.status === "ready" && x.signed && <Badge tone="warn">Signed</Badge>}
              {x.status === "locked" && <Badge tone="warn">Locked</Badge>}
              {x.status === "damaged" && <Badge tone="err">Can't open</Badge>}
            </span>
            <span className={s.actions}>
              <IconButton bare label={`Move ${x.file.name} up`} disabled={i === 0} onClick={() => moveBy(x.id, -1)}><ArrowUp /></IconButton>
              <IconButton bare label={`Move ${x.file.name} down`} disabled={i === sources.length - 1} onClick={() => moveBy(x.id, 1)}><ArrowDown /></IconButton>
              <IconButton bare label={`Remove ${x.file.name}`} onClick={() => remove(x.id)}><Trash2 /></IconButton>
            </span>
          </li>
        ))}
      </ol>

      <div className={s.footer}>
        <input ref={addInput} type="file" accept="application/pdf,.pdf" multiple hidden
          onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; if (f.length) void add(f); }} />
        <Button variant="secondary" icon={<FilePlus2 aria-hidden />} onClick={() => addInput.current?.click()}>Add PDFs</Button>
        <div className={s.nameField}>
          <Field label="Merged file name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        </div>
      </div>

      <p className={s.help}>Drag a file by its handle to change the order, or use the arrows. On a keyboard, Alt + Up or Down moves the focused file.</p>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
