import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Prototipo: usa el normalizador de la API para validar códigos y armar
      // la etiqueta de lomo. Al conectar con el backend pasará a un paquete
      // compartido.
      '@classification': fileURLToPath(new URL('../api/src/classification', import.meta.url)),
    },
  },
  server: {
    // Permite leer el parser y el plano de ejemplo que viven en apps/api.
    fs: { allow: ['..'] },
  },
})
