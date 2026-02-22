import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// Tauri packages are provided at runtime by the desktop shell.
// In the browser dev server they are not installed, so we shim them with
// no-ops so Vite can transform tauriSaveAdapter.ts without a 500 error.
// (The IS_TAURI guard in saveManager.ts means these stubs are never called.)
const TAURI_PKGS = [
  '@tauri-apps/plugin-fs',
  '@tauri-apps/plugin-dialog',
  '@tauri-apps/api/core',
]

const tauriDevShim = {
  name: 'tauri-dev-shim',
  resolveId(id: string) {
    if (TAURI_PKGS.some((pkg) => id === pkg || id.startsWith(pkg + '/'))) {
      return '\0tauri-shim'
    }
  },
  load(id: string) {
    if (id === '\0tauri-shim') {
      return [
        'export const readTextFile = () => Promise.resolve("")',
        'export const writeTextFile = () => Promise.resolve()',
        'export const exists = () => Promise.resolve(false)',
        'export const remove = () => Promise.resolve()',
        'export const mkdir = () => Promise.resolve()',
        'export const BaseDirectory = { Document: 9, Home: 3, AppData: 4, AppLocalData: 4 }',
        'export const open = () => Promise.resolve(null)',
        'export const invoke = () => Promise.resolve(null)',
        'export default {}',
      ].join('\n')
    }
  },
}

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // Only active during `vite dev` — production Tauri build externalizes instead
    ...(command === 'serve' ? [tauriDevShim] : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Tauri-specific packages are conditionally loaded at runtime only;
      // externalize them so the web build doesn't try to bundle them.
      external: TAURI_PKGS,
    },
  },
}))
