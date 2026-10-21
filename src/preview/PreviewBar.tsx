// Black preview stepper over the app, styled like the client portal's state checker:
// step through every screen with ‹ ›, jump with the list or the white tabs.
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useDocument } from "../state/document";
import type { Field, FieldImage } from "../pdf/engine";
import { SAMPLE_BOXES, SAMPLE_NAME, SAMPLE_PAGE } from "../pdf/sample-layout";
import { setPreview } from "./mode";
import { STEPS, STEP_GROUPS, type DocState, type Step } from "./steps";
import s from "./preview.module.css";

type Box = { page?: number; x: number; y: number; w: number; h: number };
/** PDF-point box → field position as fractions of the page, origin top-left. */
const at = (b: Box, page = b.page ?? 1) => ({
  page, x: b.x / SAMPLE_PAGE.width, y: (SAMPLE_PAGE.height - b.y - b.h) / SAMPLE_PAGE.height, w: b.w / SAMPLE_PAGE.width, h: b.h / SAMPLE_PAGE.height,
});
const today = () => new Date().toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });

function sampleFields(sig?: FieldImage, ini?: FieldImage): Field[] {
  const signed = !!sig;
  return [
    { id: "pv-sig", kind: "signature", ...at(SAMPLE_BOXES.signature), ...(sig ? { image: sig } : {}) },
    { id: "pv-name", kind: "text", ...at(SAMPLE_BOXES.name), ...(signed ? { text: "Rishon Talkar" } : {}) },
    { id: "pv-date", kind: "date", ...at(SAMPLE_BOXES.date), text: today() },
    { id: "pv-agree", kind: "check", ...at(SAMPLE_BOXES.agree), checked: signed },
    ...[1, 2, 3].filter((p) => signed || p === 1).map((p): Field => ({ id: `pv-ini-${p}`, kind: "initials", ...at(SAMPLE_BOXES.initials, p), ...(ini ? { image: ini } : {}) })),
  ];
}

let sampleBytes: Promise<Uint8Array> | null = null;

export function PreviewBar() {
  const { doc, fields, replace, close, setSignature, setInitials } = useDocument();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(() => window.matchMedia("(min-width: 1024px)").matches);
  const bar = useRef<HTMLElement>(null);

  // Publish the bar's height so the top bar and sticky toolbars sit below it.
  useEffect(() => {
    const el = bar.current!;
    const root = document.documentElement;
    const sync = () => root.style.setProperty("--preview-h", `${el.offsetHeight}px`);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => { ro.disconnect(); root.style.removeProperty("--preview-h"); };
  }, []);

  // Which step is showing: the one last chosen here if it still matches, else worked out from the page.
  const chosen = STEPS.find((x) => x.id === active && x.path === pathname);
  const current = chosen ?? STEPS.find((x) => {
    if (x.path !== pathname) return false;
    if (x.path !== "/editor") return true;
    if (!doc) return x.doc === "none";
    const done = fields.length > 0 && fields.every((f) => (f.kind === "check" ? f.checked : f.kind === "text" || f.kind === "date" ? !!f.text : !!f.image));
    return x.doc === (done ? "signed" : "sample");
  });
  const index = current ? STEPS.indexOf(current) : -1;

  const setDoc = async (state: DocState) => {
    if (state === "keep") return;
    if (state === "none") { close(); return; }
    const [{ makeSamplePdf }, { typedSignature }] = await Promise.all([import("../pdf/sample"), import("../pdf/signature")]);
    sampleBytes ??= makeSamplePdf();
    const bytes = await sampleBytes;
    if (state === "signed") {
      const [sig, ini] = await Promise.all([typedSignature("Rishon Talkar"), typedSignature("RT")]);
      setSignature(sig); setInitials(ini);
      await replace(bytes, SAMPLE_NAME, sampleFields(sig ?? undefined, ini ?? undefined));
    } else {
      await replace(bytes, SAMPLE_NAME, sampleFields());
    }
  };

  const go = async (step: Step | undefined) => {
    if (!step || busy) return;
    setBusy(true);
    try {
      await setDoc(step.doc);
      setActive(step.id);
      navigate(step.path);
    } finally { setBusy(false); }
  };

  const label = current ? `${current.label}${current.screen.status === "planned" ? " (planned)" : current.screen.status === "stub" ? " (placeholder)" : ""}` : "Not a preview step";

  return (
    <nav ref={bar} className={s.bar} aria-label="Screen preview" aria-busy={busy || undefined}>
      <div className={s.row}>
        <span className={s.tag}>Preview</span>
        <div className={s.stepper}>
          <button type="button" className={s.arrow} aria-label="Previous screen" disabled={busy || index <= 0} onClick={() => go(STEPS[index - 1])}><ChevronLeft size={16} /></button>
          <span className={s.count}>{index >= 0 ? `${index + 1} / ${STEPS.length}` : `– / ${STEPS.length}`}</span>
          <select className={s.select} aria-label="Jump to screen" value={current?.id ?? ""} disabled={busy}
            onChange={(e) => go(STEPS.find((x) => x.id === e.target.value))}>
            {!current && <option value="">{label}</option>}
            {STEP_GROUPS.map((g) => (
              <optgroup key={g} label={g}>
                {STEPS.filter((x) => x.group === g).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </optgroup>
            ))}
          </select>
          <button type="button" className={s.arrow} aria-label="Next screen" disabled={busy || index >= STEPS.length - 1} onClick={() => go(STEPS[index + 1])}><ChevronRight size={16} /></button>
        </div>
        <span className={s.status} aria-live="polite">{busy ? "Loading sample…" : current?.screen.status === "planned" ? "Planned: not built or approved yet" : ""}</span>
        <button type="button" className={s.toggle} aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>
          All screens <ChevronDown size={14} aria-hidden />
        </button>
        <button type="button" className={s.hide} aria-label="Hide preview bar" title="Hide for this tab (add ?preview to the URL to bring it back)" onClick={() => setPreview(false)}><X size={16} /></button>
      </div>
      {showAll && (
        <div className={s.groups}>
          {STEP_GROUPS.map((g) => (
            <div key={g} className={s.group}>
              <span className={s.groupLabel}>{g}</span>
              {STEPS.filter((x) => x.group === g).map((x) => (
                <button key={x.id} type="button" className={s.tab} data-planned={x.screen.status === "planned" || undefined}
                  aria-current={x.id === current?.id ? "page" : undefined} disabled={busy} onClick={() => go(x)}>
                  {x.label.replace("Sign · ", "")}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </nav>
  );
}
