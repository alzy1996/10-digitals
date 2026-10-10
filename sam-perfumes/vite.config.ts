import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base defaults to '/' (Firebase / root hosting); GitHub Pages passes
// VITE_BASE=/10-digitals/ so assets resolve from the repo sub-path.
// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
})
