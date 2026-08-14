// Modo claro/oscuro. Por defecto sigue la configuración del dispositivo
// (prefers-color-scheme, resuelto en CSS); si el usuario fuerza un modo
// manualmente, se recuerda en localStorage y se aplica con el atributo
// data-theme en <html>. El script inline en index.html ya aplica esto antes
// de pintar la página para evitar un parpadeo del tema equivocado.
const STORAGE_KEY = "tpc-theme";

export function getStoredTheme() {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "light" || v === "dark" ? v : "system";
}

function apply(theme) {
  if (theme === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function initTheme() {
  apply(getStoredTheme());
}

/** Pasa de sistema → claro → oscuro → sistema, y devuelve el nuevo modo. */
export function cycleTheme() {
  const current = getStoredTheme();
  const next = current === "system" ? "light" : current === "light" ? "dark" : "system";
  if (next === "system") localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, next);
  apply(next);
  return next;
}
