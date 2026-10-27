import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LangProvider, useT } from './lib/i18n/useT.js';
import { SnackbarProvider } from './components/Snackbar.jsx';
import { AppProvider, useApp } from './hooks/useApp.jsx';
import { SessionProvider, useSession } from './hooks/useSession.jsx';
import { APP } from './config/app.js';
import { routerBase } from './lib/url.js';
import { demoMode } from './lib/firebase.js';

const S01Splash = lazy(() => import('./screens/S01Splash.jsx'));
const S02Login = lazy(() => import('./screens/S02Login.jsx'));
const Join = lazy(() => import('./screens/Join.jsx'));
const CreateSalon = lazy(() => import('./screens/CreateSalon.jsx'));
const S03Home = lazy(() => import('./screens/S03Home.jsx'));
const S04Capture = lazy(() => import('./screens/S04Capture.jsx'));
const S05Profile = lazy(() => import('./screens/S05Profile.jsx'));
const S06History = lazy(() => import('./screens/S06History.jsx'));
const S07Goals = lazy(() => import('./screens/S07Goals.jsx'));
const S08Looks = lazy(() => import('./screens/S08Looks.jsx'));
const S09ColorLab = lazy(() => import('./screens/S09ColorLab.jsx'));
const S10CutStudio = lazy(() => import('./screens/S10CutStudio.jsx'));
const S11Compare = lazy(() => import('./screens/S11Compare.jsx'));
const S12AiConsent = lazy(() => import('./screens/S12AiConsent.jsx'));
const S13AiLook = lazy(() => import('./screens/S13AiLook.jsx'));
const S14Agreement = lazy(() => import('./screens/S14Agreement.jsx'));
const S15Done = lazy(() => import('./screens/S15Done.jsx'));
const S16LookCodeEntry = lazy(() => import('./screens/S16LookCodeEntry.jsx'));
const S17Dashboard = lazy(() => import('./screens/S17Dashboard.jsx'));
const S18Catalog = lazy(() => import('./screens/S18Catalog.jsx'));
const S19SwatchScan = lazy(() => import('./screens/S19SwatchScan.jsx'));
const S20Products = lazy(() => import('./screens/S20Products.jsx'));
const S21Staff = lazy(() => import('./screens/S21Staff.jsx'));
const S22Settings = lazy(() => import('./screens/S22Settings.jsx'));
const S23Reports = lazy(() => import('./screens/S23Reports.jsx'));
const S24TryAtHome = lazy(() => import('./screens/S24TryAtHome.jsx'));
const S25LookCodeResult = lazy(() => import('./screens/S25LookCodeResult.jsx'));

function Loading() {
  const { lang } = useT();
  return (
    <div className="grid min-h-dvh place-items-center bg-bg" aria-busy>
      <div className="text-center">
        <div className="font-display text-3xl text-plum">{lang === 'ar' ? APP.nameAr : APP.name}</div>
        <div className="mx-auto mt-4 h-0.5 w-16 bg-clay" style={{ animation: 'pulse-soft 1.2s infinite' }} />
      </div>
    </div>
  );
}

/** GitHub Pages demo build: one line on every screen so nobody mistakes it for the live app. */
function DemoBanner() {
  const { t } = useT();
  if (!demoMode) return null;
  return (
    <div role="note" className="bg-plum px-4 py-1.5 text-center text-xs font-semibold text-onplum">
      {t('demo.banner')}
    </div>
  );
}

/** Staff-only routes: signed in (not anonymous) and an active staff member of the selected salon. */
function StaffOnly({ children, manager = false }) {
  const app = useApp();
  const loc = useLocation();
  if (app.loading) return <Loading />;
  if (!app.staffUser) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!app.salonId || app.me === null) return <Navigate to="/" replace />;
  if (!app.isStaff) return <Loading />;
  if (manager && !app.isManager) return <Navigate to="/home" replace />;
  return children;
}

/** Consultation screens: an active session (chair for staff, or the customer's Try at home). */
function InSession({ children }) {
  const session = useSession();
  const app = useApp();
  if (session.active && session.mode === 'home') return children;
  return <StaffOnly>{session.active ? children : <Navigate to={app.isStaff ? '/home' : '/'} replace />}</StaffOnly>;
}

function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<S01Splash />} />
        <Route path="/login" element={<S02Login />} />
        <Route path="/join" element={<Join />} />
        <Route path="/create-salon" element={<CreateSalon />} />
        <Route path="/home" element={<StaffOnly><S03Home /></StaffOnly>} />
        <Route path="/code" element={<StaffOnly><S16LookCodeEntry /></StaffOnly>} />
        <Route path="/capture" element={<InSession><S04Capture /></InSession>} />
        <Route path="/profile" element={<InSession><S05Profile /></InSession>} />
        <Route path="/history" element={<InSession><S06History /></InSession>} />
        <Route path="/goals" element={<InSession><S07Goals /></InSession>} />
        <Route path="/looks" element={<InSession><S08Looks /></InSession>} />
        <Route path="/color" element={<InSession><S09ColorLab /></InSession>} />
        <Route path="/cut" element={<InSession><S10CutStudio /></InSession>} />
        <Route path="/compare" element={<InSession><S11Compare /></InSession>} />
        <Route path="/ai/consent" element={<StaffOnly><InSession><S12AiConsent /></InSession></StaffOnly>} />
        <Route path="/ai/result" element={<StaffOnly><InSession><S13AiLook /></InSession></StaffOnly>} />
        <Route path="/agreement" element={<StaffOnly><InSession><S14Agreement /></InSession></StaffOnly>} />
        <Route path="/done" element={<StaffOnly><S15Done /></StaffOnly>} />
        <Route path="/owner" element={<StaffOnly manager><S17Dashboard /></StaffOnly>} />
        <Route path="/owner/catalog" element={<StaffOnly manager><S18Catalog /></StaffOnly>} />
        <Route path="/owner/swatch-scan" element={<StaffOnly manager><S19SwatchScan /></StaffOnly>} />
        <Route path="/owner/products" element={<StaffOnly manager><S20Products /></StaffOnly>} />
        <Route path="/owner/staff" element={<StaffOnly manager><S21Staff /></StaffOnly>} />
        <Route path="/owner/settings" element={<StaffOnly manager><S22Settings /></StaffOnly>} />
        <Route path="/owner/reports" element={<StaffOnly manager><S23Reports /></StaffOnly>} />
        <Route path="/t/:salonId" element={<S24TryAtHome />} />
        <Route path="/t/:salonId/code" element={<S25LookCodeResult />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <LangProvider>
      <SnackbarProvider>
        <BrowserRouter basename={routerBase || undefined}>
          <AppProvider>
            <SessionProvider>
              <DemoBanner />
              <AppRoutes />
            </SessionProvider>
          </AppProvider>
        </BrowserRouter>
      </SnackbarProvider>
    </LangProvider>
  );
}
