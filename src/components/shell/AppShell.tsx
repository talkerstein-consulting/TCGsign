import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { Menu, X } from "lucide-react";
import { GROUPS, SCREENS, type Screen } from "../../routes";
import { IconButton } from "../ui";
import s from "./shell.module.css";

/** Every screen with `nav`, grouped: in the sidebar on desktop and the drawer below 1024px. */
const navScreens = SCREENS.filter((x) => x.nav);
const soon = (x: Screen) => x.status !== "built" && x.phase !== "internal";

function NavItem({ screen, label, onNavigate }: { screen: Screen; label?: string; onNavigate?: () => void }) {
  const Icon = screen.icon;
  return (
    <NavLink to={screen.path} end={screen.path === "/"} className={s.link} onClick={onNavigate} title={screen.label}>
      <Icon aria-hidden />
      <span className={s.linkLabel}>{label ?? screen.label}</span>
      {soon(screen) && <span className={s.soon}>Soon</span>}
    </NavLink>
  );
}

/** Every screen, grouped. Used by the phone and tablet drawer. */
function GroupedLinks({ screens, onNavigate }: { screens: Screen[]; onNavigate?: () => void }) {
  return (
    <>
      {GROUPS.map((g) => {
        const items = screens.filter((x) => x.group === g);
        if (!items.length) return null;
        return (
          <div key={g} className={s.group}>
            <div className={s.groupLabel}>{g}</div>
            {items.map((x) => <NavItem key={x.path} screen={x} onNavigate={onNavigate} />)}
          </div>
        );
      })}
    </>
  );
}

function Brand() {
  return (
    <NavLink to="/" className={s.brand} aria-label="TCG Sign home">
      <img className={s.brandLogo} src="/brand/tcg-logo-light.png" width={125} height={40} alt="Talkerstein Consulting Group" />
      <span className={s.product}>Sign</span>
    </NavLink>
  );
}

/** Staff only for now (behind Cloudflare Access); a placeholder until sign-in is wired. */
function Profile() {
  return <span className={s.avatar} title="TCG staff · files stay on this device" aria-label="TCG staff" role="img">TC</span>;
}

/** `bare`: hide the phone/tablet top bar, for a screen with its own header (the open editor). The sidebar stays. */
export function AppShell({ actions, bare, children }: { actions?: ReactNode; bare?: boolean; children: ReactNode }) {
  const drawer = useRef<HTMLDialogElement>(null);
  const main = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  // Close the drawer and move focus to the new page on navigation.
  useEffect(() => {
    drawer.current?.close();
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className={s.app} data-bare={bare || undefined}>
      <a className={s.skip} href="#content">Skip to content</a>

      {/* 1024px and up: a navy sidebar with the logo and every screen, on all pages. */}
      <aside className={s.sidebar} aria-label="App">
        <Brand />
        {actions && <div className={s.sideAction}>{actions}</div>}
        <nav aria-label="Main" className={s.sideNav}>
          <GroupedLinks screens={navScreens} />
        </nav>
        <div className={s.sideFoot}><Profile /><span>TCG staff</span></div>
      </aside>

      {/* Below 1024px: a top bar with the menu drawer. */}
      <header className={s.topbar}>
        <div className={s.bar}>
          <IconButton bare label="Open menu" className={s.menuBtn} onClick={() => drawer.current?.showModal()}><Menu /></IconButton>
          <Brand />
          <div className={s.actions}>{actions}<Profile /></div>
        </div>
      </header>

      <dialog ref={drawer} className={s.drawer} aria-label="Menu" onClick={(e) => { if (e.target === e.currentTarget) drawer.current?.close(); }}>
        <div className={s.drawerPanel}>
          <div className={s.drawerTop}>
            <Brand />
            <button type="button" className={s.drawerClose} aria-label="Close menu" onClick={() => drawer.current?.close()}><X size={20} /></button>
          </div>
          <nav aria-label="All screens" className={s.drawerNav}>
            <GroupedLinks screens={navScreens} onNavigate={() => drawer.current?.close()} />
          </nav>
        </div>
      </dialog>

      <main id="content" ref={main} tabIndex={-1} className={s.content}>
        <div className={s.page}>{children}</div>
      </main>

      <nav className={s.tabs} aria-label="Quick">
        {SCREENS.filter((x) => x.tab).map((x) => <NavItem key={x.path} screen={x} />)}
      </nav>
    </div>
  );
}
