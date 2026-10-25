import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Spinner } from './components/ui'
import Landing from './pages/Landing'
import CatalogPage from './pages/CatalogPage'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Privacy from './pages/Privacy'
import AdminLayout from './admin/AdminLayout'

// Heavy parts load on demand: the AI studio (MediaPipe + WebGL) and admin screens.
const TryOnStudio = lazy(() => import('./features/tryon/TryOnStudio'))
const Dashboard = lazy(() => import('./admin/Dashboard'))
const Requests = lazy(() => import('./admin/Requests'))
const Looks = lazy(() => import('./admin/Looks'))
const Inventory = lazy(() => import('./admin/Inventory'))
const Services = lazy(() => import('./admin/Services'))
const Reports = lazy(() => import('./admin/Reports'))
const Staff = lazy(() => import('./admin/Staff'))
const Settings = lazy(() => import('./admin/Settings'))
const Audit = lazy(() => import('./admin/Audit'))

function Loading({ dark = false }) {
  return (
    <div className={`flex min-h-[60dvh] items-center justify-center ${dark ? 'fixed inset-0 bg-night text-white' : 'text-ink-500'}`}>
      <Spinner size={30} />
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/try"
        element={
          <Suspense fallback={<Loading dark />}>
            <TryOnStudio />
          </Suspense>
        }
      />
      <Route path="/catalog" element={<CatalogPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Suspense fallback={<Loading />}><Dashboard /></Suspense>} />
        <Route path="requests" element={<Suspense fallback={<Loading />}><Requests /></Suspense>} />
        <Route path="looks" element={<Suspense fallback={<Loading />}><Looks /></Suspense>} />
        <Route path="inventory" element={<Suspense fallback={<Loading />}><Inventory /></Suspense>} />
        <Route path="services" element={<Suspense fallback={<Loading />}><Services /></Suspense>} />
        <Route path="reports" element={<Suspense fallback={<Loading />}><Reports /></Suspense>} />
        <Route path="staff" element={<Suspense fallback={<Loading />}><Staff /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<Loading />}><Settings /></Suspense>} />
        <Route path="audit" element={<Suspense fallback={<Loading />}><Audit /></Suspense>} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
