// One PDF page: a PDF.js canvas plus a layer for placed fields.
// Canvases only exist near the viewport; offscreen ones are emptied so long documents don't exhaust phone memory.
import { useEffect, useRef, useState, type ReactNode, type PointerEvent as RPointerEvent } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderPage, type PageInfo } from "../../pdf/engine";
import s from "./editor.module.css";

type Props = {
  pdf: PDFDocumentProxy;
  n: number;
  of: number;
  info: PageInfo;
  /** CSS pixel width to draw the page at. */
  width: number;
  placing?: boolean;
  /** Pointer down on empty page area, with the point as fractions of the page. */
  onPagePointer?: (n: number, fx: number, fy: number, e: RPointerEvent<HTMLDivElement>) => void;
  children?: (height: number) => ReactNode;
  label?: boolean;
  /** Called once the page is near the viewport. */
  onNear?: (n: number) => void;
};

export function PageView({ pdf, n, of, info, width, placing, onPagePointer, children, label = true, onNear }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [near, setNear] = useState(false);
  const [drawn, setDrawn] = useState(false);
  // A page that fails to draw says so and offers a retry, instead of "Loading…" forever.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const height = (width * info.height) / info.width;

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "1200px 0px" });
    io.observe(wrap.current!);
    return () => io.disconnect();
  }, []);

  useEffect(() => { if (near) onNear?.(n); }, [near, n, onNear]);

  useEffect(() => {
    const c = canvas.current!;
    if (!near) { c.width = 0; c.height = 0; setDrawn(false); return; }
    // Debounce so zooming doesn't queue a render per step.
    let cancel = () => {};
    const t = setTimeout(() => {
      setFailed(false);
      cancel = renderPage(pdf, n, c, width, () => { setDrawn(false); setFailed(true); });
      setDrawn(true);
    }, 80);
    return () => { clearTimeout(t); cancel(); };
  }, [near, pdf, n, width, attempt]);

  return (
    <div ref={wrap} className={s.page} data-placing={placing || undefined} style={{ width, height }}
      aria-label={`Page ${n} of ${of}`} role="group"
      onPointerDown={(e) => {
        if (e.target !== e.currentTarget && e.target !== canvas.current) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPagePointer?.(n, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, e);
      }}>
      <canvas ref={canvas} className={s.canvas} data-drawn={drawn} aria-hidden />
      {failed ? (
        <span className={s.loading} role="alert">
          <span>Page {n} couldn't be shown.{" "}
            <button type="button" className={s.retry} onClick={() => setAttempt((x) => x + 1)}>Try again</button>
          </span>
        </span>
      ) : !drawn && <span className={s.loading}>Loading page {n}…</span>}
      {children?.(height)}
      {label && <span className={s.pageNum}>{n} / {of}</span>}
    </div>
  );
}
