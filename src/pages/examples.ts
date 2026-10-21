// Example rows for screens that aren't wired to storage yet. Always labelled "Example data" in the UI.
import type { DraftDoc } from "../components/pdf";

export const EXAMPLE_DRAFTS: DraftDoc[] = [
  { id: "d1", name: "Service agreement – 2026 renewal.pdf", pages: 6, sizeMb: 1.4, savedAt: "today, 9:12 AM", expiresInDays: 7 },
  { id: "d2", name: "Supplier onboarding form.pdf", pages: 3, sizeMb: 0.6, savedAt: "Oct 19", expiresInDays: 5 },
  { id: "d3", name: "Contractor NDA – signed.pdf", pages: 2, sizeMb: 0.3, savedAt: "Oct 15", expiresInDays: 1, signed: true },
];
