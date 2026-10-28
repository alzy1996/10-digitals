// beard service: the routes, entry points and owner tabs the shared app mounts.
// Contract (used by App.jsx, S03Home, OwnerLayout, S24TryAtHome):
//   routes({ StaffOnly, InSession }) -> <Route> elements (paths start with /beard)
//   ENTRY       chair flow start for staff (session already started with section 'beard')
//   HOME_ENTRY  customer Try at home start, (salonId) => path, or null
//   OWNER_TABS  [{ to, labelKey, icon }] extra owner screens for this service
// Every screen is lazy: the beard AI and three.js load only inside these chunks.
import { lazy } from 'react';
import { Navigate, Route } from 'react-router-dom';

const ChairLayout = lazy(() => import('./layouts.jsx').then((m) => ({ default: m.ChairLayout })));
const HomeLayout = lazy(() => import('./layouts.jsx').then((m) => ({ default: m.HomeLayout })));
const HomeGuard = lazy(() => import('./layouts.jsx').then((m) => ({ default: m.HomeGuard })));
const S04Capture = lazy(() => import('./S04Capture.jsx'));
const S05Profile = lazy(() => import('./S05Profile.jsx'));
const S06Questions = lazy(() => import('./S06Questions.jsx'));
const S07Styles = lazy(() => import('./S07Styles.jsx'));
const S08Studio = lazy(() => import('./S08Studio.jsx'));
const S09Compare = lazy(() => import('./S09Compare.jsx'));
const S12CutCard = lazy(() => import('./S12CutCard.jsx'));
const S13Done = lazy(() => import('./S13Done.jsx'));
const S16CatalogManager = lazy(() => import('./S16CatalogManager.jsx'));
const GuardChartScreen = lazy(() => import('./owner/GuardChartScreen.jsx'));
const S21TryAtHome = lazy(() => import('./S21TryAtHome.jsx'));
const S22LookCodeResult = lazy(() => import('./S22LookCodeResult.jsx'));

export function routes({ StaffOnly, InSession }) {
  return [
    <Route
      key="beard-chair"
      path="/beard"
      element={
        <InSession>
          <ChairLayout />
        </InSession>
      }
    >
      <Route index element={<Navigate to="capture" replace />} />
      <Route path="capture" element={<S04Capture />} />
      <Route path="profile" element={<S05Profile />} />
      <Route path="questions" element={<S06Questions />} />
      <Route path="styles" element={<S07Styles />} />
      <Route path="studio" element={<S08Studio />} />
      <Route path="compare" element={<S09Compare />} />
      <Route path="cut-card" element={<S12CutCard />} />
      <Route path="done" element={<S13Done />} />
    </Route>,
    <Route key="beard-owner-styles" path="/owner/beard/styles" element={<StaffOnly manager><S16CatalogManager /></StaffOnly>} />,
    <Route key="beard-owner-guards" path="/owner/beard/guards" element={<StaffOnly manager><GuardChartScreen /></StaffOnly>} />,
    <Route key="beard-home" path="/t/:salonId/beard" element={<HomeLayout />}>
      <Route index element={<S21TryAtHome />} />
      <Route element={<HomeGuard />}>
        <Route path="capture" element={<S04Capture />} />
        <Route path="profile" element={<S05Profile />} />
        <Route path="styles" element={<S07Styles />} />
        <Route path="studio" element={<S08Studio />} />
        <Route path="code" element={<S22LookCodeResult />} />
      </Route>
    </Route>,
  ];
}

export const ENTRY = '/beard/capture';
export const HOME_ENTRY = (salonId) => `/t/${encodeURIComponent(salonId)}/beard`;
export const OWNER_TABS = [
  { to: '/owner/beard/styles', labelKey: 'beard.nav.styles', icon: 'face' },
  { to: '/owner/beard/guards', labelKey: 'beard.nav.guards', icon: 'ruler' },
];
