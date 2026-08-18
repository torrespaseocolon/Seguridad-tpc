import { el, clear } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { getProfile } from "../services/auth.service.js";
import { navigate } from "../router.js";
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  query,
  where,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

const TILES = [
  { path: "/parqueos", icon: "parking", label: "Parqueos" },
  { path: "/paquetes", icon: "package", label: "Paquetes", badgeKey: "packages" },
  { path: "/objetos", icon: "tools", label: "Objetos" },
  { path: "/tarjetas", icon: "card", label: "Tarjetas / Stickers", badgeKey: "accessItems" },
  { path: "/actividad", icon: "activity", label: "Actividad" },
];

export function renderHome(root) {
  clear(root);
  const profile = getProfile();

  let tiles;
  if (profile.role === "viewer") {
    // Solo lectura: no tiene sentido ofrecerle las pantallas operativas
    // (parqueos, paquetes...) ya que no puede registrar nada ahí — solo ve
    // el Panel y los Reportes dentro de Administración.
    tiles = [{ path: "/admin", icon: "admin", label: "Reportes" }];
  } else {
    tiles = TILES.slice();
    if (profile.role === "admin") {
      tiles.push({ path: "/admin", icon: "admin", label: "Administración" });
    }
  }

  const grid = el("div", { class: "menu-grid" });
  const badgeSlots = {};

  for (const tile of tiles) {
    const inner = [el("div", { class: "menu-tile__icon" }, [icon(tile.icon, { size: 28 })]), el("div", { class: "menu-tile__label" }, tile.label)];
    let badgeSlot = null;
    if (tile.badgeKey) {
      badgeSlot = el("div", { class: "menu-tile__badge", style: "display:none;" }, "0");
      badgeSlots[tile.badgeKey] = badgeSlot;
      inner.push(badgeSlot);
    }
    grid.appendChild(el("div", { class: "menu-tile", onclick: () => navigate(tile.path) }, inner));
  }

  root.appendChild(el("div", { class: "stack" }, [grid]));

  loadBadgeCounts(badgeSlots);
}

// Usa getCountFromServer: consulta de conteo agregado que cuesta 1 sola
// lectura de cuota sin importar cuántos documentos existan (mucho más
// barato que descargar todos los documentos solo para contarlos).
async function loadBadgeCounts(slots) {
  try {
    if (slots.packages) {
      const q = query(collection(db, "packages"), where("status", "==", "pending"));
      const snap = await getCountFromServer(q);
      const count = snap.data().count;
      if (count > 0) {
        slots.packages.textContent = String(count);
        slots.packages.style.display = "inline-flex";
      }
    }
    if (slots.accessItems) {
      const q = query(collection(db, "access_items"), where("status", "==", "pending"));
      const snap = await getCountFromServer(q);
      const count = snap.data().count;
      if (count > 0) {
        slots.accessItems.textContent = String(count);
        slots.accessItems.style.display = "inline-flex";
      }
    }
  } catch (err) {
    // Los contadores son informativos; si fallan (p.ej. sin conexión) no
    // interrumpen el uso de la pantalla principal.
    console.error("[SEGURIDAD TPC] No se pudieron cargar los contadores:", err);
  }
}
