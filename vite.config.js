import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: true, // Listen on all addresses
    port: 5173
  },
  build: {
    target: 'esnext' // Important for Three.js and modern features
  }
})