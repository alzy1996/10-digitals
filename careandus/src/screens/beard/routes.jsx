// beard service: the routes, entry points and owner tabs the shared app mounts.
// Contract (used by App.jsx, S03Home, OwnerLayout, S24TryAtHome):
//   routes({ StaffOnly, InSession }) -> <Route> elements (paths start with /beard)
//   ENTRY       chair flow start for staff (session already started with section 'beard')
//   HOME_ENTRY  customer Try at home start, (salonId) => path, or null
//   OWNER_TABS  [{ to, labelKey, icon }] extra owner screens for this service
export function routes() {
  return [];
}
export const ENTRY = null;
export const HOME_ENTRY = null;
export const OWNER_TABS = [];
