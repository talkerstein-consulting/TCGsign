// Pages with /Rotate whose text reads upright on screen (like landscape pages saved as rotated
// portrait), to test editing and removing text on turned pages: node test/make-rotated-text.mjs
import { writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, degrees } from "@cantoo/pdf-lib";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const rot of [90, 180, 270]) {
  const page = doc.addPage([612, 792]);
  page.setRotation(degrees(rot));
  // Display (top-left origin) to user space for this rotation, so text runs left to right on screen.
  const W = 612, H = 792;
  const toUser = (dx, dy) => rot === 90 ? [dy, dx] : rot === 180 ? [W - dx, dy] : [W - dy, H - dx];
  const say = (text, dx, dy, size) => { const [x, y] = toUser(dx, dy); page.drawText(text, { x, y, size, font, rotate: degrees(rot) }); };
  say(`Turned ${rot} title`, 60, 80, 20);
  for (let i = 1; i <= 3; i++) say(`Line ${i} on the page turned ${rot} degrees.`, 60, 110 + i * 24, 12);
}
writeFileSync(new URL("./fixtures/rotated-text.pdf", import.meta.url), await doc.save());
console.log("saved");
