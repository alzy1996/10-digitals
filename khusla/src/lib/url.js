// Absolute links to app routes. BASE_URL is "/" on Firebase Hosting and "/10-digitals/khusla/" on GitHub Pages.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Router basename ("" means the site root). */
export const routerBase = BASE;

/** Full URL of an app route, e.g. appUrl('/join?salon=x'). */
export function appUrl(path = '/') {
  return `${location.origin}${BASE}${path}`;
}

/** URL of a file in public/, e.g. publicUrl('icons/sprite.svg'). */
export function publicUrl(file) {
  return `${import.meta.env.BASE_URL}${file}`;
}
