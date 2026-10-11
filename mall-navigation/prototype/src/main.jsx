import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted UI fonts (same-origin files bundled by Vite; never a font CDN): index.css imports Readex Pro
// 300 / 400 / 500 and the bundled 600 faces.
import './index.css'
import './ui/app.css'
import App from './App.jsx'

const root = createRoot(document.getElementById('root'))
// v0.5: ?screen=dashboard is the mall dashboard, its own lazy entry (no 3D, no shopper app)
if (new URLSearchParams(location.search).get('screen') === 'dashboard') {
  import('./dashboard/DashboardApp.jsx').then(({ DashboardApp }) =>
    root.render(
      <StrictMode>
        <DashboardApp />
      </StrictMode>,
    ),
  )
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
