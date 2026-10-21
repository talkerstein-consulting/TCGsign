import react from '@vitejs/plugin-react'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

// Dev server only: lets browser tests save an exported PDF to test/out/ so it can be
// checked in other PDF viewers. Not part of the build; the app itself never uploads.
function saveTestOutput(): Plugin {
  return {
    name: 'save-test-output',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__test-out', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end(); return }
        const name = basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'out.pdf')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          mkdirSync('test/out', { recursive: true })
          writeFileSync(`test/out/${name}`, Buffer.concat(chunks))
          res.end('saved')
        })
      })
    },
  }
}

// OCR runs Tesseract in the browser. Its worker, engine and English model are served from
// /ocr/ on this site (dev) and copied into the build, so nothing is fetched from a CDN.
// Only the LSTM engines are shipped; the browser loads the one variant it supports.
const OCR_FILES: Record<string, string> = {
  'worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js',
  'eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
}

function ocrAssets(): Plugin {
  return {
    name: 'ocr-assets',
    configureServer(server) {
      server.middlewares.use('/ocr', (req, res, next) => {
        const file = OCR_FILES[basename(new URL(req.url ?? '', 'http://x').pathname)]
        if (!file) return next()
        res.setHeader('Content-Type', file.endsWith('.gz') ? 'application/octet-stream' : 'text/javascript')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      for (const [name, file] of Object.entries(OCR_FILES)) {
        this.emitFile({ type: 'asset', fileName: `ocr/${name}`, source: readFileSync(file) })
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), saveTestOutput(), ocrAssets()],
  // The project lives on a drive where file-change events are sometimes missed, which left
  // the dev server serving stale modules. Polling is slower but always sees the edit.
  server: { watch: { usePolling: true, interval: 300 } },
})
