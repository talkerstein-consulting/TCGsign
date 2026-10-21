// Shared primitives. APIs mirror tcgportal-clients/src/components/ui/primitives.tsx
// so a screen reads the same in both apps.
import {
  useEffect, useId, useRef, useState,
  type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { Link } from "react-router";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, MoreHorizontal, X } from "lucide-react";
import s from "./ui.module.css";

export { MenuBar, type BarItem, type BarMenu } from "./MenuBar";
export { BannerArt, PATTERNS, type Pattern } from "./BannerArt";
import { BannerArt, bannerColors, type Pattern } from "./BannerArt";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------- actions ---------- */

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "success" | "danger" | "quiet";
  size?: "md" | "sm";
  icon?: ReactNode;
  busy?: boolean;
  block?: boolean;
};
export function Button({ variant = "primary", size = "md", icon, busy, block, className, children, disabled, ...rest }: ButtonProps) {
  return (
    <button type="button" {...rest} disabled={disabled || busy} aria-busy={busy || undefined}
      className={cx(s.btn, s[variant], size === "sm" && s.sm, block && s.block, className)}>
      {busy ? <Loader2 className={s.spin} aria-hidden /> : icon}
      {children}
    </button>
  );
}

/** A route link that looks like a Button. */
export function ButtonLink({ to, variant = "secondary", size = "md", icon, children }: { to: string; variant?: ButtonProps["variant"]; size?: "md" | "sm"; icon?: ReactNode; children: ReactNode }) {
  return <Link to={to} className={cx(s.btn, s[variant], size === "sm" && s.sm)}>{icon}{children}</Link>;
}

type IconButtonProps =ButtonHTMLAttributes<HTMLButtonElement> & { label: string; bare?: boolean; pressed?: boolean };
/** 44px square. The label doubles as the tooltip and accessible name. */
export function IconButton({ label, bare, pressed, className, children, ...rest }: IconButtonProps) {
  return (
    <button type="button" {...rest} aria-label={label} title={label} aria-pressed={pressed}
      className={cx(s.iconBtn, bare && s.bare, className)}>
      {children}
    </button>
  );
}

/* ---------- navigation ---------- */

type Item = { value: string; label: string; count?: number; icon?: ReactNode };

function arrowKeys(e: KeyboardEvent, items: Item[], value: string, onChange: (v: string) => void) {
  const i = items.findIndex((t) => t.value === value);
  const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
  if (!step) return;
  e.preventDefault();
  const next = items[(i + step + items.length) % items.length];
  onChange(next.value);
  (e.currentTarget.querySelector(`[data-value="${next.value}"]`) as HTMLElement | null)?.focus();
}

export function Tabs({ items, value, onChange, label }: { items: Item[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className={s.tabs} onKeyDown={(e) => arrowKeys(e, items, value, onChange)}>
      {items.map((t) => (
        <button key={t.value} data-value={t.value} role="tab" type="button" aria-selected={t.value === value}
          tabIndex={t.value === value ? 0 : -1} className={s.tab} onClick={() => onChange(t.value)}>
          {t.label}{!!t.count && <span className={s.count}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented({ items, value, onChange, label }: { items: Item[]; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={s.segmented} onKeyDown={(e) => arrowKeys(e, items, value, onChange)}>
      {items.map((t) => (
        <button key={t.value} data-value={t.value} role="radio" type="button" aria-checked={t.value === value}
          tabIndex={t.value === value ? 0 : -1} className={s.segment} onClick={() => onChange(t.value)}>
          {t.icon}{t.label}{!!t.count && <span className={s.count}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ---------- display ---------- */

export type Tone = "info" | "ok" | "warn" | "err" | "neutral";
export function Badge({ tone = "info", shape = "pill", children }: { tone?: Tone; shape?: "pill" | "label"; children: ReactNode }) {
  return <span className={cx(s.badge, tone !== "info" && s[tone], shape === "label" && s.label)}>{children}</span>;
}
/** Tinted chip in any colour; text and border are mixed from it. */
export function Chip({ color, children }: { color: string; children: ReactNode }) {
  return <span className={cx(s.badge, s.soft)} style={{ ["--chip" as string]: color }}>{children}</span>;
}
export function Count({ n }: { n: number }) { return <span className={s.count}>{n}</span>; }

const initials = (name: string) => {
  const p = name.trim().split(/\s+/);
  return `${p[0]?.[0] ?? ""}${p.length > 1 ? p.at(-1)?.[0] ?? "" : ""}`.toUpperCase();
};
export function Avatar({ name, size = 32 }: { name: string; size?: 24 | 32 }) {
  return <span className={cx(s.avatar, size === 24 ? s.av24 : s.av32)} title={name} aria-label={name} role="img">{initials(name)}</span>;
}

export function Card({ title, description, action, children }: { title?: string; description?: string; action?: ReactNode; children?: ReactNode }) {
  return (
    <section className={s.card}>
      {(title || action) && (
        <div className={s.cardHead}>
          <div>{title && <h3>{title}</h3>}{description && <p>{description}</p>}</div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Tooltip({ text, children }: { text: string; children: ReactNode }) {
  return <span className={s.tipWrap}>{children}<span role="tooltip" className={s.tip}>{text}</span></span>;
}

/* ---------- form ---------- */

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {error ? <span className={s.errorText} role="alert">{error}</span> : hint && <span className={s.hint}>{hint}</span>}
    </label>
  );
}
export function Input(props: InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={cx(s.input, props.className)} />; }
export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={cx(s.input, props.className)} />; }
export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) { return <select {...props} className={cx(s.input, props.className)} />; }
export function Checkbox({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={s.check}><input type="checkbox" {...rest} />{label}</label>;
}
export function Switch({ label, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className={s.switch}><input type="checkbox" role="switch" {...rest} />{label}</label>;
}

/* ---------- page structure ---------- */

/** `banner`: a solid brand-ink banner with white text and a drawing about the screen. Pass its pattern (`true` uses "pages"). */
export function PageHeader({ eyebrow, title, description, actions, banner }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode; banner?: boolean | Pattern }) {
  const pattern: Pattern | null = banner ? (banner === true ? "pages" : banner) : null;
  return (
    <header className={cx(s.pageHead, pattern && s.banner)} style={pattern ? { "--banner-ink": bannerColors(pattern).ink } as CSSProperties : undefined}>
      {pattern && <BannerArt pattern={pattern} />}
      <div>
        {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
        <h1 className={s.pageTitle}>{title}</h1>
        {description && <p className={s.pageDesc}>{description}</p>}
      </div>
      {actions && <div className={s.actions}>{actions}</div>}
    </header>
  );
}

export function StatGrid({ columns = 4, children }: { columns?: 3 | 4; children: ReactNode }) {
  return <div className={s.statsWrap}><div className={cx(s.stats, columns === 3 && s.three)}>{children}</div></div>;
}
export function Stat({ label, value, delta, trend, progress }: { label: string; value: string; delta?: string; trend?: "up" | "down"; progress?: number }) {
  return (
    <div className={s.stat}>
      <span className={s.statLabel}>{label}</span>
      <span className={s.statValue}>{value}</span>
      {progress !== undefined && <ProgressBar value={progress} label={`${label} progress`} />}
      {delta && <span className={cx(s.statDelta, trend && s[trend])}>{delta}</span>}
    </div>
  );
}
/** 0–1. Turns orange from 80% (filling up) and green at 100% (done) unless `tone` says otherwise. */
export function ProgressBar({ value, label, tone }: { value: number; label: string; tone?: "fill" | "done" }) {
  const v = Math.max(0, Math.min(1, value));
  const cls = tone === "fill" ? (v >= .8 ? s.progressWarn : "") : v >= 1 ? s.progressDone : "";
  return (
    <span className={s.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v * 100)}>
      <span style={{ width: `${v * 100}%` }} className={cls} />
    </span>
  );
}

/* ---------- feedback ---------- */

export function EmptyState({ icon, title, children, actions, compact = false }: { icon?: ReactNode; title: string; children?: ReactNode; actions?: ReactNode; compact?: boolean }) {
  if (compact) return (
    <div className={s.emptyCompact}>
      {icon && <span className={s.emptyIcon} aria-hidden>{icon}</span>}
      <div><p className={s.emptyTitle}>{title}</p>{children && <p>{children}</p>}</div>
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
  return (
    <div className={s.empty}>
      {icon && <span className={s.emptyIcon} aria-hidden>{icon}</span>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className={s.actions}>{actions}</div>}
    </div>
  );
}

const ALERT_ICON = { err: AlertCircle, warn: AlertTriangle, ok: CheckCircle2, info: Info };
export function Alert({ tone = "info", title, children, action }: { tone?: "info" | "ok" | "warn" | "err"; title: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = ALERT_ICON[tone];
  return (
    <div role={tone === "err" ? "alert" : "status"} className={cx(s.alert, s[tone])}>
      <Icon aria-hidden />
      <div><strong>{title}</strong>{children && <p>{children}</p>}</div>
      {action}
    </div>
  );
}
export function InlineError({ title, children, onRetry }: { title: string; children?: ReactNode; onRetry?: () => void }) {
  return <Alert tone="err" title={title} action={onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}>{children}</Alert>;
}

export function Skeleton({ width = "100%", height = 14 }: { width?: number | string; height?: number }) {
  return <span className={s.skeleton} style={{ width, height }} aria-hidden />;
}

/** Bottom-right on desktop, above the phone tab bar on mobile. Auto-dismisses after 5s. */
export function Toast({ message, onUndo, onDone, inline }: { message: string | null; onUndo?: () => void; onDone: () => void; inline?: boolean }) {
  useEffect(() => {
    if (!message || inline) return;
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [message, onDone, inline]);
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className={cx(s.toast, inline && s.toastInline)}>
      <CheckCircle2 aria-hidden /><p>{message}</p>
      {onUndo && <button type="button" className={s.toastAction} onClick={() => { onUndo(); onDone(); }}>Undo</button>}
    </div>
  );
}

/* ---------- overlays ---------- */

export function Modal({ open, onClose, title, description, size = "md", footer, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; size?: "sm" | "md" | "lg"; footer?: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} aria-labelledby={titleId} className={cx(s.modal, s[size === "sm" ? "mSm" : size === "lg" ? "mLg" : "mMd"])}
      onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <header className={s.modalHead}>
        <div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div>
        {/* Like Google's dialogs, ones with their own buttons don't need a close ×; Esc and the backdrop still close them. */}
        {!footer && <button type="button" className={s.close} aria-label="Close" onClick={onClose}><X size={18} /></button>}
      </header>
      <div className={s.modalBody}>{children}</div>
      {footer && <footer className={s.modalFoot}>{footer}</footer>}
    </dialog>
  );
}

type MenuItem = { label: string; icon?: ReactNode; tone?: "danger"; onSelect: () => void };
export function ActionMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: globalThis.KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    (wrap.current?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
  };
  return (
    <div ref={wrap} className={s.menuWrap}>
      <IconButton label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal aria-hidden />
      </IconButton>
      {open && (
        <div id={id} role="menu" aria-label={label} className={s.menu} onKeyDown={keys}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className={cx(s.menuItem, item.tone === "danger" && s.menuDanger)}
              onClick={() => { setOpen(false); item.onSelect(); }}>
              {item.icon}{item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
