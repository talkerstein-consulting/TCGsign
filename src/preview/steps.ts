// The preview steps: every screen in sitemap order, with the editor shown in each of its states.
// Built from SCREENS, so a new screen shows up here without another edit.
import { SCREENS, type Screen } from "../routes";

/** What the open document should be when this step shows. */
export type DocState = "keep" | "none" | "sample" | "signed";
export type Step = { id: string; label: string; group: string; path: string; doc: DocState; screen: Screen };

const EDITOR_STATES: { id: string; label: string; doc: DocState }[] = [
  { id: "editor-empty", label: "No document", doc: "none" },
  { id: "editor-sample", label: "Ready to sign", doc: "sample" },
  { id: "editor-signed", label: "All signed", doc: "signed" },
];

const GROUP_FOR: Record<string, string> = { Documents: "Sign & edit", "Remote signing": "Planned" };

export const STEPS: Step[] = SCREENS.flatMap((screen): Step[] => {
  const group = screen.status === "planned" ? "Planned" : GROUP_FOR[screen.group] ?? screen.group;
  if (screen.path === "/editor") return EDITOR_STATES.map((s) => ({ ...s, label: `Sign · ${s.label}`, group, path: "/editor", screen }));
  const path = screen.path.replace(":token", "sample");
  const doc: DocState = screen.path === "/editor/review" ? "signed" : screen.path === "/organize" || screen.path === "/edit" ? "sample" : "keep";
  return [{ id: screen.path, label: screen.label, group, path, doc, screen }];
}).sort((a, b) => order(a.group) - order(b.group));

function order(group: string) {
  const i = ["Sign & edit", "Tools", "On this device", "Help", "Planned", "Internal"].indexOf(group);
  return i < 0 ? 99 : i;
}

export const STEP_GROUPS = [...new Set(STEPS.map((s) => s.group))];
