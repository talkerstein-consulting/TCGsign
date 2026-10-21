import { useLocation } from "react-router";
import { Hammer } from "lucide-react";
import { Badge, ButtonLink, EmptyState, PageHeader } from "../components/ui";
import { PhaseChip } from "../components/pdf";
import { screenFor } from "../routes";
import s from "./pages.module.css";

/** Every route that exists in the sitemap but has no screen yet. */
export default function Placeholder() {
  const { pathname } = useLocation();
  const screen = screenFor(pathname);
  if (!screen) return <NotFound />;
  return (
    <>
      <PageHeader eyebrow={screen.group} title={screen.label} description={screen.purpose} actions={<PhaseChip phase={screen.phase} />} />
      <EmptyState icon={<Hammer />} title="This screen isn't built yet"
        actions={<><ButtonLink to="/sitemap">See the sitemap</ButtonLink><ButtonLink to="/style">Component styles</ButtonLink></>}>
        It will be built from these components:
        {screen.components.length > 0 && <span className={s.compList}>{screen.components.map((c) => <Badge key={c} tone="neutral" shape="label">{c}</Badge>)}</span>}
      </EmptyState>
    </>
  );
}

export function NotFound() {
  return (
    <EmptyState title="Page not found" actions={<ButtonLink to="/" variant="primary">Go to Home</ButtonLink>}>
      That address isn't part of TCG Sign. The sitemap lists every screen.
    </EmptyState>
  );
}
