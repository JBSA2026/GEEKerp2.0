import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { fileURLToPath } from 'url'

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), './src')

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': srcDir },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    css: false,
    env: {
      VITE_API_URL: 'http://localhost:8000',
    },
  },
})
