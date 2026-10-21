// Google Fonts bundled with the app (all under the SIL Open Font License, which allows bundling).
// When a PDF's text uses one of them, the editor shows and exports that font instead of a standard
// stand-in. Files are part of the build and fetched only when a document uses that style, so nothing
// is requested from Google and documents still never leave the device.

export type GoogleFontId =
  | "roboto" | "open-sans" | "lato" | "montserrat" | "inter" | "poppins" | "source-sans-3"
  | "noto-sans" | "noto-serif" | "merriweather" | "playfair-display" | "roboto-mono";

type Entry = { id: GoogleFontId; label: string; file: string; kind: "sans" | "serif" | "mono"; match: RegExp };

/** `match` runs on the PDF font's name, lowercased with spaces, dashes and underscores removed. */
export const GOOGLE_FONTS: Entry[] = [
  { id: "roboto-mono", label: "Roboto Mono", file: "RobotoMono", kind: "mono", match: /robotomono/ },
  { id: "roboto", label: "Roboto", file: "Roboto", kind: "sans", match: /roboto/ },
  { id: "open-sans", label: "Open Sans", file: "OpenSans", kind: "sans", match: /opensans/ },
  { id: "lato", label: "Lato", file: "Lato", kind: "sans", match: /^lato|lato(regular|bold|italic|black|light)/ },
  { id: "montserrat", label: "Montserrat", file: "Montserrat", kind: "sans", match: /montserrat/ },
  { id: "inter", label: "Inter", file: "Inter", kind: "sans", match: /^inter(?!state)|interdisplay|intervariable/ },
  { id: "poppins", label: "Poppins", file: "Poppins", kind: "sans", match: /poppins/ },
  { id: "source-sans-3", label: "Source Sans 3", file: "SourceSans3", kind: "sans", match: /sourcesans/ },
  { id: "noto-serif", label: "Noto Serif", file: "NotoSerif", kind: "serif", match: /notoserif/ },
  { id: "noto-sans", label: "Noto Sans", file: "NotoSans", kind: "sans", match: /notosans/ },
  { id: "merriweather", label: "Merriweather", file: "Merriweather", kind: "serif", match: /merriweather/ },
  { id: "playfair-display", label: "Playfair Display", file: "PlayfairDisplay", kind: "serif", match: /playfair/ },
];

const STYLE_DIR = ["400Regular", "700Bold", "400Regular_Italic", "700Bold_Italic"] as const;

// Asset URLs for every bundled style. Vite copies the files into the build; nothing loads until asked for.
const FILES = import.meta.glob(
  "/node_modules/@expo-google-fonts/*/{400Regular,700Bold,400Regular_Italic,700Bold_Italic}/*.ttf",
  { query: "?url", import: "default", eager: true },
) as Record<string, string>;

/** The Google font a PDF font name refers to, if it's one we bundle. Subset prefixes like "ABCDEF+" are ignored. */
export function googleFontFor(pdfFontName: string): GoogleFontId | null {
  const key = pdfFontName.replace(/^[A-Z]{6}\+/, "").toLowerCase().replace(/[\s_-]/g, "");
  return GOOGLE_FONTS.find((f) => f.match.test(key))?.id ?? null;
}

export const googleFont = (id: GoogleFontId) => GOOGLE_FONTS.find((f) => f.id === id)!;

/** URL of one style's file. */
export function fontUrl(id: GoogleFontId, bold: boolean, italic: boolean) {
  const f = googleFont(id), dir = STYLE_DIR[(bold ? 1 : 0) + (italic ? 2 : 0)];
  const url = FILES[`/node_modules/@expo-google-fonts/${id}/${dir}/${f.file}_${dir}.ttf`];
  if (!url) throw new Error(`${f.label} ${dir} isn't bundled`);
  return url;
}

/** The font's bytes, for embedding on export. Cached per style. */
const bytesCache = new Map<string, Promise<ArrayBuffer>>();
export function fontBytes(id: GoogleFontId, bold: boolean, italic: boolean) {
  const url = fontUrl(id, bold, italic);
  let p = bytesCache.get(url);
  if (!p) {
    p = fetch(url).then((r) => { if (!r.ok) throw new Error(`Couldn't load the ${googleFont(id).label} font`); return r.arrayBuffer(); });
    p.catch(() => bytesCache.delete(url));
    bytesCache.set(url, p);
  }
  return p;
}

/** Makes the style available to the page (for on-screen text and width measuring). Safe to call repeatedly. */
const loaded = new Map<string, Promise<void>>();
export function loadWebFont(id: GoogleFontId, bold = false, italic = false): Promise<void> {
  const key = `${id}:${bold}:${italic}`;
  let p = loaded.get(key);
  if (!p) {
    const face = new FontFace(googleFont(id).label, `url(${fontUrl(id, bold, italic)})`, { weight: bold ? "700" : "400", style: italic ? "italic" : "normal" });
    p = face.load().then((f) => { document.fonts.add(f); });
    p.catch(() => loaded.delete(key));
    loaded.set(key, p);
  }
  return p;
}
