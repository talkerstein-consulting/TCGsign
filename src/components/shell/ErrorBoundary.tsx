// Catches a screen that crashes while rendering, so one broken screen doesn't blank the whole app.
// The sidebar stays usable, and the screen offers to try again or go home. A screen that failed to
// load (usually because a newer version was deployed while the tab was open) asks for a reload.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, EmptyState } from "../ui";

/** A lazily loaded screen whose code couldn't be fetched. */
const isLoadError = (e: unknown) =>
  e instanceof Error && /dynamically imported module|Importing a module script failed|Failed to fetch|Loading chunk/i.test(e.message);

/** Give it `key={pathname}` so moving to another screen clears the error. */
type Props = { children: ReactNode };
type State = { error: unknown };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State { return { error }; }

  componentDidCatch(error: unknown, info: ErrorInfo) { console.error("Screen crashed", error, info.componentStack); }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (isLoadError(error)) {
      return (
        <EmptyState icon={<AlertTriangle />} title="This screen couldn't load"
          actions={<Button onClick={() => window.location.reload()}>Reload</Button>}>
          Your connection may have dropped, or a newer version of TCG Sign is available. Reload to continue. Documents you have open in this tab will need opening again.
        </EmptyState>
      );
    }
    return (
      <EmptyState icon={<AlertTriangle />} title="Something went wrong on this screen"
        actions={<>
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
          {/* A plain page load, not a router link: the outer boundary sits outside the router. */}
          <Button variant="secondary" onClick={() => window.location.assign("/")}>Go to Home</Button>
        </>}>
        Your open document is still in this tab, and nothing was uploaded. If it keeps happening, reload the page.
      </EmptyState>
    );
  }
}
