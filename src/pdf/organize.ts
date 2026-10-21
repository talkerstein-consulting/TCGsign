// Page organizing with pdf-lib only (no PDF.js), so it also runs under Node for tests.
import { PDFDocument, degrees } from "@cantoo/pdf-lib";

/** A page in the new document: which original page (0-based) and its final rotation in degrees. */
export type OrganizedPage = { index: number; rotation: number };

/**
 * Builds a new PDF from the kept pages, in order. Pages are copied into a fresh document,
 * so a deleted page's content isn't left behind in the file (pdf-lib's removePage only
 * unlinks the page and keeps its content streams). Document-level extras such as bookmarks
 * and the form-field tree don't carry over, which the screen warns about.
 */
export async function organizePdf(original: Uint8Array, pages: OrganizedPage[], password?: string) {
  const src = await PDFDocument.load(original.slice(), { password, updateMetadata: false });
  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(src, pages.map((p) => p.index));
  copied.forEach((page, i) => {
    page.setRotation(degrees(((pages[i].rotation % 360) + 360) % 360));
    out.addPage(page);
  });
  const title = src.getTitle(), author = src.getAuthor(), subject = src.getSubject();
  if (title) out.setTitle(title);
  if (author) out.setAuthor(author);
  if (subject) out.setSubject(subject);
  return out.save();
}

/** Counts interactive form fields, which don't survive organizing. */
export async function countFormFields(original: Uint8Array, password?: string) {
  try {
    const src = await PDFDocument.load(original.slice(), { password, updateMetadata: false });
    return src.getForm().getFields().length;
  } catch {
    return 0;
  }
}
