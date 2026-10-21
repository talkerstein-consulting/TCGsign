// Layout of the generated sample contract (see sample.ts). No dependencies, so it is safe in the main bundle.

/** Letter, in points. */
export const SAMPLE_PAGE = { width: 612, height: 792 };
export const SAMPLE_NAME = "Sample service agreement.pdf";

/** Boxes in PDF points (origin bottom-left): page number and rectangle. */
export const SAMPLE_BOXES = {
  initials: { x: 504, y: 36, w: 72, h: 40 }, // on every page
  agree: { page: 2, x: 54, y: 300, w: 14, h: 14 },
  signature: { page: 3, x: 54, y: 180, w: 230, h: 56 },
  name: { page: 3, x: 54, y: 120, w: 230, h: 22 },
  date: { page: 3, x: 330, y: 180, w: 150, h: 22 },
};
