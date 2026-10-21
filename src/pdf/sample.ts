// A sample contract for preview mode, generated in the browser so it works without test files.
// Box positions live in sample-layout.ts so preview steps can place fields on them without loading pdf-lib.
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { SAMPLE_BOXES, SAMPLE_PAGE } from "./sample-layout";
export { SAMPLE_BOXES, SAMPLE_NAME, SAMPLE_PAGE } from "./sample-layout";

const CLAUSES = [
  "Scope. The consultant provides the services described in Schedule A.",
  "Fees. The client pays the fees in Schedule B within 30 days of invoice.",
  "Term. This agreement starts on the signing date and runs for 12 months.",
  "Confidentiality. Each party keeps the other's information confidential.",
  "Ownership. Work product transfers to the client on full payment.",
  "Termination. Either party may end this agreement with 30 days' notice.",
  "Liability. Neither party is liable for indirect or consequential loss.",
  "Governing law. This agreement is governed by the laws of Quebec.",
];

export async function makeSamplePdf() {
  const doc = await PDFDocument.create();
  doc.setTitle("Sample service agreement");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.1, 0.15, 0.3), muted = rgb(0.4, 0.43, 0.5), line = rgb(0.7, 0.3, 0.05);
  const box = (page: ReturnType<typeof doc.addPage>, b: { x: number; y: number; w: number; h: number }, label: string) => {
    page.drawRectangle({ x: b.x, y: b.y, width: b.w, height: b.h, borderColor: line, borderWidth: 1 });
    page.drawText(label, { x: b.x, y: b.y - 12, size: 8, font, color: muted });
  };

  for (let n = 1; n <= 3; n++) {
    const page = doc.addPage([SAMPLE_PAGE.width, SAMPLE_PAGE.height]);
    page.drawText("SAMPLE · FOR PREVIEW ONLY", { x: 54, y: 760, size: 8, font: bold, color: muted });
    page.drawText(n === 1 ? "Service agreement" : n === 2 ? "Terms" : "Signatures", { x: 54, y: 720, size: 22, font: bold, color: ink });
    if (n === 1) {
      page.drawText("Between Talkerstein Consulting Group (the consultant)", { x: 54, y: 690, size: 11, font });
      page.drawText("and Sample Client Inc. (the client).", { x: 54, y: 674, size: 11, font });
    }
    const start = n === 1 ? 0 : 4;
    CLAUSES.slice(start, start + 4).forEach((c, i) => page.drawText(`${start + i + 1}. ${c}`, { x: 54, y: (n === 1 ? 630 : 680) - i * 26, size: 10.5, font }));
    if (n === 2) {
      const a = SAMPLE_BOXES.agree;
      page.drawRectangle({ x: a.x, y: a.y, width: a.w, height: a.h, borderColor: ink, borderWidth: 1 });
      page.drawText("I have read and agree to the terms above.", { x: a.x + 22, y: a.y + 3, size: 10.5, font });
    }
    if (n === 3) {
      box(page, SAMPLE_BOXES.signature, "Client signature");
      box(page, SAMPLE_BOXES.date, "Date");
      box(page, SAMPLE_BOXES.name, "Printed name");
    }
    box(page, SAMPLE_BOXES.initials, "Initials");
    page.drawText(`Page ${n} of 3`, { x: 54, y: 40, size: 8, font, color: muted });
  }
  return doc.save();
}
