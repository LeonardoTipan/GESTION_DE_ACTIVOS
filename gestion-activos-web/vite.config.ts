import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // 5173 es el puerto autorizado en Keycloak (redirect URIs) y en el CORS de la API.
    port: 5173,
    strictPort: true,
    // En desarrollo, /api/* se reenvía al backend: el navegador ve un único origen.
    proxy: {
      '/api': process.env.API_PROXY_TARGET ?? 'http://localhost:3000',
    },
  },
})
