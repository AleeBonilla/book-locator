import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    // Los paquetes del repositorio (@bjff/classification) se usan desde su
    // código fuente, sin compilarlos antes.
    conditions: ['source', ...defaultClientConditions],
  },
  server: {
    // La web llama a la API en /api (lib/http.ts): mismo origen, así la cookie
    // de sesión viaja sin CORS. Vite reenvía esas peticiones a la API sin el
    // prefijo.
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // Desde WSL, los archivos del disco de Windows (/mnt/c/…) no avisan cuando
    // cambian: hay que revisarlos periódicamente para que Vite recargue.
    watch: { usePolling: process.cwd().startsWith('/mnt/') },
  },
})
