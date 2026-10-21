// A Docs-style menu bar: File, Edit, View… Click one to open it; while one is open, hovering
// another switches to it. Left/Right move between menus, Up/Down between items, Esc closes.
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./menubar.module.css";

export type BarItem =
  | { label: string; icon?: ReactNode; shortcut?: string; disabled?: boolean; tone?: "danger"; onSelect: () => void }
  | "divider";
export type BarMenu = { label: string; items: BarItem[] };

export function MenuBar({ label, menus }: { label: string; menus: BarMenu[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (open === null) return;
    const away = (e: PointerEvent) => { if (!bar.current?.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const triggers = () => [...(bar.current?.querySelectorAll<HTMLElement>(`.${s.trigger}`) ?? [])];
  const focusFirst = () => requestAnimationFrame(() => (bar.current?.querySelector(`.${s.menu} [role="menuitem"]:not(:disabled)`) as HTMLElement | null)?.focus());
  const go = (i: number, focusMenu: boolean) => {
    const n = (i + menus.length) % menus.length;
    setOpen(n);
    if (focusMenu) focusFirst(); else triggers()[n]?.focus();
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    const inMenu = (e.target as HTMLElement).closest(`.${s.menu}`);
    if (e.key === "Escape" && open !== null) { e.preventDefault(); triggers()[open]?.focus(); setOpen(null); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const cur = open ?? triggers().indexOf(document.activeElement as HTMLElement);
      go(cur + (e.key === "ArrowRight" ? 1 : -1), open !== null);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!inMenu) { go(triggers().indexOf(e.target as HTMLElement), true); return; }
      const all = [...inMenu.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')];
      const i = all.indexOf(document.activeElement as HTMLElement);
      all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
    }
  };

  return (
    <div ref={bar} role="menubar" aria-label={label} className={s.bar} onKeyDown={keys}>
      {menus.map((m, i) => (
        <div key={m.label} className={s.wrap}>
          <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={open === i} aria-controls={`${id}-${i}`}
            className={s.trigger} onClick={() => setOpen(open === i ? null : i)} onPointerEnter={() => open !== null && open !== i && setOpen(i)}>
            {m.label}
          </button>
          {open === i && (
            <div id={`${id}-${i}`} role="menu" aria-label={m.label} className={s.menu}>
              {m.items.map((it, j) => it === "divider" ? <div key={j} role="separator" className={s.divider} /> : (
                <button key={it.label} type="button" role="menuitem" disabled={it.disabled} className={it.tone === "danger" ? `${s.item} ${s.danger}` : s.item}
                  onClick={() => { setOpen(null); it.onSelect(); }}>
                  <span className={s.icon} aria-hidden>{it.icon}</span>
                  <span className={s.itemLabel}>{it.label}</span>
                  {it.shortcut && <kbd className={s.kbd}>{it.shortcut}</kbd>}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
