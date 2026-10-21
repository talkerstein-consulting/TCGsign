import { useEffect, useState, type ReactNode } from "react";
import { Download, FileUp, Link2, Pencil, Plus, Send, Share2, Trash2 } from "lucide-react";
import {
  ActionMenu, Alert, Avatar, Badge, Button, ButtonLink, Card, Checkbox, Chip, Count, EmptyState, Field, IconButton,
  InlineError, Input, Modal, PageHeader, ProgressBar, Segmented, Select, Skeleton, Stat, StatGrid, Switch, Tabs,
  Textarea, Toast, Tooltip,
} from "../components/ui";
import {
  BottomSheet, DocumentList, DocumentRow, DropZone, EditorToolbar, PageCanvas, PageLines, PageThumb, PhaseChip,
  FieldBox, PrivacyNote, SheetTools, SignatureCard, SignatureCreator, StatusChip, StorageMeter, ThumbGrid,
  type ToolId,
} from "../components/pdf";
import type { Field as PdfField } from "../pdf/engine";
import { typedSignature } from "../pdf/signature";
import { EXAMPLE_DRAFTS } from "./examples";
import s from "./style.module.css";

const GROUPS = [
  ["foundations", "Foundations"], ["actions", "Actions"], ["inputs", "Inputs"], ["navigation", "Navigation"],
  ["feedback", "Feedback"], ["display", "Display"], ["overlays", "Overlays"], ["pdf", "PDF tools"],
] as const;

function Group({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className={s.group} aria-labelledby={`${id}-h`}>
      <div className={s.groupHead}><h2 id={`${id}-h`}>{title}</h2><p>{intro}</p></div>
      {children}
    </section>
  );
}
function Spec({ name, code, note, variant, children }: { name: string; code?: string; note?: string; variant?: "stack" | "desk"; children: ReactNode }) {
  return (
    <div className={s.spec}>
      <div className={s.specHead}><h3>{name}</h3>{code && <code>{code}</code>}</div>
      {note && <p className={s.specNote}>{note}</p>}
      <div className={`${s.demo} ${variant ? s[variant] : ""}`}>{children}</div>
    </div>
  );
}

const COLORS: [string, string, string][] = [
  ["Steel", "--steel", "#19254A · text, top bar, selected"],
  ["Orange", "--orange", "#B3530E · primary action, focus"],
  ["Sea", "--sea", "#F3F7F3 · brand light"],
  ["Background", "--bg", "#F9F8F5 · page"],
  ["Surface", "--surface", "#FFFFFF · cards, inputs"],
  ["Paper", "--paper", "#FCFCFA · panels, footers"],
  ["Border", "--border", "Steel 15%"],
  ["Muted text", "--text-muted", "Steel 70%"],
  ["OK", "--ok", "#2F6B4F · done, signed"],
  ["Danger", "--danger", "#A3321A · delete, errors"],
  ["Desk", "--desk", "#E7E8E3 · behind PDF pages"],
  ["Ink", "--ink", "#1B2E7A · signatures & placed fields"],
];

// Fractions of the page, as the editor stores them.
const FIELDS: PdfField[] = [
  { id: "a", kind: "signature", page: 1, x: .10, y: .70, w: .42, h: .07 },
  { id: "b", kind: "date", page: 1, x: .60, y: .73, w: .26, h: .035, text: "Oct 21, 2026" },
  { id: "c", kind: "initials", page: 1, x: .74, y: .88, w: .14, h: .055 },
  { id: "d", kind: "check", page: 1, x: .10, y: .545, w: .03, h: .023, checked: true },
  { id: "e", kind: "text", page: 1, x: .15, y: .54, w: .5, h: .032, text: "I agree to the terms above" },
];

export default function StylePage() {
  const [tab, setTab] = useState("view");
  const [seg, setSeg] = useState("draw");
  const [modal, setModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolId>("signature");
  const [zoom, setZoom] = useState(1);
  const [sel, setSel] = useState("a");
  const [fields, setFields] = useState(FIELDS);
  useEffect(() => {
    // Demo only: without the signature font the sample field just stays empty.
    typedSignature("Rishon Talkar").then((image) => image && setFields((f) => f.map((x) => (x.id === "a" ? { ...x, image } : x))), () => {});
  }, []);
  const [thumbSel, setThumbSel] = useState(2);
  const [rot, setRot] = useState<Record<number, number>>({ 3: 90 });

  return (
    <>
      <PageHeader eyebrow="Internal" title="Style page"
        description="Every token and component in TCG Sign. They're ported from the TCG client portal, so the two apps look and behave the same. Build new screens from these." />

      <div className={s.layout}>
        <nav className={s.index} aria-label="Style page sections">
          <p>On this page</p>
          {GROUPS.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <div className={s.body}>
          <Group id="foundations" title="Foundations" intro="Three brand colours (Steel, Orange, Sea) plus tints of them. Headings are Cheltenham Bold Condensed, body is Jost. Every gap sits on a 4px grid, and controls are at least 44px tall for touch.">
            <Spec name="Colour" code="src/styles/tokens.css">
              <div className={s.swatches}>
                {COLORS.map(([n, v, d]) => (
                  <div key={v} className={s.swatch}><i className={s.chipColor} style={{ background: `var(${v})` }} /><b>{n}</b><span>{v}</span><span>{d}</span></div>
                ))}
              </div>
            </Spec>
            <Spec name="Type" note="Orange is never used for text on light backgrounds; it fails contrast. Signatures use Slowly Signature in Ink." variant="stack">
              <div className={s.typeRow}><span>h1 · 34 Cheltenham</span><span style={{ font: "700 var(--fs-h1)/1.2 var(--font-heading)" }}>Sign and edit PDFs</span></div>
              <div className={s.typeRow}><span>h2 · 26 Cheltenham</span><span style={{ font: "700 var(--fs-h2)/1.2 var(--font-heading)" }}>Saved drafts</span></div>
              <div className={s.typeRow}><span>h3 · 20 Cheltenham</span><span style={{ font: "700 var(--fs-h3)/1.2 var(--font-heading)" }}>On this device</span></div>
              <div className={s.typeRow}><span>kpi · 36 Cheltenham</span><span style={{ font: "700 var(--fs-kpi)/1.1 var(--font-heading)" }}>12 pages</span></div>
              <div className={s.typeRow}><span>body · 15 Jost</span><span>Everything happens in this browser, so documents never leave your device.</span></div>
              <div className={s.typeRow}><span>sm · 13 Jost muted</span><span style={{ fontSize: "var(--fs-sm)", color: "var(--text-muted)" }}>6 pages · 1.4 MB · Saved today</span></div>
              <div className={s.typeRow}><span>eyebrow · 12 caps</span><span style={{ font: "600 12px/1 var(--font-body)", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--text-muted)" }}>Good morning</span></div>
              <div className={s.typeRow}><span>signature · Slowly</span><span style={{ font: "400 40px/1 var(--font-signature)", color: "var(--ink)" }}>Rishon Talkar</span></div>
            </Spec>
            <Spec name="Spacing" note="Use these gaps only: tight 8 between icon and text, field 16 between fields and rows, block 24 inside cards, section 48 between page sections (32 on phones)." variant="stack">
              <div className={s.scale}>
                {[["tight 8", 8], ["field 16", 16], ["block 24", 24], ["page 32", 32], ["section 48", 48]].map(([n, v]) => (
                  <div key={n} className={s.scaleRow}><span>{n}</span><span className={s.bar} style={{ width: Number(v) * 4 }} /></div>
                ))}
              </div>
            </Spec>
            <Spec name="Radius" note="One job per step. Nested corners step down: an item inside a 10px panel with 4px padding gets 6px.">
              <div className={s.radii}>
                {[["xs 4", "--r-xs", "marks"], ["sm 6", "--r-sm", "menu items"], ["r 10", "--r", "controls"], ["lg 14", "--r-lg", "cards"], ["xl 20", "--r-xl", "modals"], ["pill", "--r-pill", "status"]].map(([n, v, u]) => (
                  <span key={v} className={s.radius}><i style={{ borderRadius: `var(${v})` }} />{n}<span>{u}</span></span>
                ))}
              </div>
            </Spec>
          </Group>

          <Group id="actions" title="Actions" intro="One orange primary action per view. Secondary is an outline that turns orange on hover. Icon buttons always carry a label, which is also their tooltip.">
            <Spec name="Button" code="<Button variant size icon busy />">
              <Button icon={<FileUp />}>Choose a PDF</Button>
              <Button variant="secondary" icon={<Download />}>Download</Button>
              <Button variant="success" icon={<Send />}>Finish signing</Button>
              <Button variant="danger" icon={<Trash2 />}>Delete draft</Button>
              <Button variant="quiet">Cancel</Button>
              <Button busy>Saving…</Button>
              <Button disabled>Disabled</Button>
              <Button size="sm" variant="secondary">Small</Button>
            </Spec>
            <Spec name="Icon button, menu, tooltip" code="<IconButton label /> · <ActionMenu /> · <Tooltip />">
              <IconButton label="Share"><Share2 /></IconButton>
              <IconButton label="Rename" bare><Pencil /></IconButton>
              <IconButton label="Pen tool" pressed><Pencil /></IconButton>
              <ActionMenu label="Draft actions" items={[
                { label: "Download", icon: <Download aria-hidden />, onSelect: () => setToast("Downloaded") },
                { label: "Copy link", icon: <Link2 aria-hidden />, onSelect: () => setToast("Link copied") },
                { label: "Delete from this device", icon: <Trash2 aria-hidden />, tone: "danger", onSelect: () => setToast("Draft deleted") },
              ]} />
              <Tooltip text="Rotates every selected page 90°"><Button variant="secondary" size="sm">Hover me</Button></Tooltip>
              <ButtonLink to="/sitemap" size="sm">Route link as button</ButtonLink>
            </Spec>
          </Group>

          <Group id="inputs" title="Inputs" intro="Labels sit above fields. Hints are muted; errors replace the hint and are announced. Focus is an orange ring.">
            <Spec name="Field, input, select, textarea" code="<Field label hint error><Input /></Field>" variant="stack">
              <div className={s.formGrid}>
                <Field label="Signer name" hint="As it should appear under the signature"><Input defaultValue="Rishon Talkar" /></Field>
                <Field label="Date format"><Select defaultValue="long"><option value="long">Oct 21, 2026</option><option value="iso">2026-10-21</option><option value="dmy">21/10/2026</option></Select></Field>
                <Field label="Page range" error="Pages must be between 1 and 12"><Input defaultValue="4-15" aria-invalid="true" /></Field>
                <Field label="Note to self" hint="Not added to the PDF"><Textarea defaultValue="Check clause 7 before signing." /></Field>
              </div>
            </Spec>
            <Spec name="Checkbox and switch" code="<Checkbox label /> · <Switch label />">
              <Checkbox label="Add today's date next to my signature" defaultChecked />
              <Switch label="Keep drafts on this device" defaultChecked />
              <Switch label="Remember my signature" />
            </Spec>
          </Group>

          <Group id="navigation" title="Navigation" intro="The top bar, phone menu and phone tabs come from the app shell. The top bar keeps the portal sidebar's navy and active-pill styling. Inside a page, tabs switch views and segmented controls switch modes.">
            <Spec name="Tabs" code="<Tabs items value onChange />" variant="stack">
              <Tabs label="Editor views" value={tab} onChange={setTab} items={[{ value: "view", label: "View" }, { value: "sign", label: "Sign", count: 3 }, { value: "pages", label: "Pages" }, { value: "edit", label: "Edit text" }]} />
            </Spec>
            <Spec name="Segmented" code="<Segmented items value onChange />">
              <Segmented label="Signature method" value={seg} onChange={setSeg} items={[{ value: "draw", label: "Draw" }, { value: "type", label: "Type" }, { value: "upload", label: "Upload" }]} />
            </Spec>
          </Group>

          <Group id="feedback" title="Feedback" intro="Pills are for status only. Alerts explain what happened and what to do next. Empty states always offer a way forward.">
            <Spec name="Badge, chip, count" code="<Badge tone shape /> · <Chip color /> · <Count n />">
              <Badge>Draft</Badge><Badge tone="ok">Signed</Badge><Badge tone="warn">Deletes in 1 day</Badge><Badge tone="err">Damaged file</Badge><Badge tone="neutral">Read only</Badge>
              <Badge shape="label">PDF</Badge><Badge tone="warn" shape="label">Phase 2</Badge>
              <Chip color="#2F6B4F">Self-sign</Chip><Chip color="#B3530E">Needs signature</Chip>
              <Count n={3} />
            </Spec>
            <Spec name="Alert" code="<Alert tone title />" variant="stack">
              <Alert tone="warn" title="This PDF is already digitally signed">Saving changes will invalidate the existing certificate signature. Download a copy instead if you need to keep it valid.</Alert>
              <Alert tone="info" title="Password protected">Enter the password to open it. The password stays in this browser.</Alert>
              <Alert tone="ok" title="Ready to download">All 3 required fields are filled.</Alert>
              <InlineError title="Couldn't open this file" onRetry={() => setToast("Retrying")}>It isn't a valid PDF, or it's damaged. Try exporting it again from the app that made it.</InlineError>
            </Spec>
            <Spec name="Empty state" code="<EmptyState icon title actions compact />" variant="stack">
              <EmptyState icon={<FileUp />} title="No saved drafts" actions={<Button icon={<Plus />}>Open a PDF</Button>}>Drafts you choose to keep on this device will show up here.</EmptyState>
              <EmptyState compact icon={<FileUp />} title="No signatures saved" actions={<Button variant="secondary" size="sm">Create one</Button>}>You can still sign; we just won't remember it.</EmptyState>
            </Spec>
            <Spec name="Progress, skeleton, toast" code="<ProgressBar /> · <Skeleton /> · <Toast />" variant="stack">
              <ProgressBar value={0.45} label="Rendering pages" />
              <ProgressBar value={0.86} label="Storage used" tone="fill" />
              <ProgressBar value={1} label="Required fields" />
              <div style={{ display: "grid", gap: 8 }}><Skeleton width="60%" height={18} /><Skeleton /><Skeleton width="80%" /></div>
              <Toast inline message="Downloaded service-agreement-signed.pdf" onDone={() => {}} onUndo={() => {}} />
              <div className={s.row}><Button variant="secondary" size="sm" onClick={() => setToast("Draft saved on this device")}>Show a real toast</Button></div>
            </Spec>
          </Group>

          <Group id="display" title="Display" intro="Page header over stat tiles, then a main column and a 380px side column. This is the same layout as the client portal.">
            <Spec name="Page header" code="<PageHeader eyebrow title description actions />" variant="stack">
              <PageHeader eyebrow="Sign" title="Service agreement" description="6 pages · 3 fields left to fill" actions={<><Button variant="secondary">Save draft</Button><Button>Review & download</Button></>} />
            </Spec>
            <Spec name="Stats" code="<StatGrid><Stat /></StatGrid>" variant="stack">
              <StatGrid>
                <Stat label="Pages" value="6" />
                <Stat label="Fields filled" value="2 / 5" progress={0.4} />
                <Stat label="File size" value="1.4 MB" delta="Original kept unchanged" />
                <Stat label="Saved drafts" value="3" delta="1 deletes tomorrow" trend="down" />
              </StatGrid>
            </Spec>
            <Spec name="Card and avatar" code="<Card title description action /> · <Avatar />" variant="desk">
              <Card title="On this device" description="Drafts and signatures you chose to keep" action={<Button variant="secondary" size="sm">Manage</Button>}>
                <StorageMeter usedMb={2.3} drafts={3} quotaMb={2048} />
              </Card>
              <Avatar name="Rishon Talkar" /><Avatar name="Dev Wable" size={24} />
            </Spec>
          </Group>

          <Group id="overlays" title="Overlays" intro="Modals for decisions, styled like Google's dialogs: a white card, plain title, actions bottom-right. Large ones go full screen on phones. On phones, editing tools open in a bottom sheet so the page stays visible.">
            <Spec name="Modal" code="<Modal open onClose title footer />">
              <Button variant="danger" icon={<Trash2 />} onClick={() => setModal(true)}>Delete all drafts…</Button>
              <Modal open={modal} onClose={() => setModal(false)} size="sm" title="Delete all drafts on this device?"
                description="3 drafts, 2.3 MB"
                footer={<><Button variant="quiet" onClick={() => setModal(false)}>Cancel</Button><Button variant="danger" onClick={() => { setModal(false); setToast("All drafts deleted from this device"); }}>Delete all</Button></>}>
                <p>This can't be undone. Download anything you want to keep first.</p>
              </Modal>
            </Spec>
            <Spec name="Bottom sheet" code="<BottomSheet title contained />" note="Shown inside a phone frame. In the app it's fixed to the bottom of the screen." variant="desk">
              <div className={s.phone}>
                <div className={s.phonePage}><PageLines count={18} /></div>
                <BottomSheet contained title="Add to page" onClose={() => {}}><SheetTools /></BottomSheet>
              </div>
            </Spec>
          </Group>

          <Group id="pdf" title="PDF tools" intro="Components specific to TCG Sign. The pages here are grey stand-ins; the editor draws real pages with PDF.js. Field positions are stored as fractions of the page, so they hold their place at every zoom, and convert to PDF points on export.">
            <Spec name="Drop zone" code="<DropZone onFiles multiple small />" variant="stack">
              <DropZone onFiles={(f) => setToast(`${f[0].name} picked (nothing uploaded)`)} />
              <PrivacyNote block />
            </Spec>
            <Spec name="Document row" code="<DocumentRow doc actions />" variant="stack">
              <DocumentList>
                {EXAMPLE_DRAFTS.map((d) => <DocumentRow key={d.id} doc={d} actions={<IconButton bare label={`Download ${d.name}`}><Download /></IconButton>} />)}
              </DocumentList>
            </Spec>
            <Spec name="Page thumbnails" code="<ThumbGrid><PageThumb /></ThumbGrid>" note="Select with click or Enter. Rotate and delete appear on hover, and are always shown on touch screens." variant="stack">
              <ThumbGrid label="Pages">
                {[1, 2, 3, 4, 5].map((n) => (
                  <PageThumb key={n} number={n} selected={thumbSel === n} rotation={rot[n] ?? 0} onSelect={() => setThumbSel(n)}
                    onRotate={() => setRot((r) => ({ ...r, [n]: ((r[n] ?? 0) + 90) % 360 }))} onDelete={() => setToast(`Page ${n} deleted`)} />
                ))}
              </ThumbGrid>
            </Spec>
            <Spec name="Editor toolbar" code="<EditorToolbar tool zoom />" variant="stack">
              <EditorToolbar tool={tool} onTool={setTool} zoom={zoom} onZoom={setZoom} canUndo />
            </Spec>
            <Spec name="Page and placed fields" code="<FieldBox field pageHeight selected />" note="Empty fields are orange so you can see what's left. The selected field shows its type, a delete button and a resize handle. Text uses the same font the exported PDF uses: the PDF's own Google font when it's one of the bundled 12, otherwise Helvetica." variant="stack">
              <PageCanvas pages={1}>{(_, h) => fields.map((f) => (
                <FieldBox key={f.id} field={f} pageHeight={h} selected={sel === f.id} onPointerDown={() => setSel(f.id)}
                  onDelete={() => setToast("Field deleted (demo)")} onResizePointerDown={() => {}} />
              ))}</PageCanvas>
            </Spec>
            <Spec name="Signature" code="<SignatureCreator kind onUse /> · <SignatureCard />" note="Draw works with finger, pen or mouse without scrolling the page. Type is the keyboard-accessible option." variant="stack">
              <div className={s.split2}>
                <SignatureCreator defaultName="Rishon Talkar" onUse={() => setToast("Signature ready to place (demo)")} />
                <div className={s.sigGrid}>
                  <SignatureCard text="Rishon Talkar" saved="saved Oct 20" actions={<Button size="sm">Use</Button>} />
                  <SignatureCard text="RT" kind="initials" saved="saved Oct 20" actions={<Button size="sm">Use</Button>} />
                </div>
              </div>
            </Spec>
            <Spec name="Storage meter" code="<StorageMeter usedMb drafts quotaMb />" variant="stack">
              <StorageMeter usedMb={2.3} drafts={3} quotaMb={2048} />
            </Spec>
            <Spec name="Phase and build status" code="<PhaseChip /> · <StatusChip />" note="Used on the sitemap.">
              <PhaseChip phase={1} /><PhaseChip phase={2} /><PhaseChip phase={3} /><PhaseChip phase="internal" />
              <StatusChip status="built" /><StatusChip status="stub" /><StatusChip status="planned" />
            </Spec>
          </Group>
        </div>
      </div>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
