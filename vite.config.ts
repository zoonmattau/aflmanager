import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      // Tauri-specific packages are conditionally loaded at runtime only;
      // externalize them so the web build doesn't try to bundle them.
      external: [
        '@tauri-apps/plugin-fs',
        '@tauri-apps/plugin-dialog',
        '@tauri-apps/api/core',
      ],
    },
  },
})
