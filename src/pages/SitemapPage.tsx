import { Fragment } from "react";
import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Badge, PageHeader, Stat, StatGrid } from "../components/ui";
import { PhaseChip, StatusChip } from "../components/pdf";
import { GROUPS, SCREENS, type Screen } from "../routes";
import pages from "./pages.module.css";
import s from "./sitemap.module.css";

const FLOW = [
  { label: "Home", note: "Open a PDF from the device" },
  { label: "Editor", note: "Place fields and sign" },
  { label: "Review & download", note: "Check pages and warnings" },
  { label: "Download or share", note: "New PDF; original untouched", end: true },
];

function NodeTitle({ screen }: { screen: Screen }) {
  const Icon = screen.icon;
  const linkable = screen.status !== "planned" && !screen.path.includes(":");
  return (
    <span className={s.nodeTitle}>
      <Icon aria-hidden />
      {linkable ? <Link to={screen.path}>{screen.label}</Link> : <span>{screen.label}</span>}
    </span>
  );
}

function Node({ screen }: { screen: Screen }) {
  const children = SCREENS.filter((x) => x.parent === screen.path);
  return (
    <li>
      <div className={s.node} data-status={screen.status}>
        <NodeTitle screen={screen} />
        <span className={s.path}>{screen.path}{screen.bare ? " · outside the app shell" : ""}</span>
        <span className={s.chips}><PhaseChip phase={screen.phase} /><StatusChip status={screen.status} /></span>
      </div>
      {children.length > 0 && <ul className={s.nodes}>{children.map((c) => <Node key={c.path} screen={c} />)}</ul>}
    </li>
  );
}

export default function SitemapPage() {
  const product = SCREENS.filter((x) => x.phase !== "internal");
  const count = (f: (x: Screen) => boolean) => String(product.filter(f).length);

  return (
    <>
      <PageHeader eyebrow="Internal" title="Sitemap"
        description="Every screen in TCG Sign, its phase from the scope review (ticket #110), and how far it's built. Generated from src/routes.ts, so it can't drift from the app." />

      <StatGrid>
        <Stat label="Screens planned" value={count(() => true)} />
        <Stat label="Built" value={count((x) => x.status === "built")} />
        <Stat label="Phase 1 still to build" value={count((x) => x.phase === 1 && x.status !== "built")} />
        <Stat label="Phase 2 and 3" value={count((x) => x.phase === 2 || x.phase === 3)} delta="Waiting on the decision gate" />
      </StatGrid>

      <section className={pages.section} aria-labelledby="tree-h">
        <div className={pages.sectionHead}>
          <div><h2 id="tree-h">Structure</h2><p>Grouped as they appear in the phone and tablet menu. Dashed cards have no route yet. Phase 3 screens need approval before any build.</p></div>
        </div>
        <div>
          <span className={s.root}><img src="/brand/tcg-icon.svg" alt="" />TCG Sign</span>
          <div className={s.tree}>
            {GROUPS.map((g) => {
              const top = SCREENS.filter((x) => x.group === g && !x.parent);
              return (
                <div key={g} className={s.branch}>
                  <div className={s.branchHead}>{g}</div>
                  <ul className={s.nodes}>{top.map((x) => <Node key={x.path} screen={x} />)}</ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className={pages.section} aria-labelledby="flow-h">
        <div className={pages.sectionHead}>
          <div><h2 id="flow-h">Main flow: sign a PDF on your own device</h2><p>Phase 1 covers this whole path. Nothing is uploaded at any step.</p></div>
        </div>
        <div className={s.flow}>
          {FLOW.map((f, i) => (
            <Fragment key={f.label}>
              {i > 0 && <ArrowRight size={18} className={s.arrow} aria-hidden />}
              <span className={`${s.step} ${f.end ? s.end : ""}`}><b>{f.label}</b><span>{f.note}</span></span>
            </Fragment>
          ))}
        </div>
      </section>

      <section className={pages.section} aria-labelledby="table-h">
        <div className={pages.sectionHead}><div><h2 id="table-h">All screens</h2></div></div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Screen</th><th>Route</th><th>Phase</th><th>Status</th><th>Purpose</th><th>Built from</th></tr></thead>
            <tbody>
              {SCREENS.map((x) => (
                <tr key={x.path}>
                  <td>{x.status !== "planned" && !x.path.includes(":") ? <Link to={x.path}>{x.label}</Link> : x.label}</td>
                  <td className={s.nowrap}><code>{x.path}</code></td>
                  <td><PhaseChip phase={x.phase} /></td>
                  <td><StatusChip status={x.status} /></td>
                  <td className={s.purpose}>{x.purpose}</td>
                  <td><span className={s.comps}>{x.components.length ? x.components.map((c) => <Badge key={c} tone="neutral" shape="label">{c}</Badge>) : "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
