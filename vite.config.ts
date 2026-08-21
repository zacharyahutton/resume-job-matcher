import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
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
