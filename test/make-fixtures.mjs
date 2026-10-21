// Builds the PDFs used to test the editor: node test/make-fixtures.mjs
// Covers the cases the review called out: rotated and mixed-size pages, a MediaBox that
// doesn't start at 0,0, a password-protected file, an already-signed file and a damaged one.
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, PDFName, PDFNumber, PDFString, StandardFonts, degrees, rgb } from "@cantoo/pdf-lib";

const out = new URL("./fixtures/", import.meta.url);
mkdirSync(out, { recursive: true });
const save = async (name, doc) => writeFileSync(new URL(name, out), await doc.save());

async function textPage(doc, size, title, rotate = 0) {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage(size);
  const { height } = page.getSize();
  page.drawText(title, { x: 54, y: height - 72, size: 20, font: bold, color: rgb(0.1, 0.15, 0.3) });
  for (let i = 0; i < 18; i++) {
    page.drawText(`${i + 1}. The parties agree to the terms set out in this section of the agreement.`, { x: 54, y: height - 120 - i * 22, size: 11, font });
  }
  // Marks to check field placement against: a box at a known spot near the bottom left.
  page.drawRectangle({ x: 54, y: 90, width: 200, height: 40, borderColor: rgb(0.7, 0.3, 0.05), borderWidth: 1 });
  page.drawText("Sign here", { x: 58, y: 76, size: 9, font });
  page.drawLine({ start: { x: 54, y: 0 }, end: { x: 54, y: 20 }, thickness: 2 }); // left-edge tick
  if (rotate) page.setRotation(degrees(rotate));
  return page;
}

// 1. Plain 3-page Letter contract
{
  const doc = await PDFDocument.create();
  for (let p = 1; p <= 3; p++) await textPage(doc, [612, 792], `Service agreement — page ${p}`);
  await save("contract.pdf", doc);
}

// 2. Rotated and mixed pages: /Rotate 90, A4 landscape /Rotate 270, offset MediaBox, /Rotate 180
{
  const doc = await PDFDocument.create();
  await textPage(doc, [612, 792], "Rotated 90", 90);
  await textPage(doc, [842, 595], "A4 landscape, rotated 270", 270);
  const p3 = await textPage(doc, [612, 792], "Offset MediaBox");
  p3.setMediaBox(-100, -50, 612, 792); // origin not at 0,0
  await textPage(doc, [420, 595], "A5, rotated 180", 180);
  await save("rotated-mixed.pdf", doc);
}

// 3. Password protected (user password: test1234)
{
  const doc = await PDFDocument.create();
  await textPage(doc, [612, 792], "Locked document");
  doc.encrypt({ userPassword: "test1234", ownerPassword: "owner-test", permissions: { printing: "highResolution", modifying: true } });
  await save("locked-test1234.pdf", doc);
}

// 4. Already signed: carries a signature dictionary with /ByteRange (not a valid signature;
//    enough for detection and for checking that export appends instead of rewriting).
{
  const doc = await PDFDocument.create();
  await textPage(doc, [612, 792], "Previously signed document");
  const sig = doc.context.obj({
    Type: "Sig", Filter: "Adobe.PPKLite", SubFilter: "adbe.pkcs7.detached",
    ByteRange: [0, 0, 0, 0], Contents: PDFString.of("0000"), Name: PDFString.of("Test signer"),
  });
  const ref = doc.context.register(sig);
  doc.catalog.set(PDFName.of("TestSignature"), ref);
  doc.catalog.set(PDFName.of("Perms"), doc.context.obj({ Count: PDFNumber.of(1) }));
  await save("signed.pdf", doc);
}

// 5. Not a PDF
writeFileSync(new URL("damaged.pdf", out), "%PDF-1.7\nthis file was cut off half way thr");

console.log("fixtures written to", out.pathname);
