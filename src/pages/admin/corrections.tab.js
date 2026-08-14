import { el, clear, toast, openModal, loadingState, confirmDialog } from "../../utils/dom.js";
import { fetchOpenReports, resolveErrorReport } from "../../services/error-reports.service.js";
import { fetchSessionsByPlate, reopenSession, correctSessionFields, OperationError } from "../../services/parking.service.js";
import { createDestinationField } from "../../utils/destination-field.js";
import { formatDateTime } from "../../utils/time.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderCorrectionsTab(root) {
  clear(root);
  root.appendChild(el("div", { class: "card__title" }, "Reportes de error abiertos"));
  const reportsList = el("div", { class: "stack mb-md" });
  root.appendChild(reportsList);

  root.appendChild(el("div", { class: "card__title" }, "Buscar registro de parqueo por placa"));
  const searchInput = el("input", { class: "form-control", placeholder: "Ej. ABC123", style: "text-transform:uppercase;" });
  const searchBtn = el("button", { class: "btn btn--secondary" }, "Buscar");
  const resultsBox = el("div", { class: "stack mt-md" });
  root.appendChild(el("div", { class: "row" }, [searchInput, searchBtn]));
  root.appendChild(resultsBox);

  async function loadReports() {
    clear(reportsList);
    reportsList.appendChild(loadingState());
    try {
      const reports = await fetchOpenReports();
      clear(reportsList);
      if (reports.length === 0) {
        reportsList.appendChild(el("div", { class: "empty-state" }, "No hay reportes de error abiertos."));
        return;
      }
      for (const r of reports) reportsList.appendChild(renderReportCard(r, loadReports));
    } catch (err) {
      clear(reportsList);
      reportsList.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  async function doSearch() {
    const plate = searchInput.value.trim();
    if (!plate) return;
    clear(resultsBox);
    resultsBox.appendChild(loadingState());
    try {
      const sessions = await fetchSessionsByPlate(plate);
      clear(resultsBox);
      if (sessions.length === 0) {
        resultsBox.appendChild(el("div", { class: "empty-state" }, "No se encontraron registros con esa placa."));
        return;
      }
      for (const s of sessions) resultsBox.appendChild(renderSessionCard(s, doSearch));
    } catch (err) {
      clear(resultsBox);
      resultsBox.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }
  searchBtn.addEventListener("click", doSearch);

  await loadReports();
}

function renderReportCard(report, reload) {
  const resolveBtn = el("button", { class: "btn btn--success" }, "Marcar como resuelto");
  resolveBtn.addEventListener("click", () => openResolveModal(report, reload));
  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, report.reportedByName),
      el("span", { class: "text-faint" }, formatDateTime(report.createdAt)),
    ]),
    el("div", { class: "mt-md" }, report.description),
    el("div", { class: "text-faint" }, `Lobby ${report.lobby || "-"}`),
    el("div", { class: "mt-md" }, [resolveBtn]),
  ]);
}

function openResolveModal(report, reload) {
  const notesInput = el("textarea", { class: "form-control", rows: "3", placeholder: "Explique qué se corrigió (opcional)." });
  const submitBtn = el("button", { class: "btn btn--success btn--block btn--lg" }, "GUARDAR");
  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, "Resolver reporte"),
    el("div", { class: "text-secondary" }, report.description),
    field("Nota de resolución", notesInput),
    submitBtn,
  ]);
  const closeFn = openModal(content);
  submitBtn.addEventListener("click", async () => {
    submitBtn.disabled = true;
    try {
      await resolveErrorReport(report.id, notesInput.value.trim());
      toast("Reporte resuelto.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      submitBtn.disabled = false;
    }
  });
}

function renderSessionCard(session, reload) {
  const editBtn = el("button", { class: "btn btn--secondary" }, "Corregir datos");
  editBtn.addEventListener("click", () => openEditModal(session, reload));

  const actions = [editBtn];
  if (session.status === "closed") {
    const reopenBtn = el("button", { class: "btn btn--warning" }, "Reabrir (salida incorrecta)");
    reopenBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Reabrir registro",
        body: `Esto marcará el parqueo ${session.spaceNumber} como ocupado nuevamente con estos datos. Úselo solo si la salida se registró por error.`,
        danger: true,
      });
      if (!ok) return;
      try {
        await reopenSession(session.id, "Reapertura: salida registrada por error.");
        toast("Registro reabierto.", "success");
        reload();
      } catch (err) {
        toast(err instanceof OperationError ? err.message : friendlyError(err), "danger");
      }
    });
    actions.push(reopenBtn);
  }

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, `Parqueo ${session.spaceNumber} — ${session.plate}`),
      el("span", { class: `badge ${session.status === "open" ? "badge--occupied" : "badge--free"}` }, session.status === "open" ? "ABIERTO" : "CERRADO"),
    ]),
    el("div", { class: "text-secondary" }, `${session.visitorName} · Apt. ${session.destinationNumber}`),
    el("div", { class: "text-faint" }, `Entrada: ${formatDateTime(session.entryAt)} · Salida: ${formatDateTime(session.exitAt)}`),
    session.corrected ? el("div", { class: "badge badge--warning" }, "Corregido previamente") : null,
    el("div", { class: "row mt-md" }, actions),
  ].filter(Boolean));
}

function openEditModal(session, reload) {
  const nameInput = el("input", { class: "form-control", value: session.visitorName || "" });
  const idInput = el("input", { class: "form-control", value: session.visitorId || "" });
  const plateInput = el("input", { class: "form-control", value: session.plate || "" });
  const destField = createDestinationField({ required: true, initialValue: session.destinationNumber || "" });
  const noteInput = el("textarea", { class: "form-control", rows: "2", placeholder: "Motivo de la corrección" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg" }, "GUARDAR CORRECCIÓN");

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, "Corregir registro"),
    field("Nombre", nameInput),
    field("Cédula", idInput),
    field("Placa", plateInput),
    field("Torre", destField.towerSelect),
    field("Piso + unidad", destField.numberInput),
    destField.hint,
    field("Motivo de la corrección", noteInput),
    errorBox,
    submitBtn,
  ]);
  const closeFn = openModal(content);

  submitBtn.addEventListener("click", async () => {
    const destResult = destField.getResult();
    if (!destResult.ok) {
      errorBox.textContent = destResult.error;
      errorBox.style.display = "block";
      return;
    }
    errorBox.style.display = "none";
    submitBtn.disabled = true;
    try {
      await correctSessionFields(
        session.id,
        {
          visitorName: nameInput.value.trim(),
          visitorId: idInput.value.trim(),
          plate: plateInput.value.trim().toUpperCase(),
          destinationNumber: destResult.code,
        },
        noteInput.value.trim()
      );
      toast("Registro corregido.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      submitBtn.disabled = false;
    }
  });
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
