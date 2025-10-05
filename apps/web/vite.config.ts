import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'     // ← 通常版に変更
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'express-middleware',
      configureServer(server: ViteDevServer) {
        (async () => {
          const { default: app } = await import('./server/index.ts')
          server.middlewares.use(app)
        })()
      }
    }
  ],
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } }
})
