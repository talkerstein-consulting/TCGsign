import { useState } from "react";
import { FileClock, FileUp } from "lucide-react";
import { Alert, ButtonLink, EmptyState, PageHeader, Toast } from "../components/ui";
import { StorageMeter } from "../components/pdf";
import { DRAFT_DAYS, useDrafts, useQuota } from "../state/drafts";
import { DraftList, DraftsLoading, SortSelect, sortDrafts, useDraftSort } from "./DraftList";
import s from "./pages.module.css";

export default function Drafts() {
  const { drafts, error, remove } = useDrafts();
  const [toast, setToast] = useState<string | null>(null);
  const [sort, setSort] = useDraftSort();
  const quota = useQuota(drafts);
  const draftMb = (drafts ?? []).reduce((n, d) => n + d.size, 0) / 1_048_576;

  return (
    <>
      <PageHeader banner="stack" eyebrow="On this device" title="Saved drafts"
        description={`Documents you chose to save in Sign or Edit, with their placed fields. Each one is deleted ${DRAFT_DAYS} days after you last save it.`} />

      {error && <Alert tone="warn" title="This browser won't keep drafts">Private windows and some privacy settings block saving. Download your document from Review instead.</Alert>}

      <div className={s.split}>
        <section className={s.section} aria-label="Drafts">
          {drafts === null ? <DraftsLoading /> : drafts.length === 0 ? (
            <EmptyState icon={<FileClock />} title="No saved drafts"
              actions={<ButtonLink to="/" variant="primary" icon={<FileUp aria-hidden />}>Open a PDF</ButtonLink>}>
              In Sign or Edit, choose Save draft to keep your progress on this device.
            </EmptyState>
          ) : (
            <>
              <div className={s.sectionHead}>
                <h2>{drafts.length} draft{drafts.length === 1 ? "" : "s"}</h2>
                <SortSelect value={sort} onChange={setSort} />
              </div>
              <DraftList drafts={sortDrafts(drafts, sort)} onDelete={async (d) => { await remove(d.id); setToast(`${d.name} deleted from this device.`); }} />
            </>
          )}
        </section>
        <aside className={s.aside} aria-label="Storage">
          <StorageMeter usedMb={Math.max(draftMb, quota?.usedMb ?? 0)} drafts={drafts?.length ?? 0} quotaMb={quota?.quotaMb} />
        </aside>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
