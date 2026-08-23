import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 4096,
  },
  optimizeDeps: {
    exclude: ['@dimforge/rapier3d-compat'],
  },
})
