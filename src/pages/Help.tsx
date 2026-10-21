import { useState } from "react";
import { Link } from "react-router";
import { InlineError, PageHeader, Tabs } from "../components/ui";
import { DRAFT_DAYS } from "../state/drafts";
import s from "./help.module.css";

const TABS = [
  { value: "browsers", label: "Browsers" },
  { value: "files", label: "Files & limits" },
  { value: "cant", label: "What it can't do" },
];

function Browsers() {
  return (
    <>
      <dl className={s.facts}>
        <div><dt>Chrome and Edge</dt><dd>Current versions, on computers and Android.</dd></div>
        <div><dt>Firefox</dt><dd>Current versions.</dd></div>
        <div><dt>Safari</dt><dd>Safari 18 or later, on Mac, iPhone and iPad.</dd></div>
      </dl>
      <h3>Private windows</h3>
      <p>Signing and editing work, but the browser may block saving. Then drafts and kept signatures can't be saved, and the screens say so. Download your file before you close the window.</p>
      <h3>Safari and saved items</h3>
      <p>Safari deletes a site's saved data after 7 days without a visit, unless the app is on your Home Screen. That includes drafts and kept signatures.</p>
    </>
  );
}

function Files() {
  return (
    <>
      <dl className={s.facts}>
        <div><dt>File type</dt><dd>PDF only. To sign an image, save it as a PDF first.</dd></div>
        <div><dt>Size and pages</dt><dd>There's no fixed limit. Everything runs on your device, so very large files (hundreds of pages, or scans of many MB) can be slow, especially on phones. If a file struggles, split it in Organize pages first.</dd></div>
        <div><dt>Password-protected PDFs</dt><dd>They open with their password. The downloaded copy isn't password protected. Drafts keep the file encrypted and ask for the password again.</dd></div>
        <div><dt>Already-signed PDFs</dt><dd>Your changes are added as a new revision, so the signed version stays intact. Viewers will show that the file changed after signing.</dd></div>
        <div><dt>Scanned pages</dt><dd>In Edit, scanned pages are read with text recognition on your device. It can misread small or faint text, so check it.</dd></div>
        <div><dt>Drafts</dt><dd>Kept on this device only, for {DRAFT_DAYS} days after your last save. See <Link to="/settings">Privacy & storage</Link>.</dd></div>
      </dl>
      <h3>Messages you might see</h3>
      <div className={s.examples}>
        <InlineError title="Couldn't open report.pdf">It isn't a valid PDF, or it's damaged. Try exporting it again from the app that made it.</InlineError>
        <InlineError title={`Text on page 2 has characters the PDF can't show: "😀". Change it in Edit to download.`}>Added text uses Helvetica, which covers Western European letters only. Replace emoji or other scripts, and Download unlocks.</InlineError>
      </div>
    </>
  );
}

function Cant() {
  return (
    <ul className={s.cant}>
      <li><strong>Certificate-based digital signatures.</strong> Your signature is placed as an image, like signing on paper. It isn't a cryptographic signature with a certificate.</li>
      <li><strong>Rewrite paragraphs in place.</strong> Edit covers the original words and draws your text on top. Text doesn't reflow. Choosing to remove the original text under an edit turns those pages into images at 200 dpi, so their text can no longer be selected or searched. True in-place editing is planned for Phase 2.</li>
      <li><strong>Redact.</strong> Covering text isn't redaction. Permanent redaction is planned for Phase 2.</li>
      <li><strong>Send for signature.</strong> Remote signing with other people is planned for Phase 3.</li>
      <li><strong>Keep bookmarks and form fields through Organize or Merge.</strong> Pages are copied into a new file, so bookmarks, the interactive form-field tree and digital signatures don't carry over.</li>
      <li><strong>Fonts other than Helvetica.</strong> Added text uses Helvetica, so characters outside Western European letters are blocked when you download.</li>
      <li><strong>Sync between devices.</strong> There's no account or server. Drafts and signatures live in this browser only.</li>
    </ul>
  );
}

export default function Help() {
  const [tab, setTab] = useState("browsers");
  return (
    <>
      <PageHeader banner="buoy" eyebrow="Help" title="Help & limits"
        description="Which browsers work, how big a file can be, and what TCG Sign doesn't do yet." />
      <div className={s.wrap}>
        <Tabs label="Help topics" items={TABS} value={tab} onChange={setTab} />
        <section className={s.panel} aria-label={TABS.find((t) => t.value === tab)?.label}>
          {tab === "browsers" ? <Browsers /> : tab === "files" ? <Files /> : <Cant />}
        </section>
      </div>
    </>
  );
}
