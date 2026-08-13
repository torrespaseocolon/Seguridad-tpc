import { el, clear, loadingState } from "../../utils/dom.js";
import { db } from "../../firebase/firebase-init.js";
import {
  collection,
  query,
  where,
  getDocs,
  getCountFromServer,
  orderBy,
  limit as fbLimit,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { elapsedMinutes, formatDateTime } from "../../utils/time.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderDashboardTab(root) {
  clear(root);
  root.appendChild(loadingState("Cargando panel..."));
  try {
    const [spacesSnap, packagesCount, loansCount, accessCount, recentAudit] = await Promise.all([
      getDocs(collection(db, "parking_spaces")),
      getCountFromServer(query(collection(db, "packages"), where("status", "==", "pending"))),
      getCountFromServer(query(collection(db, "object_loans"), where("status", "==", "loaned"))),
      getCountFromServer(query(collection(db, "access_items"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), fbLimit(12))),
    ]);

    const spaces = spacesSnap.docs.map((d) => d.data());
    let occupied = 0, free = 0, overdue = 0, lobbyA = 0, lobbyB = 0;
    for (const s of spaces) {
      if (s.status === "occupied") {
        occupied++;
        if (s.entryLobby === "A") lobbyA++;
        if (s.entryLobby === "B") lobbyB++;
        if (s.maxMinutesAtEntry && elapsedMinutes(s.entryAt) > s.maxMinutesAtEntry) overdue++;
      } else if (s.status === "free") {
        free++;
      }
    }

    clear(root);
    root.appendChild(
      el("div", { class: "menu-grid" }, [
        statTile("🅿️", `${occupied} / ${spaces.length}`, "Parqueos ocupados"),
        statTile("🟢", String(free), "Parqueos libres"),
        statTile("⚠️", String(overdue), "Vehículos excedidos", overdue > 0),
        statTile("📦", String(packagesCount.data().count), "Paquetes pendientes"),
        statTile("🧰", String(loansCount.data().count), "Objetos prestados"),
        statTile("💳", String(accessCount.data().count), "Tarjetas/stickers pendientes"),
        statTile("🅰️", String(lobbyA), "Ocupados — Lobby A"),
        statTile("🅱️", String(lobbyB), "Ocupados — Lobby B"),
      ])
    );

    root.appendChild(el("div", { class: "card__title mt-lg" }, "Actividad reciente"));
    const auditList = el("div", { class: "stack" });
    const logs = recentAudit.docs.map((d) => d.data());
    if (logs.length === 0) {
      auditList.appendChild(el("div", { class: "empty-state" }, "Sin actividad registrada todavía."));
    } else {
      for (const log of logs) {
        auditList.appendChild(
          el("div", { class: "card" }, [
            el("div", { class: "row row--between" }, [
              el("strong", {}, log.action),
              el("span", { class: "text-faint" }, formatDateTime(log.createdAt)),
            ]),
            el("div", { class: "text-secondary" }, `${log.userName || ""} (${log.userRole || ""})`),
          ])
        );
      }
    }
    root.appendChild(auditList);

    root.appendChild(
      el("div", { class: "form-hint mt-lg" },
        "Nota: no se muestra un contador de \"usuarios conectados en vivo\" para evitar un listener de presencia " +
        "permanente, que generaría lecturas constantes de Firebase sin un beneficio real para la operación diaria."
      )
    );
  } catch (err) {
    clear(root);
    root.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
  }
}

function statTile(icon, value, label, alert = false) {
  return el("div", { class: "card text-center", style: alert ? "border-color:var(--color-danger);" : "" }, [
    el("div", { style: "font-size:28px;" }, icon),
    el("div", { style: `font-size:var(--font-size-xl); font-weight:700; ${alert ? "color:var(--color-danger);" : ""}` }, value),
    el("div", { class: "text-secondary" }, label),
  ]);
}
