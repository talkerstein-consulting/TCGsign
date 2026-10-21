import { useState } from "react";
import { Link } from "react-router";
import { Combine, FileSignature, LayoutGrid, SquarePen } from "lucide-react";
import { PageHeader, Toast } from "../components/ui";
import { DropZone } from "../components/pdf";
import { DRAFT_DAYS, useDrafts } from "../state/drafts";
import { DraftList, DraftsLoading, SortSelect, sortDrafts, useDraftSort } from "./DraftList";

/** How many recent drafts Home shows; the rest are on Saved drafts. */
const RECENT = 8;
import { useOpenFile } from "./useOpenFile";
import s from "./pages.module.css";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const QUICK = [
  { to: "/editor", icon: FileSignature, title: "Sign", text: "Place your signature and initials, then download the signed copy.", phase: 1 },
  { to: "/edit", icon: SquarePen, title: "Edit", text: "Change the text on the page, or add text, dates, checkboxes and images.", phase: 1 },
  { to: "/organize", icon: LayoutGrid, title: "Organize pages", text: "Rotate, reorder or delete pages.", phase: 1 },
  { to: "/merge", icon: Combine, title: "Merge PDFs", text: "Combine files into one PDF.", phase: 1 },
];

export default function Home() {
  const [toast, setToast] = useState<string | null>(null);
  const { drafts, remove } = useDrafts();
  const [sort, setSort] = useDraftSort();
  const { openFile, busy: opening, ui: openUi } = useOpenFile();

  return (
    <>
      <PageHeader banner="pages" eyebrow={greeting()} title="Sign and edit PDFs"
        description="Open a PDF to fill, sign or tidy it up. Everything happens in this browser, so documents never leave your device." />

      {/* As in Google Docs: start something new, then your recent files under it with a sort. Tools sit on the right. */}
      <div className={s.split}>
        <div className={s.col}>
          {openUi}
          <DropZone busy={opening} onFiles={(f) => openFile(f[0])} />

          <section className={s.section} aria-labelledby="recent-h">
            <div className={s.sectionHead}>
              <div><h2 id="recent-h">Recent documents</h2><p>Drafts you saved on this device. Each is kept for {DRAFT_DAYS} days after its last save.</p></div>
              {!!drafts?.length && (
                <div className={s.headTools}>
                  <SortSelect value={sort} onChange={setSort} />
                  {drafts.length > RECENT && <Link to="/drafts" className={s.more}>See all {drafts.length}</Link>}
                </div>
              )}
            </div>
            {drafts === null && <DraftsLoading rows={2} />}
            {drafts && drafts.length === 0 && <p className={s.muted}>Nothing yet. In Sign or Edit, choose Save draft and it shows up here.</p>}
            {!!drafts?.length && (
              <DraftList drafts={sortDrafts(drafts, sort)} limit={RECENT} onDelete={async (d) => { await remove(d.id); setToast(`${d.name} deleted from this device.`); }} />
            )}
          </section>
        </div>

        <aside className={s.aside} aria-label="Tools">
          <section className={s.section} aria-labelledby="tools-h">
            <div className={s.sectionHead}><h2 id="tools-h">Tools</h2></div>
            <div className={s.tools}>
              {QUICK.map(({ to, icon: Icon, title, text }) => (
                <Link key={to} to={to} className={s.tool}>
                  <span className={s.toolIcon}><Icon aria-hidden /></span><h3>{title}</h3><p>{text}</p>
                </Link>
              ))}
            </div>
            {/* Planned tools are named, not shown as cards you can't use. */}
            <p className={s.muted}>Coming later: Edit text (rewrite whole paragraphs) and Redact.</p>
          </section>
        </aside>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
