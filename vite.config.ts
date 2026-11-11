import { defineConfig } from 'vite'

// A GitHub Pages project site is served from /<repo>/, not from the root, so
// built asset URLs need that prefix or every script 404s. The dev server stays
// at / — `base` is applied for the build only, so nothing about running
// locally changes.
const REPO = '/pirates-2d/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO : '/',
  server: { port: 5173, open: false },
  build: { target: 'es2022' },
}))
