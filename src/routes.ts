// The sitemap. The router, top bar, phone menu and tabs, and the /sitemap page all read this list,
// so a screen is added in one place. Phases follow the scope review on ticket #110.
import type { LucideIcon } from "lucide-react";
import { matchPath } from "react-router";
import {
  Combine, FileClock, FilePen, FileSearch, Files, House, LayoutGrid, LifeBuoy, ListChecks,
  Palette, Network, PenLine, Send, ShieldCheck, SquarePen, SquareSlash,
} from "lucide-react";

export type Phase = 1 | 2 | 3 | "internal";
/** built: real screen · stub: route exists, screen not built · planned: no route yet */
export type Status = "built" | "stub" | "planned";

export type Screen = {
  path: string;
  label: string;
  group: "Documents" | "Tools" | "On this device" | "Remote signing" | "Help" | "Internal";
  icon: LucideIcon;
  phase: Phase;
  status: Status;
  purpose: string;
  /** Main components the screen is built from (names match the style page). */
  components: string[];
  /** Listed in the phone and tablet menu (the top bar shows the main tools). Recipient links and child screens are not. */
  nav?: boolean;
  /** One of the four phone tabs. */
  tab?: boolean;
  /** Parent route, for the sitemap tree and breadcrumbs. */
  parent?: string;
  /** Rendered outside the app shell (no top bar), e.g. a recipient's signing link. */
  bare?: boolean;
};

export const SCREENS: Screen[] = [
  { path: "/", label: "Home", group: "Documents", icon: House, phase: 1, status: "built", nav: true, tab: true,
    purpose: "Open a PDF from the device, see drafts saved on this device, and jump to a tool.",
    components: ["PageHeader", "DropZone", "StatGrid", "DocumentRow", "PrivacyNote"] },
  { path: "/editor", label: "Sign", group: "Documents", icon: FilePen, phase: 1, status: "built", nav: true, tab: true,
    purpose: "Place your signature and initials (Signature, with its ⋯ menu for initials), plus name and date, and sign. A pinned bar shows progress and the next step.",
    components: ["EditorToolbar", "PageView", "FieldBox", "BottomSheet", "SignatureCreator", "Modal"] },
  { path: "/edit", label: "Edit", group: "Documents", icon: SquarePen, phase: 1, status: "built", nav: true, tab: true,
    purpose: "Change text already on the page (text layer, or OCR for scans) one line at a time, and add text, dates, checkboxes and images, with a Google Docs-style toolbar. Same document as Sign; switch freely.",
    components: ["FormatBar", "PageView", "FieldBox", "CoverBox", "BottomSheet"] },
  { path: "/editor/review", label: "Review & download", group: "Documents", icon: ListChecks, phase: 1, status: "built", parent: "/editor",
    purpose: "Check every page, warn about already-signed or protected files, then download or share the new PDF.",
    components: ["PageView", "FieldBox", "Alert", "StatGrid", "Button", "Toast"] },
  { path: "/organize", label: "Organize pages", group: "Tools", icon: LayoutGrid, phase: 1, status: "built", nav: true,
    purpose: "Rotate, reorder and delete pages, then download a new PDF or carry on to Sign.",
    components: ["PageThumb", "ThumbGrid", "IconButton", "Alert", "Toast"] },
  { path: "/merge", label: "Merge PDFs", group: "Tools", icon: Combine, phase: 1, status: "built", nav: true,
    purpose: "Combine several PDFs into one, in the order you choose, unlocking password-protected ones on the way. Download it or carry on to Sign.",
    components: ["DropZone", "IconButton", "Field", "Alert", "Toast"] },
  { path: "/edit-text", label: "Edit text", group: "Tools", icon: FileSearch, phase: 2, status: "planned",
    purpose: "True in-place editing: reflow paragraphs and remove the original words from the file (Edit covers them over). Needs a licensed SDK, decided at the Phase 2 gate.",
    components: [] },
  { path: "/redact", label: "Redact", group: "Tools", icon: SquareSlash, phase: 2, status: "planned",
    purpose: "Permanently remove text and images. Real removal, not a black box drawn on top.",
    components: [] },
  { path: "/drafts", label: "Saved drafts", group: "On this device", icon: FileClock, phase: 1, status: "built", nav: true,
    purpose: "Drafts you chose to keep on this device, with expiry dates, export and delete.",
    components: ["DocumentRow", "StorageMeter", "EmptyState", "Modal"] },
  { path: "/signatures", label: "My signatures", group: "On this device", icon: PenLine, phase: 1, status: "built", nav: true, tab: true,
    purpose: "Draw, type or upload a signature and initials. Kept only if you choose to save them.",
    components: ["SignaturePad", "SignatureCard", "Segmented", "Modal"] },
  { path: "/send", label: "Send for signature", group: "Remote signing", icon: Send, phase: 3, status: "planned",
    purpose: "Add recipients, set signing order, preview as recipient, and send through the signing vendor.",
    components: [] },
  { path: "/sent", label: "Sent", group: "Remote signing", icon: Files, phase: 3, status: "planned",
    purpose: "Status of sent documents: sent, viewed, partly signed, completed, declined, expired.",
    components: [] },
  { path: "/s/:token", label: "Recipient signing", group: "Remote signing", icon: FilePen, phase: 3, status: "planned", bare: true,
    purpose: "What a recipient sees from the emailed link. No account or install.",
    components: [] },
  { path: "/settings", label: "Privacy & storage", group: "Help", icon: ShieldCheck, phase: 1, status: "built", nav: true,
    purpose: "What this device keeps, draft expiry, and clearing everything.",
    components: ["StorageMeter", "Checkbox", "PrivacyNote", "Button"] },
  { path: "/help", label: "Help & limits", group: "Help", icon: LifeBuoy, phase: 1, status: "built", nav: true,
    purpose: "Supported browsers, file size and page limits, and what the tool can't do.",
    components: ["Tabs", "InlineError"] },
  { path: "/style", label: "Style page", group: "Internal", icon: Palette, phase: "internal", status: "built",
    purpose: "Every component and token, for building and reviewing screens.",
    components: [] },
  { path: "/sitemap", label: "Sitemap", group: "Internal", icon: Network, phase: "internal", status: "built",
    purpose: "This map: every screen, its phase and build status.",
    components: [] },
];

export const GROUPS = ["Documents", "Tools", "On this device", "Remote signing", "Help", "Internal"] as const;

export const screenFor = (pathname: string) =>
  SCREENS.find((s) => matchPath({ path: s.path, end: true }, pathname)) ?? SCREENS.find((s) => s.path !== "/" && pathname.startsWith(s.path));
