import { lazy, Suspense, useEffect, useState, type ComponentType } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { FileUp } from "lucide-react";
import { AppShell } from "./components/shell/AppShell";
import { ButtonLink, Toast } from "./components/ui";
import { ErrorBoundary } from "./components/shell/ErrorBoundary";
import { SCREENS } from "./routes";
import Home from "./pages/Home";
import { DocumentProvider, useDocument } from "./state/document";
import { PreviewBar } from "./preview/PreviewBar";
import { usePreview } from "./preview/mode";
import Placeholder, { NotFound } from "./pages/Placeholder";
import SitemapPage from "./pages/SitemapPage";
import StylePage from "./pages/StylePage";
import Signatures from "./pages/Signatures";
import Drafts from "./pages/Drafts";
import Settings from "./pages/Settings";
import Help from "./pages/Help";

// PDF.js and pdf-lib are large, so the editor screens load only when opened.
const Editor = lazy(() => import("./pages/editor/Editor"));
const Review = lazy(() => import("./pages/editor/Review"));
const Organize = lazy(() => import("./pages/organize/Organize"));
const Merge = lazy(() => import("./pages/merge/Merge"));

// Screens with a real page. Every other routed screen renders the placeholder.
const PAGES: Record<string, ComponentType> = { "/": Home, "/editor": Editor, "/edit": Editor, "/editor/review": Review, "/organize": Organize, "/merge": Merge, "/signatures": Signatures, "/drafts": Drafts, "/settings": Settings, "/help": Help, "/style": StylePage, "/sitemap": SitemapPage };

function Loading() {
  return <p role="status" style={{ color: "var(--text-muted)" }}>Loading the editor…</p>;
}

function HeaderActions() {
  const { pathname } = useLocation();
  if (pathname === "/" || pathname.startsWith("/editor") || pathname === "/edit" || pathname === "/organize" || pathname === "/merge") return null;
  return <ButtonLink to="/" variant="primary" icon={<FileUp aria-hidden />}>Open a PDF</ButtonLink>;
}

function Shell() {
  // Preview mode unlocks every screen: planned ones get their placeholder, shown inside the shell.
  const preview = usePreview();
  const { doc } = useDocument();
  const { pathname } = useLocation();
  // With a document open, Sign and Edit use their own Docs-style header instead of the top bar.
  const bare = !!doc && (pathname === "/editor" || pathname === "/edit");
  return (
    <>
      {preview && <PreviewBar />}
      <AppShell actions={<HeaderActions />} bare={bare}>
        {/* A crash in one screen shows a recovery message there; the sidebar keeps working. */}
        <ErrorBoundary key={pathname}>
          <Routes>
            {SCREENS.filter((x) => preview || (x.status !== "planned" && !x.bare)).map((x) => {
              const Page = PAGES[x.path] ?? Placeholder;
              return <Route key={x.path} path={x.path} element={<Suspense fallback={<Loading />}><Page /></Suspense>} />;
            })}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </ErrorBoundary>
      </AppShell>
      <UnexpectedErrors />
    </>
  );
}

/**
 * Last line of defence: anything that fails outside a handled action (a background task, an event
 * handler) shows a short notice instead of failing silently. Every user action has its own message;
 * this only catches what slips through. Browser noise (ResizeObserver loops, cancelled renders) is ignored.
 */
function UnexpectedErrors() {
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const ignore = (e: unknown) => {
      const text = e instanceof Error ? `${e.name} ${e.message}` : String(e ?? "");
      return /ResizeObserver|RenderingCancelled|AbortError/.test(text);
    };
    const show = (e: unknown) => {
      if (ignore(e)) return;
      console.error("Unhandled error", e);
      setMessage("Something didn't work. Try that again; your document is still open in this tab.");
    };
    const onError = (e: ErrorEvent) => show(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => show(e.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => { window.removeEventListener("error", onError); window.removeEventListener("unhandledrejection", onRejection); };
  }, []);
  return <Toast message={message} onDone={() => setMessage(null)} />;
}

export default function App() {
  // The outer boundary covers the shell itself (sidebar, staging bar), in case it ever fails to render.
  return <ErrorBoundary><BrowserRouter><DocumentProvider><Shell /></DocumentProvider></BrowserRouter></ErrorBoundary>;
}
