import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// The dashboard SPA. Built into ../dist/ui and served by Hono in production,
// so installers never run Vite. In dev (`npm run dev:ui`) the API + SSE stream
// are proxied to the Hono dev server on :4317.
// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    outDir: '../dist/ui',
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:4317', changeOrigin: true },
      '/events': { target: 'http://localhost:4317', changeOrigin: true },
    },
  },
})
