// Router muy simple basado en "#" (funciona sin configuración especial en
// GitHub Pages, a diferencia de un router que dependa de rutas del
// servidor). Cada pantalla puede devolver una función de "limpieza" que se
// ejecuta automáticamente al salir de ella — así los listeners en tiempo
// real (por ejemplo el de Parqueos) siempre se cancelan y no siguen
// consumiendo cuota de Firebase en segundo plano.

const routes = new Map();
let guardFn = null;
let currentCleanup = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

/** Se ejecuta antes de cada navegación; si devuelve un string, se redirige allí en su lugar. */
export function setRouteGuard(fn) {
  guardFn = fn;
}

export function navigate(path) {
  if (location.hash === `#${path}`) {
    render();
  } else {
    location.hash = path;
  }
}

export function currentPath() {
  return location.hash.replace(/^#/, "") || "/";
}

async function render() {
  let path = currentPath();
  if (guardFn) {
    const redirect = guardFn(path);
    if (redirect && redirect !== path) {
      location.hash = redirect;
      return;
    }
  }
  const [base, queryString] = path.split("?");
  const renderFn = routes.get(base) || routes.get("/404");
  if (typeof currentCleanup === "function") {
    try {
      currentCleanup();
    } catch (e) {
      /* ignore */
    }
    currentCleanup = null;
  }
  const outlet = document.getElementById("view-outlet");
  if (!outlet || !renderFn) return;
  outlet.scrollTop = 0;
  const cleanup = await renderFn(outlet, new URLSearchParams(queryString || ""));
  if (typeof cleanup === "function") currentCleanup = cleanup;
}

export function startRouter() {
  window.addEventListener("hashchange", render);
  render();
}

export function rerender() {
  render();
}
