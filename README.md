# TCG Sign

Front end for the internal PDF editor and signing tool (Talkerstein ticket #110). It's a static React + TypeScript app with no server and no database. PDFs are meant to stay in the browser.

The styles are ported from the TCG client portal (`230 TCG Client portal/tcgportal-clients`: `workspace-tokens.css`, `portal-workspace.css` and `components/ui`), so both apps share the same tokens and primitives. On desktop the shell uses a navy left sidebar, like the portal. Phones and tablets get a top bar and a menu drawer.

## Run

```bash
npm install
npm run dev
```

## Where things are

- `src/routes.ts` is the sitemap. The router, top bar, phone menu and tabs, and `/sitemap` page all read it.
- `src/styles/tokens.css` holds the colour, type, spacing and radius tokens.
- `src/components/ui` has the shared primitives: buttons, inputs, tabs, badges, alerts, modal, toast and menu.
- `src/components/pdf` has the PDF components: drop zone, document row, page thumbnails, toolbar, placed fields, signature pad, bottom sheet and storage meter.
- `src/components/shell` has the app shell: the desktop sidebar, a top bar and menu drawer on phones and tablets, and phone tabs.
- `/style` shows every component live. `/sitemap` shows every screen with its phase and build status.

## Status

Built: Home, Editor, Review & download, Organize pages, Merge PDFs, My signatures, Saved drafts, Privacy & storage, Help & limits, Style page and Sitemap. That covers every Phase 1 screen. Phase 2 (text editing, redaction) and Phase 3 (remote signing) are listed but not routed until they're approved.

My signatures (`src/pages/Signatures.tsx`) lets you draw, type or upload a signature and initials, then replace or delete them. They're shared with Sign for the tab. Each one has a "Keep on this device" switch that saves it to IndexedDB (`src/state/signatures.ts`), and it loads into Sign next time. Replacing a kept item updates the saved copy, and turning the switch off deletes it. Nothing is saved unless the switch is on. If storage is blocked, as in a private window, the screen says so.

Saved drafts (`src/pages/Drafts.tsx`, `src/state/drafts.ts`) holds a document plus its placed fields in IndexedDB. A draft is saved only when you choose Save draft in Sign or Edit, or Save draft and close. It's deleted 7 days after its last save, and expired drafts are removed when the list loads. Opening a draft brings its fields back, and saving again overwrites it. Review & download opens a draft straight into Review. Password-protected files are stored still encrypted and their password isn't stored, so the file asks for it again. Home shows the latest four drafts, and the Saved drafts screen lists all of them with the browser's storage estimate. Signatures and drafts share one database (`src/state/idb.ts`).

Privacy & storage (`src/pages/Settings.tsx`) shows what the device keeps (drafts and kept signatures), what's never kept, and the browser's storage estimate. Clear everything, after a confirmation checkbox, empties both stores and forgets this tab's signature and initials. The open document stays open but is no longer saved as a draft.

Organize pages (`src/pages/organize`, `src/pdf/organize.ts`) rotates, reorders (drag a page by its handle, or use the toolbar or Alt + arrow keys) and deletes pages. It then downloads a new PDF, or hands the result to Sign with any placed fields moved to follow their pages. Kept pages are copied into a fresh document, so a deleted page's content isn't left inside the file. Bookmarks and the interactive form-field tree don't carry over, and the screen warns when a file has form fields or a digital signature.

Merge PDFs (`src/pages/merge`, `src/pdf/merge.ts`) takes several PDFs and puts them in order (drag handle, arrow buttons or Alt + Up/Down). Password-protected files unlock inline, and damaged files are flagged and left out. It then downloads one combined PDF, or opens it in Sign. The same carry-over limits apply as for Organize: digital signatures and form-field trees don't survive, and the screen says so.

At 1024px and wider, every screen has a navy sidebar on the left with the logo, the page's main action, every screen grouped, and the profile. Below that, a top bar with a menu drawer takes its place, and phones also get bottom tabs. With a document open, Sign and Edit use a header laid out like Google Docs, and on phones and tablets they also drop the top bar. The header has the file name with its save state and a File / Edit / View / Insert / Tools / Help menu bar (`src/components/ui/MenuBar.tsx`). The toolbar sits under it as a rounded bar. On phones the menus are hidden and the Add sheet and bottom tabs stay.

The Editor opens a PDF with PDF.js (legacy build, for Safari 18+). You place signature, initials, text, date, checkbox and image fields, then export a new PDF with `@cantoo/pdf-lib`. Details:

- The open document lives in memory for the tab only (`src/state/document.tsx`), and the original bytes are never modified.
- Fields are stored as fractions of the displayed page. On export, each corner goes through PDF.js's `convertToPdfPoint`, which handles `/Rotate` and MediaBox offsets (`src/pdf/engine.ts`).
- Already-signed files (those with a `/ByteRange`) are saved as an incremental update, so the signed revision stays byte-for-byte intact.
- Password-protected files open with their password. The exported copy is not password protected.
- Fonts: when a PDF's text uses one of 12 bundled Google fonts, Edit shows that font and export embeds it (subset to the characters used). The fonts are Roboto, Open Sans, Lato, Montserrat, Inter, Poppins, Source Sans 3, Noto Sans, Noto Serif, Merriweather, Playfair Display and Roboto Mono, matched by the font name in the PDF (`src/pdf/fonts.ts`). They come from the `@expo-google-fonts/*` packages (SIL Open Font License) with regular, bold, italic and bold italic. Together they add about 16 MB to the build, but each style is fetched only when a document uses it, and nothing is requested from Google. Any other font falls back to Helvetica, Times or Courier, which cover Latin-1 only, so other characters are blocked on Review with an explanation. A bundled font that lacks a character (for example Greek in Merriweather) is reported on export. `node test/make-google-fonts.mjs` writes a fixture with Roboto, Merriweather and Montserrat Bold text.

## Preview bar

A black stepper above the top bar walks through every screen in sitemap order (`src/preview`). Use ‹ › to step, the list to jump, or the white tabs under **All screens**. It works like the client portal's state checker.

- It unlocks every screen, including planned ones, which show their placeholder.
- The editor appears in three states: no document, ready to sign, and all signed. Its states, plus Review and Organize, load a sample contract generated in the browser (`src/pdf/sample.ts`).
- It's on by default in every build while the app is in staging. `?preview=0` or the × hides it for the tab, and `?preview` brings it back. Before going live, set the default in `src/preview/mode.ts` back to `import.meta.env.DEV`.

## Banner

The main screens' headers (`<PageHeader banner="pages" />`) are printed solid in one brand ink (navy or orange) with white text. An abstract drawing in a pale tint of the same ink sits on the right. It's drawn in SVG by `src/components/ui/BannerArt.tsx`. All the drawings share one vocabulary, taken from the stepped-bar reference: square-cornered bars and blocks on a grid. Each one either hints at its screen or is purely abstract:

| Screen | Drawing |
|---|---|
| Home | Stepped bands of bars |
| Sign | Rows of bands that run straight, then kink into a slant |
| Edit | A strip of bars with its top half slid sideways |
| Organize pages | A checker of blocks |
| Merge PDFs | Two combs of square blocks interlocking, like a finger joint |
| My signatures | A grid of chevron flags |
| Saved drafts | A staircase of stacked blocks |
| Privacy & storage | A staggered wall of blocks |
| Help & limits | A field of plus signs |

Every drawing runs flush to the banner's top, bottom and right edges, overdrawing past them so no margin shows while it moves. Bars slowly change length, and the motion stops for people who prefer reduced motion. One even grain covers the whole banner.
## Errors

Every action a person takes reports its own failure in plain words, next to where it happened: opening, saving, deleting, exporting, sharing, adding images, making a signature, and unlocking files in Merge. Beyond that, there are three safety nets:

- **Pages:** a page that can't be drawn says so on the page, with Try again, instead of showing "Loading…" forever. Thumbnails that fail just stay blank.
- **Screens:** each screen is wrapped in an error boundary (`src/components/shell/ErrorBoundary.tsx`). A crash shows "Something went wrong on this screen" with Try again and Go to Home, while the sidebar keeps working. A screen whose code couldn't load, usually because a newer version was deployed, asks for a reload.
- **Everything else:** anything still uncaught (a background task, an event handler) shows a short notice instead of failing silently, and is logged to the console. Browser noise such as ResizeObserver loops and cancelled renders is ignored.
## Testing

```bash
node test/make-fixtures.mjs
```

This writes test PDFs to `test/fixtures/`: a 3-page contract, rotated and mixed-size pages with an offset MediaBox, a password-protected file (`test1234`), an already-signed file and a damaged file. The dev server serves them at `/test/fixtures/…`. In dev only, a `POST /__test-out?name=…` endpoint saves an exported PDF to `test/out/` so you can open it in other viewers.

```bash
node test/organize.test.mjs
```

This checks page organizing against the fixtures: each page's content, size and rotation, plus a scan of every stream to confirm deleted pages' text is gone.

```bash
node test/merge.test.mjs
```

This merges the contract, the rotated file and the password-protected file. It checks that all 8 pages match their sources (content, size, rotation), that input order is respected, and that a wrong password is rejected.
