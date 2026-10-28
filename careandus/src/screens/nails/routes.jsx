// nails service: the routes, entry points and owner tabs the shared app mounts.
// Contract (used by App.jsx, S03Home, OwnerLayout, S24TryAtHome):
//   routes({ StaffOnly, InSession }) -> <Route> elements (paths start with /nails, Try at home under /t/:salonId/nails)
//   ENTRY       chair flow start for staff (session already started with section 'nails')
//   HOME_ENTRY  customer Try at home start, (salonId) => path, or null
//   OWNER_TABS  [{ to, labelKey, icon }] extra owner screens for this service
// Every screen is lazy so the nail AI, the shade library and the shaders stay out of the app shell.
import { lazy } from 'react';
import { Route } from 'react-router-dom';

const NailChair = lazy(() => import('./NailChair.jsx'));
const NailAgreement = lazy(() => import('./NailAgreement.jsx'));
const NailDone = lazy(() => import('./NailDone.jsx'));
const NailHome = lazy(() => import('./NailHome.jsx'));
const NailPolishes = lazy(() => import('./owner/NailPolishes.jsx'));
const NailLooks = lazy(() => import('./owner/NailLooks.jsx'));
const NailRequests = lazy(() => import('./owner/NailRequests.jsx'));

export function routes({ StaffOnly, InSession }) {
  return [
    <Route key="nails-chair" path="/nails" element={<StaffOnly><InSession><NailChair /></InSession></StaffOnly>} />,
    <Route key="nails-agreement" path="/nails/agreement" element={<StaffOnly><InSession><NailAgreement /></InSession></StaffOnly>} />,
    <Route key="nails-done" path="/nails/done" element={<StaffOnly><InSession><NailDone /></InSession></StaffOnly>} />,
    <Route key="nails-polishes" path="/nails/owner/polishes" element={<StaffOnly manager><NailPolishes /></StaffOnly>} />,
    <Route key="nails-looks" path="/nails/owner/looks" element={<StaffOnly manager><NailLooks /></StaffOnly>} />,
    <Route key="nails-requests" path="/nails/owner/requests" element={<StaffOnly manager><NailRequests /></StaffOnly>} />,
    <Route key="nails-home" path="/t/:salonId/nails" element={<NailHome />} />,
  ];
}

export const ENTRY = '/nails';
export const HOME_ENTRY = (salonId) => `/t/${salonId}/nails`;
export const OWNER_TABS = [
  { to: '/nails/owner/polishes', labelKey: 'nails.owner_polishes', icon: 'swatch' },
  { to: '/nails/owner/looks', labelKey: 'nails.owner_looks', icon: 'grid' },
  { to: '/nails/owner/requests', labelKey: 'nails.owner_requests', icon: 'list' },
];
