import { el, clear, loadingState, openModal } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
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
import { fetchFrequentVisitorAlerts } from "../../services/parking.service.js";
import { destinationLabel } from "../../utils/destination.js";

export async function renderDashboardTab(root) {
  clear(root);
  root.appendChild(loadingState("Cargando panel..."));
  try {
    const [spacesSnap, packagesCount, loansCount, accessCount, foundCount, recentAudit, frequentVisitors] = await Promise.all([
      getDocs(collection(db, "parking_spaces")),
      getCountFromServer(query(collection(db, "packages"), where("status", "==", "pending"))),
      getCountFromServer(query(collection(db, "object_loans"), where("status", "==", "loaned"))),
      getCountFromServer(query(collection(db, "access_items"), where("status", "==", "pending"))),
      getCountFromServer(query(collection(db, "found_items"), where("status", "==", "pending"))),
      getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), fbLimit(12))),
      fetchFrequentVisitorAlerts(),
    ]);

    const spaces = spacesSnap.docs.map((d) => d.data());
    let occupied = 0, free = 0, overdue = 0;
    for (const s of spaces) {
      if (s.status === "occupied") {
        occupied++;
        if (s.maxMinutesAtEntry && elapsedMinutes(s.entryAt) > s.maxMinutesAtEntry) overdue++;
      } else if (s.status === "free") {
        free++;
      }
    }

    clear(root);
    root.appendChild(
      el("div", { class: "menu-grid" }, [
        statTile("parking", `${occupied} / ${spaces.length}`, "Parqueos ocupados", false, progressBar(occupied, spaces.length)),
        statTile("check", String(free), "Parqueos libres"),
        statTile("warning", String(overdue), "Vehículos excedidos", overdue > 0),
        statTile("package", String(packagesCount.data().count), "Paquetes pendientes"),
        statTile("tools", String(loansCount.data().count), "Objetos prestados"),
        statTile("card", String(accessCount.data().count), "Tarjetas/stickers pendientes"),
        statTile("search", String(foundCount.data().count), "Objetos encontrados pendientes"),
      ])
    );

    if (frequentVisitors.length > 0) {
      root.appendChild(el("div", { class: "card__title mt-lg row" }, [icon("warning", { size: 18 }), "Visitas frecuentes (esta semana, lunes a domingo)"]));
      root.appendChild(frequentVisitorsCard(frequentVisitors));
    }

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

function statTile(iconName, value, label, alert = false, bar = null) {
  return el("div", { class: "card text-center", style: alert ? "border-color:var(--color-danger);" : "" }, [
    el("div", { style: `color:${alert ? "var(--color-danger)" : "var(--color-primary)"}; display:flex; justify-content:center;` }, [icon(iconName, { size: 28 })]),
    el("div", { style: `font-size:var(--font-size-xl); font-weight:700; margin-top:4px; ${alert ? "color:var(--color-danger);" : ""}` }, value),
    el("div", { class: "text-secondary" }, label),
    bar,
  ].filter(Boolean));
}

/** Barra de proporción simple (div dentro de div, sin librerías) para leer un dato de un vistazo. */
function progressBar(value, max, color = "var(--color-primary)") {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return el("div", { style: "height:6px; border-radius:4px; background:var(--color-border); overflow:hidden; margin-top:10px;" }, [
    el("div", { style: `height:100%; width:${pct}%; background:${color}; border-radius:4px;` }),
  ]);
}

/**
 * Alerta de placas que visitaron el mismo apartamento/oficina 3 veces o
 * más en los últimos 7 días — no bloquea nada, solo lo pone a la vista de
 * administración para que decida si vale la pena revisarlo (ej. podría ser
 * un vehículo que en realidad debería estar registrado como residente).
 * Cada tarjeta es tocable: abre el detalle con las fechas exactas de cada
 * entrada contada (ver openFrequentVisitorDetail).
 */
function frequentVisitorsCard(alerts) {
  return el(
    "div",
    { class: "stack" },
    alerts.map((a) =>
      el(
        "div",
        { class: "card row row--between", style: "border-color:var(--color-warning); cursor:pointer;", onclick: () => openFrequentVisitorDetail(a) },
        [
          el("div", {}, [
            el("div", { style: "font-weight:700;" }, a.plate),
            el("div", { class: "text-secondary" }, `${destinationLabel(a.destinationType, a.destinationNumber)} · última vez: ${formatDateTime(a.lastEntry)}`),
          ]),
          el("span", { class: "badge badge--warning" }, `${a.count} veces esta semana`),
        ]
      )
    )
  );
}

/** Detalle de una alerta de visita frecuente: la fecha y hora exacta de cada una de las entradas contadas. */
function openFrequentVisitorDetail(alert) {
  const list = el(
    "div",
    { class: "stack" },
    alert.entries.map((when) => el("div", { class: "card" }, formatDateTime(when)))
  );
  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `${alert.plate} — ${destinationLabel(alert.destinationType, alert.destinationNumber)}`),
    el("div", { class: "text-secondary mb-md" }, `${alert.count} entradas esta semana, lunes a domingo (parqueo de visita o espacio del propietario).`),
    list,
  ]);
  openModal(content);
}
