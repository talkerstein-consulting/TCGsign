// Checks organizePdf against the fixtures: node test/organize.test.mjs  (run make-fixtures.mjs first)
// Compares each output page with its source page (decoded content, MediaBox, rotation) and
// scans every stream in the output for text from deleted pages.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "@cantoo/pdf-lib";
import { organizePdf } from "../src/pdf/organize.ts";

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const latin1 = (u8) => new TextDecoder("latin1").decode(u8);

function pageContent(page) {
  const c = page.node.get(PDFName.of("Contents"));
  const refs = c instanceof PDFArray ? c.asArray() : [c];
  return refs.map((r) => latin1(decodePDFRawStream(page.doc.context.lookup(r)).decode())).join("\n");
}
function allStreamsText(doc) {
  let text = "";
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) { try { text += latin1(decodePDFRawStream(obj).decode()); } catch { /* images etc. */ } }
  }
  return text;
}
const box = (p) => { const b = p.getMediaBox(); return [b.x, b.y, b.width, b.height].join(","); };

async function check(name, plan, { password, deletedText = [], keptText = [] } = {}) {
  const original = fixture(name);
  const src = await PDFDocument.load(original, { password });
  const bytes = await organizePdf(original, plan, password);
  const out = await PDFDocument.load(bytes);
  assert.equal(out.getPageCount(), plan.length, `${name}: page count`);
  assert.equal(out.isEncrypted, false, `${name}: output is not encrypted`);
  plan.forEach((p, i) => {
    const a = src.getPage(p.index), b = out.getPage(i);
    assert.equal(b.getRotation().angle, p.rotation, `${name}: page ${i + 1} rotation`);
    assert.equal(box(b), box(a), `${name}: page ${i + 1} MediaBox`);
    assert.equal(pageContent(b), pageContent(a), `${name}: page ${i + 1} content is the source page's`);
  });
  const text = allStreamsText(out);
  for (const t of deletedText) assert.ok(!text.includes(t), `${name}: deleted text "${t}" must not be in the file`);
  for (const t of keptText) assert.ok(text.includes(t), `${name}: kept text "${t}" should be in the file`);
  console.log(`ok  ${name}: ${plan.map((p) => `${p.index + 1}@${p.rotation}`).join(" ")}  (${original.length} → ${bytes.length} bytes)`);
}

// Fixture text is drawn as hex strings by pdf-lib, so search for the hex form (ASCII only;
// the em dash in the contract titles is encoded differently, so match after it).
const hex = (s) => Buffer.from(s, "latin1").toString("hex").toUpperCase();

await check("rotated-mixed.pdf",
  [{ index: 3, rotation: 270 }, { index: 0, rotation: 90 }, { index: 2, rotation: 180 }],
  { deletedText: [hex("A4 landscape, rotated 270")], keptText: [hex("Rotated 90"), hex("Offset MediaBox"), hex("A5, rotated 180")] });
await check("contract.pdf",
  [{ index: 2, rotation: 0 }, { index: 0, rotation: 90 }],
  { deletedText: [hex(" page 2")], keptText: [hex(" page 1"), hex(" page 3")] });
await check("locked-test1234.pdf", [{ index: 0, rotation: 0 }], { password: "test1234", keptText: [hex("Locked document")] });
await check("signed.pdf", [{ index: 0, rotation: 90 }], { keptText: [hex("Previously signed document")] });
console.log("all organize checks passed");
