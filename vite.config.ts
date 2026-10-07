/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { serviceWorker } from './scripts/vite-plugin-sw.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker(fileURLToPath(new URL('./src/pwa/sw.template.js', import.meta.url)))],
  build: {
    rolldownOptions: {
      output: {
        // Vendor code changes rarely; keep it in its own long-cached chunk so
        // app updates only re-download our own (small) code on the phone.
        codeSplitting: {
          groups: [
            { name: 'supabase', test: /node_modules[\\/]@supabase/ },
            { name: 'vendor', test: /node_modules/ },
          ],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
})
