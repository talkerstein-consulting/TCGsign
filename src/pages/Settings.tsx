import { useState } from "react";
import { Link } from "react-router";
import { FileClock, PenLine, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Checkbox, Modal, PageHeader, Toast } from "../components/ui";
import { PrivacyNote, StorageMeter } from "../components/pdf";
import { useDocument } from "../state/document";
import { DRAFT_DAYS, useDrafts, useQuota } from "../state/drafts";
import s from "./settings.module.css";
import p from "./pages.module.css";

export default function Settings() {
  const { kept, clearDevice } = useDocument();
  const { drafts, error, refresh } = useDrafts();
  const quota = useQuota(drafts);
  const [confirm, setConfirm] = useState(false);
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const n = drafts?.length ?? 0;
  const draftMb = (drafts ?? []).reduce((t, d) => t + d.size, 0) / 1_048_576;
  const keptCount = Object.keys(kept).length;
  const nothing = n === 0 && keptCount === 0;

  const clear = async () => {
    setBusy(true); setFailed(false);
    try { await clearDevice(); refresh(); setToast("Everything was cleared from this device."); }
    catch { setFailed(true); }
    finally { setBusy(false); setConfirm(false); setSure(false); }
  };

  return (
    <>
      <PageHeader banner="vault" eyebrow="Help" title="Privacy & storage"
        description="TCG Sign has no server. Your PDFs are opened and changed in this browser and never uploaded. This screen shows what the browser keeps, and lets you clear it." />

      {error && <Alert tone="warn" title="This browser won't keep anything">Private windows and some privacy settings block saving, so nothing is kept after you close the tab.</Alert>}
      {failed && <Alert tone="err" title="Couldn't clear this device">Try again. If it keeps failing, clear this site's data in your browser settings.</Alert>}

      <div className={p.split}>
        <div className={p.col}>
          <section className={p.section} aria-labelledby="kept-h">
            <div className={p.sectionHead}><h2 id="kept-h">What this device keeps</h2></div>
            <ul className={s.list}>
              <li className={s.row}>
                <span className={s.icon}><FileClock aria-hidden /></span>
                <span className={s.main}><strong>Saved drafts</strong><span>Only documents you chose to save, with their fields. Each is deleted {DRAFT_DAYS} days after its last save.</span></span>
                <Link to="/drafts" className={s.value}>{n} draft{n === 1 ? "" : "s"}{n ? ` · ${draftMb < 0.1 ? "under 0.1" : draftMb.toFixed(1)} MB` : ""}</Link>
              </li>
              <li className={s.row}>
                <span className={s.icon}><PenLine aria-hidden /></span>
                <span className={s.main}><strong>Signature and initials</strong><span>Only if you turned on Keep on this device in My signatures.</span></span>
                <Link to="/signatures" className={s.value}>{keptCount ? [kept.signature && "Signature", kept.initials && "Initials"].filter(Boolean).join(" and ") : "None kept"}</Link>
              </li>
            </ul>
          </section>

          <section className={p.section} aria-labelledby="never-h">
            <div className={p.sectionHead}><h2 id="never-h">What's never kept</h2></div>
            <ul className={s.bullets}>
              <li>The document you have open, unless you save it as a draft. Closing the tab discards it.</li>
              <li>Passwords for protected PDFs. A saved draft stays encrypted and asks for the password again.</li>
              <li>Downloaded copies. Once a file is in your Downloads it's yours to manage, and clearing here doesn't touch it.</li>
            </ul>
            <PrivacyNote block />
          </section>
        </div>

        <aside className={p.aside} aria-label="Storage">
          <StorageMeter usedMb={Math.max(draftMb, quota?.usedMb ?? 0)} drafts={n} quotaMb={quota?.quotaMb} />
          <section className={s.danger} aria-labelledby="clear-h">
            <h2 id="clear-h">Clear everything</h2>
            <p>Deletes every saved draft and kept signature from this browser. The document you have open stays open, but it's no longer saved.</p>
            <Button variant="danger" icon={<Trash2 aria-hidden />} disabled={nothing} onClick={() => setConfirm(true)}>Clear this device</Button>
            {nothing && <Badge tone="neutral" shape="label">Nothing is kept</Badge>}
          </section>
        </aside>
      </div>

      <Modal open={confirm} onClose={() => { setConfirm(false); setSure(false); }} size="sm" title="Clear this device?"
        description={`${n} draft${n === 1 ? "" : "s"}${keptCount ? `, plus your kept ${[kept.signature && "signature", kept.initials && "initials"].filter(Boolean).join(" and ")}` : ""}`}
        footer={<>
          <Button variant="quiet" onClick={() => { setConfirm(false); setSure(false); }}>Cancel</Button>
          <Button variant="danger" busy={busy} disabled={!sure} onClick={clear}>Clear everything</Button>
        </>}>
        <div className={s.confirm}>
          <p>This can't be undone. Download anything you still need first.</p>
          <Checkbox label="I understand my drafts and signatures will be deleted" checked={sure} onChange={(e) => setSure(e.target.checked)} />
        </div>
      </Modal>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
