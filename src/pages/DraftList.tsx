// Saved drafts as document rows, with open, download and delete. Used on Home and Saved drafts.
import { useState } from "react";
import { ArrowDownUp, Download, FilePen, Trash2 } from "lucide-react";
import { ActionMenu, Button, InlineError, Modal, Skeleton } from "../components/ui";
import { DocumentList, DocumentRow, type DraftDoc } from "../components/pdf";
import { daysLeft, type Draft } from "../state/drafts";
import { useOpenFile } from "./useOpenFile";
import st from "./pages.module.css";

const when = (t: number) => {
  const d = new Date(t);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `today, ${time}` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** Sort orders for the draft list, as in the Docs recent-files menu. */
export const SORTS = [
  { value: "saved", label: "Last saved" },
  { value: "name", label: "Title A–Z" },
  { value: "expiring", label: "Deleted soonest" },
  { value: "size", label: "Largest first" },
] as const;
export type Sort = (typeof SORTS)[number]["value"];

export function sortDrafts(drafts: Draft[], by: Sort) {
  const list = [...drafts];
  if (by === "name") list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
  else if (by === "expiring") list.sort((a, b) => a.savedAt - b.savedAt);
  else if (by === "size") list.sort((a, b) => b.size - a.size);
  else list.sort((a, b) => b.savedAt - a.savedAt);
  return list;
}

const SORT_KEY = "tcg-draft-sort";
/** The chosen sort, remembered in this browser when storage allows. */
export function useDraftSort() {
  const [by, setBy] = useState<Sort>(() => {
    try { const v = localStorage.getItem(SORT_KEY); if (SORTS.some((s) => s.value === v)) return v as Sort; } catch { /* not remembered */ }
    return "saved";
  });
  const set = (v: Sort) => { setBy(v); try { localStorage.setItem(SORT_KEY, v); } catch { /* fine */ } };
  return [by, set] as const;
}

/** The sort control: an icon and a select, like Docs' sort menu over recent files. */
export function SortSelect({ value, onChange }: { value: Sort; onChange: (v: Sort) => void }) {
  return (
    <label className={st.sort}>
      <ArrowDownUp aria-hidden />
      <span className={st.sortLabel}>Sort</span>
      <select value={value} onChange={(e) => onChange(e.target.value as Sort)} aria-label="Sort drafts">
        {SORTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** Placeholder rows while drafts load from this device, so the list doesn't pop in. */
export function DraftsLoading({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading drafts" className={st.loadingRows}>
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} height={64} />)}
    </div>
  );
}

const toRow = (d: Draft): DraftDoc => ({
  id: d.id, name: d.name, pages: d.pages, sizeMb: d.size / 1_048_576, savedAt: when(d.savedAt), expiresInDays: daysLeft(d),
});

export function DraftList({ drafts, onDelete, limit }: { drafts: Draft[]; onDelete: (d: Draft) => Promise<void>; limit?: number }) {
  const { openDraft, ui } = useOpenFile();
  const [confirm, setConfirm] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  return (
    <>
      {ui}
      {failed && <InlineError title="Couldn't delete the draft">{failed}</InlineError>}
      <DocumentList>
        {drafts.slice(0, limit).map((d) => (
          <DocumentRow key={d.id} doc={toRow(d)} onOpen={() => openDraft(d)}
            actions={<ActionMenu label={`Actions for ${d.name}`} items={[
              { label: "Open", icon: <FilePen aria-hidden />, onSelect: () => openDraft(d) },
              { label: "Review & download", icon: <Download aria-hidden />, onSelect: () => openDraft(d, "/editor/review") },
              { label: "Delete from this device", icon: <Trash2 aria-hidden />, tone: "danger", onSelect: () => setConfirm(d) },
            ]} />} />
        ))}
      </DocumentList>
      <Modal open={!!confirm} onClose={() => setConfirm(null)} size="sm" title="Delete this draft?" description={confirm?.name}
        footer={<>
          <Button variant="quiet" onClick={() => setConfirm(null)}>Keep it</Button>
          <Button variant="danger" busy={busy} onClick={async () => {
            if (!confirm) return;
            setBusy(true);
            try { await onDelete(confirm); setFailed(null); }
            catch { setFailed(`${confirm.name} couldn't be deleted. This browser may be blocking storage; try again, or clear everything from Privacy & storage.`); }
            finally { setBusy(false); setConfirm(null); }
          }}>Delete draft</Button>
        </>}>
        <p>The draft and its placed fields are removed from this device. The original file isn't affected.</p>
      </Modal>
    </>
  );
}
