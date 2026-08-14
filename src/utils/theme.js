// Modo claro/oscuro. Por defecto sigue la configuración del dispositivo
// (prefers-color-scheme, resuelto en CSS); si el usuario fuerza un modo
// manualmente con el botón de tema, se recuerda en localStorage y se aplica
// con el atributo data-theme en <html>. El botón siempre alterna a partir de
// la apariencia EFECTIVA actual (la que realmente se ve en pantalla, sea
// automática o forzada), así que un solo toque siempre cambia lo que se ve.
const STORAGE_KEY = "tpc-theme";

function systemPrefersDark() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** "light" | "dark" | null (null = sigue el sistema, sin preferencia guardada). */
export function getStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : null;
}

/** El tema que REALMENTE se está mostrando ahora mismo. */
export function getEffectiveTheme() {
  return getStoredTheme() || (systemPrefersDark() ? "dark" : "light");
}

function apply(theme) {
  if (theme) document.documentElement.setAttribute("data-theme", theme);
  else document.documentElement.removeAttribute("data-theme");
}

export function initTheme() {
  apply(getStoredTheme());
}

/** Alterna claro/oscuro a partir de lo que se ve ahora. Devuelve el nuevo modo. */
export function toggleTheme() {
  const next = getEffectiveTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY, next);
  apply(next);
  return next;
}
