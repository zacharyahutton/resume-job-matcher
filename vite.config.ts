import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { handleGroq, type GroqProxyInput } from './api/groq'

/** Serve /api/groq in `vite` and `vite preview` with the same handler Vercel runs. */
function fitlineGroqDevApi(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      const pathname = (req.url || '').split('?')[0]
      if (pathname !== '/api/groq') {
        next()
        return
      }

      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      })
      req.on('end', () => {
        void (async () => {
          const raw = Buffer.concat(chunks)
          let body: unknown
          if (raw.length > 0) {
            const text = raw.toString('utf8')
            try {
              body = JSON.parse(text) as unknown
            } catch {
              body = text
            }
          }
          const result = await handleGroq({
            method: req.method || 'GET',
            headers: req.headers as GroqProxyInput['headers'],
            body,
            rawBodyLength: raw.length,
          })
          res.statusCode = result.status
          for (const [key, value] of Object.entries(result.headers)) {
            res.setHeader(key, value)
          }
          res.end(result.body)
        })().catch(() => {
          if (res.writableEnded) return
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ error: 'proxy_failed' }))
        })
      })
    })
  }

  return {
    name: 'fitline-groq-dev-api',
    configureServer(server) {
      attach(server.middlewares)
    },
    configurePreviewServer(server) {
      attach(server.middlewares)
    },
  }
}

export default defineConfig({
  plugins: [react(), fitlineGroqDevApi()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    watch: {
      // Windows locks binary assets and crashes Vite's FSWatcher (EBUSY).
      ignored: [
        '**/public/assets/templates/**',
        '**/public/fonts/**',
        '**/scripts/fonts/**',
        '**/*.docx',
        '**/*.ttf',
      ],
    },
  },
})
