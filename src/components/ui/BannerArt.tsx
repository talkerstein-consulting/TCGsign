// Banner art: abstract Swiss geometry, one brand ink per banner. The banner is printed solid in the ink
// (navy or orange) with white text; the shapes are a pale tint of that same ink. Every drawing uses the
// same vocabulary as the reference poster (square-cornered bars and blocks on a grid) and only hints at
// its screen: stacked steps for documents, a rhythm for a signature, lines for text. Bars slowly change
// length, so the pattern shifts like the stepped poster. One grain covers the whole banner evenly.
// Motion stops for reduced-motion users.
import type { CSSProperties, ReactNode } from "react";
import s from "./banner.module.css";

export type Pattern = "pages" | "signature" | "lines" | "grid" | "merge" | "loops" | "stack" | "vault" | "buoy";
export const PATTERNS: Pattern[] = ["pages", "signature", "lines", "grid", "merge", "loops", "stack", "vault", "buoy"];

const NAVY = "#19254A", ORANGE = "#B3530E";
/** The ink each banner prints in, alternating so neighbouring screens differ. */
const INK: Record<Pattern, string> = {
  pages: NAVY, signature: ORANGE, lines: NAVY, grid: ORANGE, merge: NAVY, loops: ORANGE, stack: NAVY, vault: ORANGE, buoy: NAVY,
};

/** The ink mixed into white. */
const tintOf = (hex: string, amount: number) =>
  "#" + [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * amount).toString(16).padStart(2, "0")).join("");

/** A banner's colours: `ink` is the solid background, `light` the shapes (a pale tint of the same ink). */
export function bannerColors(pattern: Pattern) {
  const ink = INK[pattern];
  return { ink, light: tintOf(ink, ink === NAVY ? 0.2 : 0.24) };
}

const W = 480, H = 240;
type Motion = "growX" | "growY" | "shift" | "meshDown" | "meshUp";

/** A bar that slowly changes length (or shifts), on its own delay. `from` sets which end stays put. */
const bar = (key: string | number, x: number, y: number, w: number, h: number, fill: string, motion: Motion, d: number, from = "left") => (
  <rect key={key} x={x} y={y} width={w} height={h} fill={fill} className={`${s.bar} ${s[motion]}`}
    style={{ "--d": `${d.toFixed(2)}s`, transformOrigin: from } as CSSProperties} />
);

/** Any shape that moves like a bar: wrapped in a group so polygons and paths can build in and loop too. */
const part = (key: string | number, _x: number, _y: number, _w: number, _h: number, motion: Motion, d: number, from: string, child: ReactNode) => (
  <g key={key} className={`${s.bar} ${s[motion]}`} style={{ "--d": `${d.toFixed(2)}s`, transformOrigin: from } as CSSProperties}>{child}</g>
);
/** Every pattern overdraws past the top, bottom and right of its canvas, so it always meets the banner's edges. */
const ART: Record<Pattern, (L: string, w: number) => ReactNode> = {
  // Home: stepped bands of upright bars, each band starting further left, then running solid (the reference).
  pages: (L) => Array.from({ length: 4 }, (_, r) => {
    const y = r * 60, widths = [16, 34, 26, 44, 20, 52, 30];
    let x = 150 - r * 44;
    const out: ReactNode[] = [];
    widths.forEach((w, k) => { if (k % 2 === 0) out.push(bar(`${r}-${k}`, x, y, w, 60, L, "growX", r * 0.7 + k * 0.25, "center")); x += w; });
    out.push(<rect key={`${r}-s`} x={x} y={y} width={W} height={60} fill={L} />);
    return <g key={r}>{out}</g>;
  }),
  // Sign: rows of light bands that run straight, then kink into a slant; each row slants less (reference 1).
  signature: (L, w) => {
    const cw = 64, rows = [{ y: 0, h: 96, k: 0.3 }, { y: 96, h: 64, k: 0.22 }, { y: 160, h: 46, k: 0.16 }, { y: 206, h: 34, k: 0.1 }];
    return rows.flatMap(({ y, h, k }, r) => Array.from({ length: Math.ceil(w / cw) + 2 }, (_, i) => {
      const x = i * cw - cw, a = cw * 0.52, b = cw * 0.48;
      return part(`${r}-${i}`, x, y, cw, h, "shift", r * 0.4 + i * 0.08, "left",
        <polygon points={`${x},${y} ${x + a},${y} ${x + cw},${y + h * (1 - k * 1.6)} ${x + cw},${y + h} ${x + b},${y + h} ${x},${y + h * k}`} fill={L} />);
    }));
  },  // Edit: a strip of upright bars of mixed widths, its top half slid sideways against the bottom.
  lines: (L) => {
    const widths = [10, 34, 18, 46, 12, 28, 40, 16, 30, 22, 50, 14, 26, 38, 12, 44];
    const row = (y: number, x0: number, key: string, d: number) => {
      let x = x0;
      return widths.map((w, k) => { const out = k % 2 ? null : bar(`${key}${k}`, x, y, w, 120, L, "growX", d + k * 0.2, "center"); x += w; return out; });
    };
    return [...row(0, 130, "a", 0), ...row(120, 80, "b", 0.5)];
  },  // Organize pages: a checker of blocks with some cells pushed out of line, as if being moved.
  grid: (L) => Array.from({ length: 8 * 4 }, (_, n) => {
    const c = n % 8, r = Math.floor(n / 8);
    if ((c + r) % 2) return null;
    const off = (c * 5 + r * 3) % 7 === 0;
    return bar(n, 40 + c * 55, r * 60, 55, 60, L, off ? "shift" : "growX", n * 0.2, "center");
  }),
  // Merge PDFs: two combs of square blocks, from the top and from the bottom, interlocking like a finger joint.
  merge: (L, w) => {
    const p = 48, finger = p / 2, band = 40, reach = 150;
    const comb = (top: boolean) => {
      const y0 = top ? 0 : H - band, fy = top ? band : H - reach;
      const out: ReactNode[] = [<rect key="band" x={-p} y={y0} width={w + 2 * p} height={band} fill={L} />];
      for (let x = top ? -p : -p + finger; x < w + p; x += p) out.push(<rect key={x} x={x} y={fy} width={finger} height={reach - band} fill={L} />);
      return out;
    };
    return [
      part("top", 0, 0, w, reach, "meshDown", 0, "top", <g>{comb(true)}</g>),
      part("bottom", 0, H - reach, w, reach, "meshUp", 0, "bottom", <g>{comb(false)}</g>),
    ];
  },
  // My signatures: a grid of chevron flags, each a square with a point to the right and below (reference 2).
  loops: (L, w) => {
    const g = 40, cols = Math.ceil(w / g) + 1;
    return Array.from({ length: 6 * cols }, (_, n) => {
      const c = n % cols, r = Math.floor(n / cols), x = c * g, y = r * g, h = g / 2;
      return part(n, x, y, g, g, "shift", (c + r) * 0.06, "left",
        <polygon points={`${x},${y} ${x + h},${y} ${x + g},${y + h} ${x + h},${y + h} ${x + h},${y + g} ${x},${y + h}`} fill={L} />);
    });
  },  // Saved drafts: offset blocks stacked into a staircase, like sheets kept in a pile.
  stack: (L) => Array.from({ length: 6 }, (_, k) => (
    bar(k, 80 + k * 54, 200 - k * 36, W, H, L, "growX", k * 0.35, "right")
  )),
  // Privacy & storage: a staggered wall of blocks, each course starting further left.
  vault: (L) => Array.from({ length: 6 }, (_, n) => {
    const r = n - 1, y = r * 60, start = 260 - r * 50 + (r % 2) * 30;
    return <g key={n}>{Array.from({ length: 9 }, (_, k) => bar(`${r}-${k}`, start + k * 70, y + 4, 52, 52, L, "growX", r * 0.5 + k * 0.15, k % 2 ? "left" : "right"))}</g>;
  }),  // Help & limits: a field of plus-shaped blocks, the sign for aid, a few growing out of the grid.
  buoy: (L) => Array.from({ length: 6 * 10 }, (_, n) => {
    const c = n % 10 - 1, r = Math.floor(n / 10) - 1, cx = 60 + c * 56, cy = 30 + r * 60, big = (((c + r * 3) % 5) + 5) % 5 === 0;
    const a = big ? 40 : 24, t = big ? 14 : 8;
    return <g key={n}>
      {bar(`h${n}`, cx - a / 2, cy - t / 2, a, t, L, "growX", n * 0.13, "center")}
      {bar(`v${n}`, cx - t / 2, cy - a / 2, t, a, L, "growY", n * 0.13 + 0.3, "center")}
    </g>;
  }),
};

/** "#RRGGBB" as the 0–1 channels feColorMatrix wants. */
const rgb = (hex: string) => [1, 3, 5].map((i) => (parseInt(hex.slice(i, i + 2), 16) / 255).toFixed(3));

/** The drawing (right side) and one even grain over the whole banner. Place inside a positioned banner. */
export function BannerArt({ pattern }: { pattern: Pattern }) {
  const { ink, light } = bannerColors(pattern);
  const [lr, lg, lb] = rgb(light), [ir, ig, ib] = rgb(ink);
  return (
    <>
      <div className={s.art} aria-hidden data-pattern={pattern}>
        <svg className={s.fill} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMid slice">{ART[pattern](light, W)}</svg>
      </div>
      {/* One grain, same density everywhere: ink specks wear the light shapes, light specks dust the ground. */}
      <svg className={s.grain} aria-hidden data-pattern={pattern} width="100%" height="100%">
        <filter id="tcg-grain-ink" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4" stitchTiles="stitch" />
          <feColorMatrix values={`0 0 0 0 ${ir}  0 0 0 0 ${ig}  0 0 0 0 ${ib}  0 0 0 -3.2 1.15`} />
        </filter>
        <filter id="tcg-grain-light" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="12" stitchTiles="stitch" />
          <feColorMatrix values={`0 0 0 0 ${lr}  0 0 0 0 ${lg}  0 0 0 0 ${lb}  0 0 0 -3.2 1.15`} />
        </filter>
        <rect width="100%" height="100%" filter="url(#tcg-grain-ink)" opacity=".45" />
        <rect width="100%" height="100%" filter="url(#tcg-grain-light)" opacity=".3" />
      </svg>
    </>
  );
}
