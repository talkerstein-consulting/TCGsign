// Preview mode: a black stepper over the app that walks through every screen, including planned
// ones, with a sample document loaded where a screen needs one. On by default in every build while
// the app is in staging; ?preview=0 or the × hides it for the tab, and ?preview brings it back.
import { useSyncExternalStore } from "react";

const KEY = "tcg-preview";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("preview")) sessionStorage.setItem(KEY, url.searchParams.get("preview") === "0" ? "off" : "on");
    const saved = sessionStorage.getItem(KEY);
    if (saved) return saved === "on";
  } catch { /* storage blocked: fall back to the default */ }
  return true;
}

let on = read();

export function setPreview(value: boolean) {
  on = value;
  try { sessionStorage.setItem(KEY, value ? "on" : "off"); } catch { /* not remembered; fine */ }
  listeners.forEach((l) => l());
}

export function usePreview() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => on);
}
