// Turns drawn, typed or uploaded signatures into trimmed PNG images for placing on a page.
import type { FieldImage } from "./engine";

export const INK = "#1B2E7A";

/** Crops to the ink plus a small margin. Returns null when the canvas is blank. */
export function trimCanvas(src: HTMLCanvasElement, pad = 8): FieldImage | null {
  const g = src.getContext("2d")!;
  const { width, height } = src;
  const data = g.getImageData(0, 0, width, height).data;
  let top = height, left = width, right = -1, bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < left) left = x; if (x > right) right = x;
        if (y < top) top = y; if (y > bottom) bottom = y;
      }
    }
  }
  if (right < 0) return null;
  left = Math.max(0, left - pad); top = Math.max(0, top - pad);
  right = Math.min(width - 1, right + pad); bottom = Math.min(height - 1, bottom + pad);
  const out = document.createElement("canvas");
  out.width = right - left + 1; out.height = bottom - top + 1;
  out.getContext("2d")!.drawImage(src, left, top, out.width, out.height, 0, 0, out.width, out.height);
  return { src: out.toDataURL("image/png"), width: out.width, height: out.height };
}

/** Renders a typed name in the signature face. Waits for the font so the first render isn't a fallback. */
export async function typedSignature(text: string): Promise<FieldImage | null> {
  if (!text.trim()) return null;
  const font = `96px "Slowly Signature"`;
  await document.fonts.load(font, text);
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  g.font = font;
  const m = g.measureText(text);
  c.width = Math.ceil(m.width + 80); c.height = 220;
  g.font = font; g.fillStyle = INK; g.textBaseline = "alphabetic";
  g.fillText(text, 40, 150);
  return trimCanvas(c);
}

/** Reads an image file. PNG and JPEG pass through; anything else is redrawn as PNG for pdf-lib. */
export async function imageFromFile(file: File): Promise<FieldImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    if (file.type === "image/png" || file.type === "image/jpeg") {
      const src = await new Promise<string>((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(r.result as string); r.onerror = () => fail(r.error);
        r.readAsDataURL(file);
      });
      return { src, width: img.naturalWidth, height: img.naturalHeight };
    }
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d")!.drawImage(img, 0, 0);
    return { src: c.toDataURL("image/png"), width: c.width, height: c.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
