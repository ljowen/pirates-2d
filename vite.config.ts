import { defineConfig } from 'vite'

// A GitHub Pages project site is served from /<repo>/, not from the root, so
// built asset URLs need that prefix or every script 404s. The dev server stays
// at / — `base` is applied for the build only, so nothing about running
// locally changes. The Cloudflare build (`npm run build:sea`) passes
// `--base=/`, which overrides this.
const REPO = '/pirates-2d/'

// The open sea's server, as `npm run sea` (wrangler dev) runs it locally.
const SEA = 'http://localhost:8787'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO : '/',
  server: {
    port: 5173,
    open: false,
    // Accounts and the sea's WebSocket go to the Worker; everything else is Vite's.
    proxy: {
      '/api': SEA,
      '/ws': { target: SEA, ws: true },
    },
  },
  build: { target: 'es2022' },
}))
