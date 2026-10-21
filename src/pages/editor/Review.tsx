// Review & download: the finished PDF itself, a download panel, and a pages view to jump around. Nothing else.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircleCheckBig, Download, FileUp, PenLine, Share2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Button, ButtonLink, Checkbox, EmptyState, Field, Input, PageHeader, Toast } from "../../components/ui";
import { CoverBox, FieldBox, PrivacyNote, isFilled } from "../../components/pdf";
import { exportPdf, openPdf } from "../../pdf/engine";
import { unsupportedChars } from "../../pdf/text";
import { formatSize } from "../../pdf/format";
import { useDocument } from "../../state/document";
import { PageView } from "./PageView";
import s from "./review.module.css";

type Result = { name: string; bytes: Uint8Array; pages: number; incremental: boolean; removed: boolean; flattened: number[] };

const THUMB_W = 112;

export default function Review() {
  const { doc, fields, close } = useDocument();
  const navigate = useNavigate();
  // After a download or share: a clear finish, with what to do next.
  const [done, setDone] = useState<"downloaded" | "shared" | null>(null);
  const [name, setName] = useState(() => (doc ? doc.name.replace(/\.pdf$/i, "") + "-signed.pdf" : ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [current, setCurrent] = useState(1);
  // Removing edited-over text rewrites the file, which drops an existing digital signature, so it starts off for signed files.
  const [removeEdited, setRemoveEdited] = useState(() => !doc?.signed);
  const main = useRef<HTMLDivElement>(null);
  const [mainW, setMainW] = useState(0);

  // Pages fill the reading column (up to a comfortable width).
  useLayoutEffect(() => {
    const el = main.current;
    if (!el) return;
    setMainW(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setMainW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [doc]);

  // Highlight the page you're looking at in the pages view.
  useEffect(() => {
    const el = main.current;
    if (!el || !mainW) return;
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      const n = Number(top?.target.getAttribute("data-page"));
      if (n) setCurrent(n);
    }, { threshold: [0.25, 0.5, 0.75] });
    el.querySelectorAll("[data-page]").forEach((p) => io.observe(p));
    return () => io.disconnect();
  }, [mainW, doc]);

  const empty = fields.filter((f) => !f.cover && !isFilled(f)).length;
  const edits = fields.filter((f) => f.cover).length;
  const editedPages = [...new Set(fields.filter((f) => f.cover).map((f) => f.page))].sort((a, b) => a - b);
  const removing = edits > 0 && removeEdited;
  const pageList = (ns: number[]) => `page${ns.length === 1 ? "" : "s"} ${ns.join(", ")}`;
  const badText = useMemo(() => fields.flatMap((f) => {
    const bad = f.text ? unsupportedChars(f.text, f.style?.font) : [];
    return bad.length ? [{ f, bad }] : [];
  }), [fields]);

  if (!doc) {
    return (
      <>
        <PageHeader eyebrow="Sign" title="Review & download" />
        <EmptyState icon={<FileUp />} title="No document open" actions={<ButtonLink to="/editor" variant="primary">Open a PDF</ButtonLink>}>
          Open a PDF in Sign first. Documents aren't kept between visits.
        </EmptyState>
      </>
    );
  }

  const fileName = name.trim().toLowerCase().endsWith(".pdf") ? name.trim() : `${name.trim() || "document"}.pdf`;

  const build = async () => {
    setBusy(true); setError(null); setResult(null);
    try {
      const out = await exportPdf(doc.bytes, doc.pdf, fields, doc.password, { removeEdited: removing });
      // Re-open the new file to prove it's a valid PDF before handing it over.
      const check = await openPdf(out.bytes, doc.password);
      const n = check.doc.numPages;
      void check.doc.loadingTask.destroy();
      const r = { name: fileName, bytes: out.bytes, pages: n, incremental: out.incremental, removed: removing, flattened: out.flattened };
      setResult(r);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
      return null;
    } finally { setBusy(false); }
  };

  const download = async () => {
    const r = result?.name === fileName && result.removed === removing ? result : await build();
    if (!r) return;
    try {
      const url = URL.createObjectURL(new Blob([r.bytes as BlobPart], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = r.name; document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setToast(`Downloaded ${r.name}`);
      setDone("downloaded");
    } catch {
      setError("The PDF was made, but this browser wouldn't start the download. Try Share, or another browser.");
    }
  };

  const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.pdf", { type: "application/pdf" })] });
  const share = async () => {
    const r = result?.name === fileName && result.removed === removing ? result : await build();
    if (!r) return;
    try {
      await navigator.share({ files: [new File([r.bytes as BlobPart], r.name, { type: "application/pdf" })], title: r.name });
      setDone("shared");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("Sharing isn't available here. Download the file instead.");
    }
  };

  const maxW = Math.max(...doc.pages.map((p) => p.width));
  const pageScale = Math.max(200, Math.min(mainW - 48, 880)) / maxW;
  const thumbScale = THUMB_W / maxW;
  /** What prints on a page: covers over edited text, then the fields. */
  const layer = (page: number, h: number) => (
    <>
      {fields.filter((f) => f.page === page && f.cover).map((f) => <CoverBox key={`c${f.id}`} box={f.cover!} />)}
      {fields.filter((f) => f.page === page).map((f) => <FieldBox key={f.id} field={f} pageHeight={h} />)}
    </>
  );
  const jump = (n: number) => {
    setCurrent(n);
    main.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div className={s.review}>
      {/* The PDF as it will download: fields drawn without their editing outlines. */}
      <div ref={main} className={s.doc} aria-label="Signed document">
        {mainW > 0 && doc.pages.map((info, i) => (
          <div key={i} data-page={i + 1} className={s.pageSlot}>
            <PageView pdf={doc.pdf} n={i + 1} of={doc.pages.length} info={info} width={info.width * pageScale}>
              {(h) => layer(i + 1, h)}
            </PageView>
          </div>
        ))}
      </div>

      <aside className={s.side} aria-label="Download">
        <section className={s.panel} aria-labelledby="dl-h">
          <h2 id="dl-h" className={s.panelTitle}>Download</h2>
          <Field label="File name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {edits > 0 && (
            <div className={s.option}>
              <Checkbox label="Remove the original text under edits" checked={removeEdited} onChange={(e) => setRemoveEdited(e.target.checked)} />
              {removeEdited ? (
                <p className={s.note}>
                  The old words are taken out of the file. To do that, {pageList(editedPages)} {editedPages.length === 1 ? "is" : "are"} saved
                  as an image with hidden text you can still search and copy, so {editedPages.length === 1 ? "it loses" : "they lose"} sharp vector
                  text and the file gets bigger.
                  {doc.signed && " This also removes the existing digital signature, because the whole file is rewritten."}
                </p>
              ) : (
                <p className={s.note}>
                  Edited text is only covered over: the original words stay in the file underneath and can be copied out. Don't use this to hide information.
                </p>
              )}
            </div>
          )}
          <Button block variant="success" icon={<Download aria-hidden />} busy={busy} disabled={badText.length > 0} onClick={download}>Download PDF</Button>
          {canShare && <Button block variant="secondary" icon={<Share2 aria-hidden />} disabled={busy || badText.length > 0} onClick={share}>Share…</Button>}
          {badText.map(({ f, bad }) => (
            <p key={f.id} className={s.error} role="alert">
              Text on page {f.page} has characters the PDF can't show: {bad.map((c) => `"${c}"`).join(" ")}. Change it in Edit to download.
            </p>
          ))}
          {error && <p className={s.error} role="alert">{error}</p>}
          {result && (
            <p className={s.ok}>
              Saved {result.name} · {formatSize(result.bytes.length)} · {result.pages} page{result.pages === 1 ? "" : "s"}
              {result.flattened.length > 0 && ` · original text removed from ${pageList(result.flattened)}`}
            </p>
          )}
          {done && result && (
            <div className={s.done} role="status">
              <p className={s.doneTitle}><CircleCheckBig aria-hidden /> {done === "downloaded" ? "Done. Your copy is in Downloads." : "Done. Your copy was shared."}</p>
              <p className={s.note}>{result.name} is ready. The original file you opened hasn't changed.</p>
              <div className={s.doneActions}>
                <Button size="sm" icon={<FileUp aria-hidden />} onClick={() => { close(); navigate("/"); }}>Open another PDF</Button>
                <Button size="sm" variant="secondary" icon={<PenLine aria-hidden />} onClick={() => navigate("/editor")}>Back to this document</Button>
              </div>
            </div>
          )}
          {empty > 0 && <p className={s.note}>{empty} empty field{empty === 1 ? " is" : "s are"} left out.</p>}
          {doc.password && <p className={s.note}>The downloaded copy isn't password protected.</p>}
          <PrivacyNote />
        </section>

        <nav className={s.pages} aria-label="Pages">
          {doc.pages.map((info, i) => (
            <button key={i} type="button" className={s.thumb} aria-current={current === i + 1 ? "page" : undefined}
              aria-label={`Go to page ${i + 1}`} onClick={() => jump(i + 1)}>
              <PageView pdf={doc.pdf} n={i + 1} of={doc.pages.length} info={info} width={info.width * thumbScale} label={false}>
                {(h) => layer(i + 1, h)}
              </PageView>
              <span className={s.thumbNum}>{i + 1}</span>
            </button>
          ))}
        </nav>
      </aside>

      <Toast message={toast} onDone={() => setToast(null)} />
    </div>
  );
}
