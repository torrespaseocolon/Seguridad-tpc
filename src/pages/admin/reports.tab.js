import { el, clear, loadingState, toast } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { fetchParkingHistory } from "../../services/parking.service.js";
import { fetchPackageHistory } from "../../services/packages.service.js";
import { fetchLoanHistory } from "../../services/objects.service.js";
import { fetchAccessItemHistory } from "../../services/access-items.service.js";
import { formatDateTime, formatMinutesDuration } from "../../utils/time.js";
import { downloadCsv } from "../../utils/csv.js";
import { friendlyError } from "../../utils/errors.js";

const REPORTS = [
  { id: "parking", label: "Parqueos" },
  { id: "packages", label: "Paquetes" },
  { id: "loans", label: "Préstamos" },
  { id: "access", label: "Tarjetas/Stickers" },
  { id: "byGuard", label: "Actividad por guardia" },
];

export function renderReportsTab(root) {
  clear(root);
  let active = "parking";
  const tabBar = el("div", { class: "row", style: "flex-wrap:wrap; gap:8px; margin-bottom:16px;" });
  const content = el("div", {});
  root.appendChild(tabBar);
  root.appendChild(content);

  function renderTabBar() {
    clear(tabBar);
    for (const r of REPORTS) {
      tabBar.appendChild(
        el("button", {
          class: `btn ${active === r.id ? "btn--primary" : "btn--secondary"}`,
          style: "min-height:38px; padding:8px 12px; font-size:14px;",
          onclick: () => { active = r.id; renderTabBar(); load(); },
        }, r.label)
      );
    }
  }

  async function load() {
    clear(content);
    content.appendChild(loadingState("Consultando historial..."));
    try {
      if (active === "parking") await renderParking(content);
      else if (active === "packages") await renderPackages(content);
      else if (active === "loans") await renderLoans(content);
      else if (active === "access") await renderAccess(content);
      else if (active === "byGuard") await renderByGuard(content);
    } catch (err) {
      clear(content);
      content.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  renderTabBar();
  load();
}

async function renderParking(content) {
  const rows = await fetchParkingHistory({ max: 200 });
  clear(content);
  content.appendChild(exportButton("historial_parqueos.csv", rows.map((r) => ({
    parqueo: r.spaceNumber, nombre: r.visitorName, cedula: r.visitorId, placa: r.plate,
    destino: `${r.destinationType === "office" ? "Oficina" : "Apto"} ${r.destinationNumber}`,
    entrada: formatDateTime(r.entryAt), salida: formatDateTime(r.exitAt),
    duracion_min: r.durationMinutes, guardia_entrada: r.entryGuardName, guardia_salida: r.exitGuardName, lobby: r.entryLobby,
  }))));
  const list = el("div", { class: "stack" });
  for (const r of rows) {
    list.appendChild(el("div", { class: "card" }, [
      el("div", { class: "row row--between" }, [el("strong", {}, `Parqueo ${r.spaceNumber} — ${r.plate}`), el("span", { class: "text-faint" }, `Lobby ${r.entryLobby || "-"}`)]),
      el("div", { class: "text-secondary" }, `${r.visitorName} · ${formatDateTime(r.entryAt)} → ${formatDateTime(r.exitAt)} (${formatMinutesDuration(r.durationMinutes)})`),
    ]));
  }
  content.appendChild(list.children.length ? list : el("div", { class: "empty-state" }, "Sin registros."));
}

async function renderPackages(content) {
  const rows = await fetchPackageHistory(200);
  clear(content);
  content.appendChild(exportButton("historial_paquetes.csv", rows.map((r) => ({
    apartamento: r.apartment, destinatario: r.recipientName, empresa: r.courier, estado: r.status,
    recibido: formatDateTime(r.createdAt), guardia_recibio: r.createdByName, entregado: formatDateTime(r.deliveredAt), guardia_entrego: r.deliveredByName,
  }))));
  content.appendChild(simpleList(rows, (r) => `Apt. ${r.apartment} — ${r.recipientName} (${r.status === "pending" ? "Pendiente" : "Entregado"})`));
}

async function renderLoans(content) {
  const rows = await fetchLoanHistory(200);
  clear(content);
  content.appendChild(exportButton("historial_prestamos.csv", rows.map((r) => ({
    objeto: r.objectName, persona: r.borrowerName, tipo: r.borrowerType, apartamento: r.apartment,
    prestado: formatDateTime(r.loanedAt), guardia_presto: r.loanedByName, devuelto: formatDateTime(r.returnedAt), guardia_recibio: r.returnedByName, estado_objeto: r.returnCondition,
  }))));
  content.appendChild(simpleList(rows, (r) => `${r.objectName} — ${r.borrowerName} (${r.status === "loaned" ? "Prestado" : "Devuelto"})`));
}

async function renderAccess(content) {
  const rows = await fetchAccessItemHistory(200);
  clear(content);
  content.appendChild(exportButton("historial_tarjetas.csv", rows.map((r) => ({
    tipo: r.type, nombre: r.recipientName, apartamento: r.apartment, torre: r.tower, lobby: r.dropLobby,
    registrado: formatDateTime(r.createdAt), admin: r.createdByName, entregado: formatDateTime(r.deliveredAt), guardia_entrego: r.deliveredByName,
  }))));
  content.appendChild(simpleList(rows, (r) => `${r.type} — ${r.recipientName} (${r.status === "pending" ? "Pendiente" : "Entregado"})`));
}

async function renderByGuard(content) {
  const rows = await fetchParkingHistory({ max: 300 });
  const byGuard = {};
  for (const r of rows) {
    const key = r.entryGuardName || "—";
    byGuard[key] = (byGuard[key] || 0) + 1;
  }
  clear(content);
  const list = el("div", { class: "stack" });
  for (const [name, count] of Object.entries(byGuard).sort((a, b) => b[1] - a[1])) {
    list.appendChild(el("div", { class: "card row row--between" }, [el("strong", {}, name), el("span", {}, `${count} entradas registradas`)]));
  }
  content.appendChild(el("div", { class: "form-hint mb-md" }, "Basado en las últimas 300 entradas de parqueo registradas."));
  content.appendChild(list.children.length ? list : el("div", { class: "empty-state" }, "Sin datos suficientes."));
}

function simpleList(rows, labelFn) {
  const list = el("div", { class: "stack" });
  for (const r of rows) list.appendChild(el("div", { class: "card" }, labelFn(r)));
  return list.children.length ? list : el("div", { class: "empty-state" }, "Sin registros.");
}

function exportButton(filename, rows) {
  return el("button", {
    class: "btn btn--secondary mb-md",
    onclick: () => {
      if (rows.length === 0) {
        toast("No hay datos para exportar.", "info");
        return;
      }
      downloadCsv(filename, rows);
    },
  }, [icon("download", { size: 18 }), " Exportar CSV"]);
}
