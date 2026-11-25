import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    watch: {
      // Атомарные записи редакторов могут оставлять временные файлы, которые
      // на Windows блокируются и роняют fs.watch.
      ignored: ['**/.*.tmpdir/**', '**/*.tmp'],
    },
  },
})
