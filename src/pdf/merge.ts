// Combining PDFs with pdf-lib only (no PDF.js), so it also runs under Node for tests.
import { PDFDocument } from "@cantoo/pdf-lib";

export type MergeSource = { bytes: Uint8Array; password?: string };

/**
 * Copies every page of each source, in order, into one new document. Page size, rotation and
 * inherited attributes come along with each page. Like organizing, only page content is carried:
 * bookmarks, the form-field tree and digital signatures of the sources don't survive.
 */
export async function mergePdfs(sources: MergeSource[]) {
  const out = await PDFDocument.create({ updateMetadata: false });
  for (const { bytes, password } of sources) {
    const src = await PDFDocument.load(bytes.slice(), { password, updateMetadata: false });
    const pages = await out.copyPages(src, src.getPageIndices());
    for (const page of pages) out.addPage(page);
  }
  return out.save();
}
