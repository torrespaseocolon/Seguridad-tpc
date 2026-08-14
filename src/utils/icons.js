// Sistema de íconos — SVG en línea, sin dependencias externas ni fuentes de
// íconos por CDN (mantiene el proyecto sin paso de compilación). Cada ícono
// usa currentColor, así que hereda el color del texto/botón donde se coloque.
import { el } from "./dom.js";

const PATHS = {
  back: '<path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  close: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  refresh: '<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M18 3v4h-4M6 21v-4h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  warning: '<path d="M12 3.5 22 20H2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.1" fill="currentColor"/>',
  check: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="m8 12.5 2.5 2.5L16 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  info: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 11v5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="7.7" r="1.1" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4.3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2.5v2.4M12 19.1v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  parking: '<rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 16V8h2.6a2.4 2.4 0 0 1 0 4.8H10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  package: '<path d="M3.5 8 12 3.5 20.5 8 12 12.5 3.5 8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M3.5 8v8.3L12 20.5l8.5-4.2V8M12 12.5v8" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  tools: '<path d="M14.5 6.5a3.5 3.5 0 0 1-4.6 4.6L4 17l3 3 5.9-5.9a3.5 3.5 0 0 1 4.6-4.6L14.5 6.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 10h18" stroke="currentColor" stroke-width="2"/><path d="M6.5 14.2h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  activity: '<rect x="5" y="3.5" width="14" height="17" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  admin: '<path d="M12 3.5 19 6.3v5.4c0 4.4-3 7.9-7 8.8-4-0.9-7-4.4-7-8.8V6.3L12 3.5Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m9 12.2 2 2 4-4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  users: '<circle cx="9" cy="8.3" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3.5 19c.7-3.2 3-5 5.5-5s4.8 1.8 5.5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M15.3 5.8a3 3 0 0 1 0 5.6M17.8 19c-.4-2-1.3-3.5-2.6-4.4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  download: '<path d="M12 3.5v11M8 11l4 4 4-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 17v2.3c0 .8.6 1.4 1.4 1.4h12.2c.8 0 1.4-.6 1.4-1.4V17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  wheelchair: '<circle cx="9.5" cy="5" r="1.7" fill="currentColor"/><path d="M9.5 8v5l5 2M9.5 10.5h5.5M9.5 13h-3l-2 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12.8" cy="17" r="3.6" fill="none" stroke="currentColor" stroke-width="2"/>',
  wifi: '<path d="M4 9.5a12 12 0 0 1 16 0M7 13a7.5 7.5 0 0 1 10 0M10.2 16.4a3 3 0 0 1 3.6 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
  wifiOff: '<path d="M4 9.5a12 12 0 0 1 4.5-2.7M19.9 9.4A12 12 0 0 0 15 6.9M7 13a7.5 7.5 0 0 1 3.2-1.8M13.8 11.2A7.5 7.5 0 0 1 17 13M10.2 16.4a3 3 0 0 1 3.6 0M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="19.2" r="1.1" fill="currentColor"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
  logout: '<path d="M9 4.5H6a1.6 1.6 0 0 0-1.6 1.6v11.8A1.6 1.6 0 0 0 6 19.5h3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.5 8 19 12l-4.5 4M19 12H9.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** Devuelve un <span class="icon"> con el SVG del ícono solicitado. */
export function icon(name, opts = {}) {
  const path = PATHS[name];
  if (!path) return el("span", { class: "icon" });
  const size = opts.size || 20;
  const svg = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${path}</svg>`;
  return el("span", { class: `icon${opts.class ? " " + opts.class : ""}` , html: svg });
}
