// Drafts the person chose to save: the file as opened plus the fields placed on it, in IndexedDB.
// A draft is deleted 7 days after it was last saved. Password-protected files are stored still
// encrypted, and the password is never stored, so opening one asks for it again.
import { useCallback, useEffect, useState } from "react";
import type { Field } from "../pdf/engine";
import { run } from "./idb";

export const DRAFT_DAYS = 7;
const DAY = 86_400_000;

export type Draft = {
  id: string; name: string; size: number; pages: number; signed: boolean; locked: boolean;
  bytes: Uint8Array; fields: Field[]; savedAt: number;
};

export const expiresAt = (d: Pick<Draft, "savedAt">) => d.savedAt + DRAFT_DAYS * DAY;
/** Days left, rounded up: a fresh save shows the full 7, and 1 means it goes within a day. */
export const daysLeft = (d: Pick<Draft, "savedAt">, now = Date.now()) => Math.max(0, Math.ceil((expiresAt(d) - now) / DAY));

/** Live drafts, newest first. Expired ones are deleted as they're found. */
export async function listDrafts(): Promise<Draft[]> {
  const all = await run<Draft[]>("drafts", "readonly", (s) => s.getAll());
  const now = Date.now();
  const expired = all.filter((d) => expiresAt(d) <= now);
  await Promise.all(expired.map((d) => deleteDraft(d.id)));
  return all.filter((d) => expiresAt(d) > now).sort((a, b) => b.savedAt - a.savedAt);
}

export const getDraft = (id: string) => run<Draft | undefined>("drafts", "readonly", (s) => s.get(id));
export const putDraft = (d: Draft) => run("drafts", "readwrite", (s) => s.put(d));
export const deleteDraft = (id: string) => run("drafts", "readwrite", (s) => s.delete(id));

/** What this site uses and may use, from the browser's own estimate. Re-reads when `deps` changes. */
export function useQuota(deps: unknown) {
  const [q, setQ] = useState<{ usedMb: number; quotaMb?: number } | null>(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setQ({ usedMb: (e.usage ?? 0) / 1_048_576, quotaMb: e.quota ? Math.round(e.quota / 1_048_576) : undefined }), () => {});
  }, [deps]);
  return q;
}

/** The draft list for a screen. `error` is set when this browser blocks storage. */
export function useDrafts() {
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [error, setError] = useState(false);
  const refresh = useCallback(() => {
    listDrafts().then((d) => { setDrafts(d); setError(false); }, () => { setDrafts([]); setError(true); });
  }, []);
  useEffect(refresh, [refresh]);
  const remove = useCallback(async (id: string) => { await deleteDraft(id); refresh(); }, [refresh]);
  return { drafts, error, refresh, remove };
}
