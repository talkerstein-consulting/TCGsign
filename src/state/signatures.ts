// Signature and initials the person chose to keep on this device, in IndexedDB.
// Nothing is written unless they turn on "Keep on this device"; turning it off deletes the copy.
import type { FieldImage } from "../pdf/engine";
import { run } from "./idb";

export type SignKind = "signature" | "initials";
export type SavedSign = { kind: SignKind; img: FieldImage; savedAt: number };

/** Saved items, or none when storage is blocked (private windows, cleared site data). */
export async function loadSaved(): Promise<SavedSign[]> {
  try { return await run<SavedSign[]>("signatures", "readonly", (s) => s.getAll()); }
  catch { return []; }
}

export const saveSign = (item: SavedSign) => run("signatures", "readwrite", (s) => s.put(item));
export const deleteSign = (kind: SignKind) => run("signatures", "readwrite", (s) => s.delete(kind));
