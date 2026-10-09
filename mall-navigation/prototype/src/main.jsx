import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted UI fonts (same-origin files bundled by Vite; never a font CDN). index.css adds the 600 weight.
import '@fontsource/readex-pro/latin-400.css'
import '@fontsource/readex-pro/arabic-400.css'
import '@fontsource/readex-pro/latin-700.css'
import '@fontsource/readex-pro/arabic-700.css'
import './index.css'
import './ui/app.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
