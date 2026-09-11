import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: process.env.NODE_ENV === 'production' ? '/evopay-vscu-frontend/' : '/',
  server: {
    host: '0.0.0.0',
    hmr: {
      protocol: 'ws',  
      host: 'localhost',
      port: 5173,
    },
    allowedHosts: true, 
  },
})