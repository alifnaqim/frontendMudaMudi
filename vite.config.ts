import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Ini adalah JEMBATAN:
      // Setiap kali React memanggil '/api', dia akan otomatis lari ke XAMPP
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '/muda-mudi/backend'),
      },
    },
  },
})