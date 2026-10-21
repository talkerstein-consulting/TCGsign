import type { ReactNode } from "react";
import { CalendarDays, CheckSquare, ImageIcon, MousePointer2, PenLine, Signature, Type } from "lucide-react";
import type { FieldKind } from "../../pdf/engine";

export type ToolId = "select" | FieldKind;

export const TOOLS: { id: ToolId; label: string; icon: ReactNode }[] = [
  { id: "select", label: "Select", icon: <MousePointer2 aria-hidden /> },
  { id: "signature", label: "Signature", icon: <Signature aria-hidden /> },
  { id: "initials", label: "Initials", icon: <PenLine aria-hidden /> },
  { id: "text", label: "Text", icon: <Type aria-hidden /> },
  { id: "date", label: "Date", icon: <CalendarDays aria-hidden /> },
  { id: "check", label: "Checkbox", icon: <CheckSquare aria-hidden /> },
  { id: "image", label: "Image", icon: <ImageIcon aria-hidden /> },
];

const byId = (ids: ToolId[]) => ids.map((id) => TOOLS.find((t) => t.id === id)!);
/** Sign tab: Signature (initials live in its ⋯ menu) and Select. Text and dates are on Edit. */
export const SIGN_TOOLS = byId(["signature", "select"]);
/** Edit tab: everything that isn't signing. */
export const EDIT_TOOLS = byId(["select", "text", "date", "check", "image"]);
/** Phone sheets have no ⋯ menu, so Sign lists Initials as its own tile. */
export const SHEET_TOOLS = { sign: byId(["signature", "initials"]), edit: byId(["text", "date", "check", "image"]) };
export type EditorMode = keyof typeof SHEET_TOOLS;

export const FIELD_LABEL: Record<FieldKind, string> = {
  signature: "Signature", initials: "Initials", text: "Text", date: "Date", check: "Checkbox", image: "Image",
};

/** Default size in points when a field is dropped on the page. */
export const FIELD_SIZE: Record<FieldKind, [number, number]> = {
  signature: [170, 48], initials: [64, 40], text: [180, 20], date: [110, 20], check: [16, 16], image: [120, 80],
};
