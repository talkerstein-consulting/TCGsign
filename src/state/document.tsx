// The open document, held in memory for this tab only. Nothing here is written to storage
// unless the person asks: saving a draft (src/state/drafts.ts) or keeping a signature (src/state/signatures.ts).
// Otherwise closing the tab or the document discards it.
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { Field, FieldImage, PageInfo } from "../pdf/engine";
import { deleteSign, loadSaved, saveSign, type SignKind } from "./signatures";
import { putDraft } from "./drafts";
import { clearAll } from "./idb";

/** Reopening a saved draft: its fields go back on the page, and saving again overwrites it. */
export type Restore = { draftId: string; fields: Field[]; savedAt: number };

export type OpenDoc = {
  name: string;
  size: number;
  /** The file as opened. Never modified; export writes to a copy. */
  bytes: Uint8Array;
  pdf: PDFDocumentProxy;
  pages: PageInfo[];
  signed: boolean;
  password?: string;
};

type History = { past: Field[][]; future: Field[][] };

type Ctx = {
  doc: OpenDoc | null;
  fields: Field[];
  /** Signature and initials reused for the next field. Stored only when kept (see `kept`). */
  signature: FieldImage | null;
  initials: FieldImage | null;
  /** When each kind was saved to this device, if it's kept. */
  kept: Partial<Record<SignKind, number>>;
  /** Keep (or stop keeping) the current signature or initials on this device. */
  setKept: (kind: SignKind, keep: boolean) => Promise<void>;
  canUndo: boolean;
  canRedo: boolean;
  open: (file: File, password?: string, restore?: Restore) => Promise<void>;
  /** The saved draft this document came from or was saved as, if any. */
  draft: { id: string; savedAt: number } | null;
  /** Fields changed since the draft was last saved (always true when there's no draft). */
  unsaved: boolean;
  /** Save the open document and its fields as a draft on this device, replacing its earlier save. */
  saveDraft: () => Promise<void>;
  /** Delete every draft and kept signature from this device, and forget this tab's signature and initials. */
  clearDevice: () => Promise<void>;
  /** Swap in a new version of the document (e.g. after organizing pages), with fields already moved to match. */
  replace: (bytes: Uint8Array, name: string, fields: Field[]) => Promise<void>;
  close: () => void;
  /** Change fields. `record: false` for live drags; call `checkpoint()` once before the drag starts. */
  setFields: (next: Field[] | ((f: Field[]) => Field[]), record?: boolean) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  setSignature: (img: FieldImage | null) => void;
  setInitials: (img: FieldImage | null) => void;
};

const DocContext = createContext<Ctx | null>(null);
const EMPTY: History = { past: [], future: [] };

export function DocumentProvider({ children }: { children: ReactNode }) {
  const [doc, setDoc] = useState<OpenDoc | null>(null);
  const [fields, setFieldsState] = useState<Field[]>([]);
  const [history, setHistory] = useState<History>(EMPTY);
  const [signature, setSignatureState] = useState<FieldImage | null>(null);
  const [initials, setInitialsState] = useState<FieldImage | null>(null);
  const [kept, setKeptState] = useState<Partial<Record<SignKind, number>>>({});
  const keptRef = useRef(kept);
  useLayoutEffect(() => { keptRef.current = kept; }, [kept]);

  // Saved items load once; one made earlier this session wins over the saved copy.
  useEffect(() => {
    void loadSaved().then((items) => {
      for (const it of items) (it.kind === "signature" ? setSignatureState : setInitialsState)((cur) => cur ?? it.img);
      setKeptState(Object.fromEntries(items.map((it) => [it.kind, it.savedAt])));
    });
  }, []);

  // Replacing a kept item updates the saved copy; clearing it deletes the copy.
  const store = useCallback(async (kind: SignKind, img: FieldImage | null) => {
    if (img) { const savedAt = Date.now(); await saveSign({ kind, img, savedAt }); setKeptState((k) => ({ ...k, [kind]: savedAt })); }
    else { await deleteSign(kind); setKeptState((k) => { const next = { ...k }; delete next[kind]; return next; }); }
  }, []);
  const setSignature = useCallback((img: FieldImage | null) => {
    setSignatureState(img);
    if (keptRef.current.signature) void store("signature", img).catch(() => {});
  }, [store]);
  const setInitials = useCallback((img: FieldImage | null) => {
    setInitialsState(img);
    if (keptRef.current.initials) void store("initials", img).catch(() => {});
  }, [store]);
  const latestSign = useRef({ signature, initials });
  useLayoutEffect(() => { latestSign.current = { signature, initials }; }, [signature, initials]);
  const setKept = useCallback(async (kind: SignKind, keep: boolean) => {
    await store(kind, keep ? latestSign.current[kind] : null);
  }, [store]);

  // Latest values for event handlers, so undo/redo never run side effects inside state updaters.
  const latest = useRef({ fields, history });
  useLayoutEffect(() => { latest.current = { fields, history }; }, [fields, history]);

  // The draft this document is saved as, and the fields as they were at that save.
  const [draft, setDraft] = useState<{ id: string; savedAt: number; fields: Field[] } | null>(null);
  const docRef = useRef(doc);
  useLayoutEffect(() => { docRef.current = doc; }, [doc]);

  const open = useCallback(async (file: File, password?: string, restore?: Restore) => {
    const bytes = new Uint8Array(await file.arrayBuffer());
    // Loaded on first open, so Home stays small.
    const { openPdf } = await import("../pdf/engine");
    const { doc: pdf, pages, signed } = await openPdf(bytes, password);
    setDoc((old) => { void old?.pdf.loadingTask.destroy(); return { name: file.name, size: file.size, bytes, pdf, pages, signed, password }; });
    const next = restore?.fields ?? [];
    latest.current = { fields: next, history: EMPTY };
    setFieldsState(next); setHistory(EMPTY);
    setDraft(restore ? { id: restore.draftId, savedAt: restore.savedAt, fields: next } : null);
  }, []);

  // A replaced document keeps its draft, so saving again updates the same one.
  const replace = useCallback(async (bytes: Uint8Array, name: string, next: Field[]) => {
    const { openPdf } = await import("../pdf/engine");
    const { doc: pdf, pages, signed } = await openPdf(bytes);
    setDoc((old) => { void old?.pdf.loadingTask.destroy(); return { name, size: bytes.length, bytes, pdf, pages, signed }; });
    latest.current = { fields: next, history: EMPTY };
    setFieldsState(next); setHistory(EMPTY);
    setDraft((d) => d && { ...d, fields: [] });
  }, []);

  const close = useCallback(() => {
    setDoc((old) => { void old?.pdf.loadingTask.destroy(); return null; });
    setFieldsState([]); setHistory(EMPTY); setDraft(null);
  }, []);

  const saveDraft = useCallback(async () => {
    const d = docRef.current;
    if (!d) return;
    const f = latest.current.fields;
    const id = draft?.id ?? crypto.randomUUID();
    const savedAt = Date.now();
    await putDraft({ id, name: d.name, size: d.bytes.length, pages: d.pages.length, signed: d.signed, locked: !!d.password, bytes: d.bytes, fields: f, savedAt });
    setDraft({ id, savedAt, fields: f });
  }, [draft]);
  const unsaved = !draft || draft.fields !== fields;

  // The open document stays open, but it's no longer saved as a draft.
  const clearDevice = useCallback(async () => {
    await clearAll();
    setKeptState({}); setSignatureState(null); setInitialsState(null); setDraft(null);
  }, []);

  const checkpoint = useCallback(() => {
    const { fields: f, history: h } = latest.current;
    const next = { past: [...h.past.slice(-99), f], future: [] };
    latest.current = { ...latest.current, history: next };
    setHistory(next);
  }, []);

  const setFields = useCallback((next: Field[] | ((f: Field[]) => Field[]), record = true) => {
    if (record) checkpoint();
    const value = typeof next === "function" ? next(latest.current.fields) : next;
    latest.current = { ...latest.current, fields: value };
    setFieldsState(value);
  }, [checkpoint]);

  const step = useCallback((dir: "undo" | "redo") => {
    const { fields: f, history: h } = latest.current;
    const from = dir === "undo" ? h.past : h.future;
    if (!from.length) return;
    const target = dir === "undo" ? from[from.length - 1] : from[0];
    const next = dir === "undo"
      ? { past: h.past.slice(0, -1), future: [f, ...h.future] }
      : { past: [...h.past, f], future: h.future.slice(1) };
    latest.current = { fields: target, history: next };
    setHistory(next); setFieldsState(target);
  }, []);
  const undo = useCallback(() => step("undo"), [step]);
  const redo = useCallback(() => step("redo"), [step]);

  const value = useMemo<Ctx>(() => ({
    doc, fields, signature, initials, kept, setKept, canUndo: history.past.length > 0, canRedo: history.future.length > 0,
    open, replace, close, setFields, checkpoint, undo, redo, setSignature, setInitials,
    draft: draft && { id: draft.id, savedAt: draft.savedAt }, unsaved, saveDraft, clearDevice,
  }), [clearDevice,doc, fields, signature, initials, kept, setKept, history, open, replace, close, setFields, checkpoint, undo, redo, setSignature, setInitials, draft, unsaved, saveDraft]);

  return <DocContext.Provider value={value}>{children}</DocContext.Provider>;
}

export function useDocument() {
  const ctx = useContext(DocContext);
  if (!ctx) throw new Error("useDocument must be used inside DocumentProvider");
  return ctx;
}
