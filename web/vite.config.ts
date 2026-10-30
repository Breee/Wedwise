import { writeFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// dist/.gitkeep is tracked so `go:embed all:dist` works on a clean checkout;
// Vite empties dist on build, so recreate the marker afterwards.
const keepDist = (): Plugin => ({
  name: 'keep-dist',
  closeBundle: () => writeFileSync('dist/.gitkeep', ''),
})

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss(), keepDist()],
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
})
