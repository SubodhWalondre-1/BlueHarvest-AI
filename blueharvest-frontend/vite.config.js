import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Local development targets the FastAPI backend by default. Override with VITE_API_URL
// only when intentionally connecting to another environment.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.VITE_API_URL || 'http://localhost:8000'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiUrl,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  }
})
