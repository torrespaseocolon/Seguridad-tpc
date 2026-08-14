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

// Sin filtro de fechas se muestran solo los más recientes (para que la
// pantalla cargue rápido). Con un rango de fechas elegido, se levanta el
// tope para no cortar el rango a mitad de camino — el plan gratuito de
// Firebase no borra datos por antigüedad, así que un rango amplio siempre
// puede pedirse, solo cuesta más lecturas de cuota cuanto más grande sea.
const DEFAULT_MAX = 200;
const DEFAULT_MAX_BY_GUARD = 300;
const RANGE_MAX = 2000;

export function renderReportsTab(root) {
  clear(root);
  let active = "parking";
  const tabBar = el("div", { class: "row", style: "flex-wrap:wrap; gap:8px; margin-bottom:16px;" });

  const fromInput = el("input", { class: "form-control", type: "date" });
  const toInput = el("input", { class: "form-control", type: "date" });
  const clearBtn = el("button", { class: "btn btn--secondary" }, "Quitar filtro");
  const filterBar = el("div", { class: "card mb-md" }, [
    el("div", { class: "card__title" }, "Filtrar por fecha (opcional)"),
    el("div", { class: "row", style: "flex-wrap:wrap; gap:12px;" }, [
      field("Desde", fromInput),
      field("Hasta", toInput),
      el("div", { style: "align-self:flex-end;" }, [clearBtn]),
    ]),
    el("div", { class: "form-hint" }, "Sin fechas, se muestran los registros más recientes. El plan gratuito no borra historial por antigüedad: podés pedir cualquier rango desde que el sistema está en uso."),
  ]);
  clearBtn.addEventListener("click", () => {
    fromInput.value = "";
    toInput.value = "";
    load();
  });
  fromInput.addEventListener("change", load);
  toInput.addEventListener("change", load);

  const content = el("div", {});
  root.appendChild(tabBar);
  root.appendChild(filterBar);
  root.appendChild(content);

  function getRange() {
    const from = fromInput.value ? new Date(`${fromInput.value}T00:00:00`) : null;
    const to = toInput.value ? new Date(`${toInput.value}T23:59:59.999`) : null;
    return { from, to };
  }

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
    const range = getRange();
    try {
      if (active === "parking") await renderParking(content, range);
      else if (active === "packages") await renderPackages(content, range);
      else if (active === "loans") await renderLoans(content, range);
      else if (active === "access") await renderAccess(content, range);
      else if (active === "byGuard") await renderByGuard(content, range);
    } catch (err) {
      clear(content);
      content.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  renderTabBar();
  load();
}

function maxFor(defaultMax, range) {
  return range.from || range.to ? RANGE_MAX : defaultMax;
}

async function renderParking(content, range) {
  const rows = await fetchParkingHistory({ max: maxFor(DEFAULT_MAX, range), ...range });
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

async function renderPackages(content, range) {
  const rows = await fetchPackageHistory(maxFor(DEFAULT_MAX, range), range);
  clear(content);
  content.appendChild(exportButton("historial_paquetes.csv", rows.map((r) => ({
    apartamento: r.apartment, destinatario: r.recipientName, empresa: r.courier, estado: r.status,
    recibido: formatDateTime(r.createdAt), guardia_recibio: r.createdByName, entregado: formatDateTime(r.deliveredAt), guardia_entrego: r.deliveredByName,
  }))));
  content.appendChild(simpleList(rows, (r) => `Apt. ${r.apartment} — ${r.recipientName} (${r.status === "pending" ? "Pendiente" : "Entregado"})`));
}

async function renderLoans(content, range) {
  const rows = await fetchLoanHistory(maxFor(DEFAULT_MAX, range), range);
  clear(content);
  content.appendChild(exportButton("historial_prestamos.csv", rows.map((r) => ({
    objeto: r.objectName, persona: r.borrowerName, tipo: r.borrowerType, apartamento: r.apartment,
    prestado: formatDateTime(r.loanedAt), guardia_presto: r.loanedByName, devuelto: formatDateTime(r.returnedAt), guardia_recibio: r.returnedByName, estado_objeto: r.returnCondition,
  }))));
  content.appendChild(simpleList(rows, (r) => `${r.objectName} — ${r.borrowerName} (${r.status === "loaned" ? "Prestado" : "Devuelto"})`));
}

async function renderAccess(content, range) {
  const rows = await fetchAccessItemHistory(maxFor(DEFAULT_MAX, range), range);
  clear(content);
  content.appendChild(exportButton("historial_tarjetas.csv", rows.map((r) => ({
    tipo: r.type, nombre: r.recipientName, apartamento: r.apartment, torre: r.tower, lobby: r.dropLobby,
    registrado: formatDateTime(r.createdAt), admin: r.createdByName, entregado: formatDateTime(r.deliveredAt), guardia_entrego: r.deliveredByName,
  }))));
  content.appendChild(simpleList(rows, (r) => `${r.type} — ${r.recipientName} (${r.status === "pending" ? "Pendiente" : "Entregado"})`));
}

async function renderByGuard(content, range) {
  const rows = await fetchParkingHistory({ max: maxFor(DEFAULT_MAX_BY_GUARD, range), ...range });
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
  content.appendChild(el("div", { class: "form-hint mb-md" }, `Basado en las últimas ${maxFor(DEFAULT_MAX_BY_GUARD, range)} entradas de parqueo (según el filtro de fecha).`));
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

function field(labelText, inputNode) {
  return el("div", { class: "form-group", style: "min-width:150px;" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
