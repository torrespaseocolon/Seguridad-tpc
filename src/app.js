import { subscribeAuth, logout, getProfile } from "./services/auth.service.js";
import { subscribeConnectivity } from "./utils/connectivity.js";
import { el, clear } from "./utils/dom.js";
import { icon } from "./utils/icons.js";
import { initTheme, getEffectiveTheme, toggleTheme } from "./utils/theme.js";
import { renderLogin } from "./pages/login.page.js";
import { registerRoute, setRouteGuard, startRouter, navigate, currentPath } from "./router.js";

import { renderHome } from "./pages/home.page.js";
import { renderParking } from "./pages/parking.page.js";
import { renderPackages } from "./pages/packages.page.js";
import { renderObjects } from "./pages/objects.page.js";
import { renderAccessItems } from "./pages/access-items.page.js";
import { renderActivity } from "./pages/activity.page.js";
import { renderAdmin } from "./pages/admin.page.js";

const appRoot = document.getElementById("app-root");
const offlineBanner = document.getElementById("offline-banner");

initTheme();

let shellBuilt = false;
let connBadgeEl = null;
let sessionTimer = null;

function themeToggleIcon(effectiveTheme) {
  return effectiveTheme === "dark" ? "moon" : "sun";
}

function buildThemeToggle() {
  const btn = el(
    "button",
    {
      type: "button",
      class: "theme-toggle",
      title: "Cambiar entre modo claro y oscuro",
      onclick: () => {
        const next = toggleTheme();
        clear(btn);
        btn.appendChild(icon(themeToggleIcon(next), { size: 20 }));
      },
    },
    [icon(themeToggleIcon(getEffectiveTheme()), { size: 20 })]
  );
  return btn;
}

function buildShell() {
  clear(appRoot);
  const headerLogoImg = el("img", {
    src: "./icons/logo.png",
    alt: "Logo Torres Paseo Colón",
    style: "width:100%; height:100%; object-fit:contain; border-radius:inherit;",
    onerror: (e) => e.target.replaceWith(document.createTextNode("TPC")),
  });
  const header = el("header", { class: "app-header" }, [
    el("div", { class: "app-header__logo", id: "header-logo-slot" }, [headerLogoImg]),
    el("div", { class: "app-header__titles" }, [
      el("div", { class: "app-header__brand" }, "Torres Paseo Colón"),
      el("div", { class: "app-header__system", id: "header-system-name" }, "Sistema de Seguridad"),
    ]),
    buildThemeToggle(),
    el("div", { class: "app-header__user", id: "header-user-info" }),
  ]);

  const main = el("main", { class: "app-main", id: "view-outlet" });

  appRoot.appendChild(header);
  appRoot.appendChild(main);
  shellBuilt = true;
}

function updateHeaderUser(profile) {
  const box = document.getElementById("header-user-info");
  if (!box) return;
  clear(box);
  const roleLabel = { admin: "Administrador", guard: "Guardia", viewer: "Solo lectura" }[profile.role] || profile.role;
  const lobbyLabel = profile.lobby ? `Lobby ${profile.lobby}` : "Sin lobby asignado";
  connBadgeEl = el("span", { class: "conn-badge conn-badge--online" }, [
    el("span", { class: "conn-dot" }),
    "CONECTADO",
  ]);
  box.appendChild(el("div", {}, [el("strong", {}, profile.name), ` · ${roleLabel}`]));
  box.appendChild(el("div", {}, lobbyLabel));
  box.appendChild(el("div", { class: "row", style: "justify-content:flex-end; margin-top:4px;" }, [connBadgeEl]));
  box.appendChild(
    el(
      "button",
      { class: "btn btn--ghost", style: "min-height:32px; padding:4px 10px; font-size:14px;", onclick: onLogoutClick },
      [icon("logout", { size: 16 }), " Cerrar sesión"]
    )
  );
}

async function onLogoutClick() {
  await logout();
}

function updateConnBadge(online) {
  if (offlineBanner) offlineBanner.classList.toggle("is-visible", !online);
  if (!connBadgeEl) return;
  connBadgeEl.className = `conn-badge conn-badge--${online ? "online" : "offline"}`;
  connBadgeEl.innerHTML = "";
  connBadgeEl.appendChild(el("span", { class: "conn-dot" }));
  connBadgeEl.appendChild(document.createTextNode(online ? "CONECTADO" : "SIN CONEXIÓN"));
}

function registerRoutes() {
  registerRoute("/", renderHome);
  registerRoute("/parqueos", renderParking);
  registerRoute("/paquetes", renderPackages);
  registerRoute("/objetos", renderObjects);
  registerRoute("/tarjetas", renderAccessItems);
  registerRoute("/actividad", renderActivity);
  registerRoute("/admin", renderAdmin);
  registerRoute("/404", (root) => {
    clear(root);
    root.appendChild(el("div", { class: "empty-state" }, "Pantalla no encontrada."));
  });

  setRouteGuard((path) => {
    const profile = getProfile();
    if (!profile) return path;
    // Solo lectura: únicamente puede estar en "/" (menú) o "/admin" (donde
    // ve el Panel y Reportes, sin poder operar nada) — cualquier otra
    // pantalla operativa la redirige de vuelta al menú.
    if (profile.role === "viewer") {
      return path === "/" || path.startsWith("/admin") ? null : "/";
    }
    if (path.startsWith("/admin") && profile.role !== "admin") return "/";
    return null;
  });
}

let routerStarted = false;

subscribeAuth((state) => {
  if (!state) {
    shellBuilt = false;
    clear(appRoot);
    renderLogin(appRoot);
    return;
  }
  if (state.error) {
    shellBuilt = false;
    clear(appRoot);
    renderLogin(appRoot);
    // Se muestra el error de perfil dentro de la pantalla de login.
    const errBox = document.querySelector(".form-error");
    if (errBox) {
      errBox.textContent = state.error;
      errBox.style.display = "block";
    }
    return;
  }

  const { profile } = state;
  if (!shellBuilt) buildShell();
  updateHeaderUser(profile);

  if (!routerStarted) {
    registerRoutes();
    startRouter();
    routerStarted = true;
  } else {
    // Si veníamos del login, aseguramos ir a la pantalla principal.
    if (currentPath() === "/" || !currentPath()) navigate("/");
  }
});

subscribeConnectivity(updateConnBadge);
