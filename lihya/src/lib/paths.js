// Where the app is served from: '/' on Firebase Hosting, '/10-digitals/' on GitHub Pages.
// Set at build time with LIHYA_BASE (see vite.config.js); every absolute link goes through here.

export const BASE = import.meta.env.BASE_URL || '/';

/** react-router basename: undefined at the domain root, '/10-digitals' under a sub-path. */
export const ROUTER_BASENAME = BASE === '/' ? undefined : BASE.replace(/\/$/, '');

/** URL of a file in public/, for example assetUrl('templates/products-template.csv'). */
export function assetUrl(path) {
  return BASE + String(path).replace(/^\/+/, '');
}

/** Full URL of an app route, for links that leave the app (emails, QR codes, WhatsApp). */
export function appUrl(routePath = '/') {
  const route = String(routePath).startsWith('/') ? String(routePath) : `/${routePath}`;
  return `${window.location.origin}${BASE.replace(/\/$/, '')}${route}`;
}
