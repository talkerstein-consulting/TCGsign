// The text already on each page, for Edit: read from the PDF's text layer, or by OCR when a page
// has none (a scan). Pages are read one at a time as they come into view; results are kept in
// memory per open document, so switching between Sign and Edit doesn't read them again.
import { useCallback, useEffect, useReducer } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import { findText } from "../../pdf/engine";
import type { TextLine } from "../../pdf/text";

export type PageText = {
  state: "reading" | "ocr" | "done" | "error";
  /** OCR progress, 0–1. */
  progress?: number;
  lines: TextLine[];
  ocr?: boolean;
};

type Store = { pages: Map<number, PageText>; queue: number[]; running: boolean; listeners: Set<() => void> };
const stores = new WeakMap<PDFDocumentProxy, Store>();

function storeFor(pdf: PDFDocumentProxy) {
  let st = stores.get(pdf);
  if (!st) { st = { pages: new Map(), queue: [], running: false, listeners: new Set() }; stores.set(pdf, st); }
  return st;
}

async function pump(pdf: PDFDocumentProxy, st: Store) {
  if (st.running) return;
  st.running = true;
  const changed = () => st.listeners.forEach((l) => l());
  while (st.queue.length) {
    const n = st.queue.shift()!;
    const entry = st.pages.get(n)!;
    try {
      entry.lines = await findText(pdf, n);
      if (!entry.lines.length) {
        // No text layer: a scanned page. OCR is loaded the first time one turns up.
        entry.state = "ocr"; entry.ocr = true; entry.progress = 0; changed();
        const { ocrPage } = await import("../../pdf/ocr");
        entry.lines = await ocrPage(pdf, n, (p) => { entry.progress = p; changed(); });
      }
      entry.state = "done";
    } catch (e) {
      console.error(`Couldn't read the text on page ${n}`, e);
      entry.state = "error";
    }
    changed();
  }
  st.running = false;
}

export function usePageText(pdf: PDFDocumentProxy | undefined) {
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const st = pdf ? storeFor(pdf) : null;
  useEffect(() => {
    if (!st) return;
    st.listeners.add(rerender);
    return () => { st.listeners.delete(rerender); };
  }, [st]);

  const request = useCallback((n: number) => {
    if (!pdf || !st || st.pages.has(n)) return;
    st.pages.set(n, { state: "reading", lines: [] });
    st.queue.push(n);
    rerender();
    void pump(pdf, st);
  }, [pdf, st]);

  return { pages: st?.pages ?? new Map<number, PageText>(), request };
}
