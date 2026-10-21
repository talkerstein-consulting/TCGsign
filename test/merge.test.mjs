// Checks mergePdfs against the fixtures: node test/merge.test.mjs  (run make-fixtures.mjs first)
// Every output page must match its source page: decoded content, MediaBox and rotation.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream } from "@cantoo/pdf-lib";
import { mergePdfs } from "../src/pdf/merge.ts";

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const latin1 = (u8) => new TextDecoder("latin1").decode(u8);

function pageContent(page) {
  const c = page.node.get(PDFName.of("Contents"));
  const refs = c instanceof PDFArray ? c.asArray() : [c];
  return refs.map((r) => latin1(decodePDFRawStream(page.doc.context.lookup(r)).decode())).join("\n");
}
const box = (p) => { const b = p.getMediaBox(); return [b.x, b.y, b.width, b.height].join(","); };

const inputs = [
  { name: "contract.pdf" },
  { name: "rotated-mixed.pdf" },
  { name: "locked-test1234.pdf", password: "test1234" },
];
const sources = inputs.map((x) => ({ bytes: fixture(x.name), password: x.password }));
const srcDocs = await Promise.all(inputs.map((x, i) => PDFDocument.load(sources[i].bytes, { password: x.password })));
const expected = srcDocs.flatMap((d, i) => d.getPages().map((page, n) => ({ page, label: `${inputs[i].name} p${n + 1}` })));

const bytes = await mergePdfs(sources);
const out = await PDFDocument.load(bytes);
assert.equal(out.getPageCount(), 8, "page count is 3 + 4 + 1");
assert.equal(expected.length, 8);
assert.equal(out.isEncrypted, false, "merged file is not encrypted");
expected.forEach(({ page: a, label }, i) => {
  const b = out.getPage(i);
  assert.equal(b.getRotation().angle, a.getRotation().angle, `page ${i + 1} (${label}) rotation`);
  assert.equal(box(b), box(a), `page ${i + 1} (${label}) MediaBox`);
  assert.equal(pageContent(b), pageContent(a), `page ${i + 1} (${label}) content`);
  console.log(`ok  page ${i + 1} = ${label} (rotation ${b.getRotation().angle})`);
});

// Order follows the input order.
const reversed = await PDFDocument.load(await mergePdfs([...sources].reverse()));
assert.equal(pageContent(reversed.getPage(0)), pageContent(srcDocs[2].getPage(0)), "reversed: first page comes from the last input");

// A wrong password fails instead of producing a broken file.
await assert.rejects(mergePdfs([sources[0], { bytes: sources[2].bytes, password: "nope" }]), "wrong password is rejected");
console.log(`all merge checks passed (${bytes.length} bytes)`);
