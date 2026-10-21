// Writes test/fixtures/google-fonts.pdf: one line each in Roboto, Merriweather and Montserrat Bold,
// embedded the way design tools do (subset, with the ABCDEF+ prefix), to check the editor picks them up.
import { readFileSync, writeFileSync } from "node:fs";
import { PDFDocument, rgb } from "@cantoo/pdf-lib";
import fontkit from "@cantoo/fontkit";

const font = (pkg, dir, file) => readFileSync(`node_modules/@expo-google-fonts/${pkg}/${dir}/${file}_${dir}.ttf`);

const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const page = pdf.addPage([612, 792]);
const lines = [
  ["Roboto: Payment is due within 30 days.", await pdf.embedFont(font("roboto", "400Regular", "Roboto"), { subset: true }), 16],
  ["Merriweather: This agreement starts today.", await pdf.embedFont(font("merriweather", "400Regular", "Merriweather"), { subset: true }), 16],
  ["Montserrat Bold: Signed by both parties", await pdf.embedFont(font("montserrat", "700Bold", "Montserrat"), { subset: true }), 16],
];
lines.forEach(([text, f, size], i) => page.drawText(text, { x: 72, y: 700 - i * 48, size, font: f, color: rgb(0.1, 0.1, 0.12) }));
writeFileSync("test/fixtures/google-fonts.pdf", await pdf.save());
console.log("wrote test/fixtures/google-fonts.pdf");
