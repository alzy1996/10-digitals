import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { I18nProvider } from './lib/i18n/useT.js';
import { AuthProvider } from './state/AuthContext.jsx';
import { SnackbarProvider } from './components/Snackbar.jsx';
import ScreenFallback from './components/ScreenFallback.jsx';
import ShopRoute from './state/ShopRoute.jsx';
import HomeRoute from './state/HomeRoute.jsx';
import { RequireRole } from './state/ShopContext.jsx';

const S01ShopPicker = lazy(() => import('./screens/S01ShopPicker.jsx'));
const S02Login = lazy(() => import('./screens/S02Login.jsx'));
const CreateShop = lazy(() => import('./screens/CreateShop.jsx'));
const S03BarberHome = lazy(() => import('./screens/S03BarberHome.jsx'));
const S04Capture = lazy(() => import('./screens/S04Capture.jsx'));
const S05Profile = lazy(() => import('./screens/S05Profile.jsx'));
const S06Questions = lazy(() => import('./screens/S06Questions.jsx'));
const S07Styles = lazy(() => import('./screens/S07Styles.jsx'));
const S08Studio = lazy(() => import('./screens/S08Studio.jsx'));
const S09Compare = lazy(() => import('./screens/S09Compare.jsx'));
const S10AiConsent = lazy(() => import('./screens/S10AiConsent.jsx'));
const S11AiFinalLook = lazy(() => import('./screens/S11AiFinalLook.jsx'));
const S12CutCard = lazy(() => import('./screens/S12CutCard.jsx'));
const S13Done = lazy(() => import('./screens/S13Done.jsx'));
const S14LookCodeEntry = lazy(() => import('./screens/S14LookCodeEntry.jsx'));
const S15OwnerDashboard = lazy(() => import('./screens/S15OwnerDashboard.jsx'));
const S16CatalogManager = lazy(() => import('./screens/S16CatalogManager.jsx'));
const S17Products = lazy(() => import('./screens/S17Products.jsx'));
const S18Staff = lazy(() => import('./screens/S18Staff.jsx'));
const S19Settings = lazy(() => import('./screens/S19Settings.jsx'));
const S20Reports = lazy(() => import('./screens/S20Reports.jsx'));
const S21TryAtHome = lazy(() => import('./screens/S21TryAtHome.jsx'));
const S22LookCodeResult = lazy(() => import('./screens/S22LookCodeResult.jsx'));
const NotFound = lazy(() => import('./screens/NotFound.jsx'));

const MANAGE = ['owner', 'manager'];
const OWNER = ['owner'];

export default function App() {
  return (
    <I18nProvider>
      <SnackbarProvider>
        <AuthProvider>
          <BrowserRouter>
            <Suspense fallback={<ScreenFallback />}>
              <Routes>
                <Route path="/" element={<S01ShopPicker />} />
                <Route path="/login" element={<S02Login />} />
                <Route path="/join/:shopId" element={<S02Login join />} />
                <Route path="/create-shop" element={<CreateShop />} />

                <Route path="/s/:shopId" element={<ShopRoute />}>
                  <Route index element={<S03BarberHome />} />
                  <Route path="capture" element={<S04Capture />} />
                  <Route path="profile" element={<S05Profile />} />
                  <Route path="questions" element={<S06Questions />} />
                  <Route path="styles" element={<S07Styles />} />
                  <Route path="studio" element={<S08Studio />} />
                  <Route path="compare" element={<S09Compare />} />
                  <Route path="ai-consent" element={<S10AiConsent />} />
                  <Route path="ai-result" element={<S11AiFinalLook />} />
                  <Route path="cut-card" element={<S12CutCard />} />
                  <Route path="done" element={<S13Done />} />
                  <Route path="look-code" element={<S14LookCodeEntry />} />
                  <Route path="owner" element={<RequireRole roles={MANAGE}><S15OwnerDashboard /></RequireRole>} />
                  <Route path="owner/catalog" element={<RequireRole roles={MANAGE}><S16CatalogManager /></RequireRole>} />
                  <Route path="owner/products" element={<RequireRole roles={MANAGE}><S17Products /></RequireRole>} />
                  <Route path="owner/staff" element={<RequireRole roles={OWNER}><S18Staff /></RequireRole>} />
                  <Route path="owner/settings" element={<RequireRole roles={OWNER}><S19Settings /></RequireRole>} />
                  <Route path="owner/reports" element={<RequireRole roles={MANAGE}><S20Reports /></RequireRole>} />
                </Route>

                <Route path="/try/:shopId" element={<HomeRoute />}>
                  <Route index element={<S21TryAtHome />} />
                  <Route path="capture" element={<S04Capture />} />
                  <Route path="profile" element={<S05Profile />} />
                  <Route path="styles" element={<S07Styles />} />
                  <Route path="studio" element={<S08Studio />} />
                  <Route path="code" element={<S22LookCodeResult />} />
                </Route>

                <Route path="/index.html" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AuthProvider>
      </SnackbarProvider>
    </I18nProvider>
  );
}
