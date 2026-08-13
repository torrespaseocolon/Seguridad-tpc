import { el, clear, toast, openModal, loadingState, emptyState } from "../utils/dom.js";
import { createErrorReport, fetchMyReports } from "../services/error-reports.service.js";
import { fetchParkingHistory } from "../services/parking.service.js";
import { formatDateTime } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

export function renderActivity(root) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, "← Menú"),
      el("h2", {}, "📋 Actividad"),
    ])
  );

  root.appendChild(
    el("button", { class: "btn btn--danger btn--block mb-md", onclick: () => openReportModal(loadReports) }, "⚠️ REPORTAR ERROR")
  );

  root.appendChild(el("div", { class: "card__title" }, "Mis reportes"));
  const reportsList = el("div", { class: "stack mb-md" });
  root.appendChild(reportsList);

  root.appendChild(el("div", { class: "card__title" }, "Actividad reciente de parqueos"));
  const activityList = el("div", { class: "stack" });
  root.appendChild(activityList);

  async function loadReports() {
    clear(reportsList);
    reportsList.appendChild(loadingState());
    try {
      const reports = await fetchMyReports();
      clear(reportsList);
      if (reports.length === 0) {
        reportsList.appendChild(emptyState("📋", "No ha reportado errores."));
        return;
      }
      for (const r of reports) {
        reportsList.appendChild(
          el("div", { class: "card" }, [
            el("div", { class: "row row--between" }, [
              el("span", {}, formatDateTime(r.createdAt)),
              el("span", { class: `badge ${r.status === "open" ? "badge--pending" : "badge--delivered"}` }, r.status === "open" ? "PENDIENTE" : "RESUELTO"),
            ]),
            el("div", { class: "mt-md" }, r.description),
            r.resolutionNotes ? el("div", { class: "text-secondary mt-md" }, `Respuesta de administración: ${r.resolutionNotes}`) : null,
          ].filter(Boolean))
        );
      }
    } catch (err) {
      clear(reportsList);
      reportsList.appendChild(emptyState("⚠️", friendlyError(err)));
    }
  }

  async function loadActivity() {
    clear(activityList);
    activityList.appendChild(loadingState());
    try {
      const sessions = await fetchParkingHistory({ max: 15 });
      clear(activityList);
      if (sessions.length === 0) {
        activityList.appendChild(emptyState("🅿️", "Aún no hay historial de parqueos."));
        return;
      }
      for (const s of sessions) {
        activityList.appendChild(
          el("div", { class: "card" }, [
            el("div", { class: "row row--between" }, [
              el("strong", {}, `Parqueo ${s.spaceNumber} — ${s.plate || ""}`),
              el("span", { class: "text-faint" }, `Lobby ${s.entryLobby || "-"}`),
            ]),
            el("div", { class: "text-secondary" }, `${s.visitorName || ""} · Apt. ${s.destinationNumber || ""}`),
            el("div", { class: "text-faint" }, `Entrada: ${formatDateTime(s.entryAt)} · Salida: ${formatDateTime(s.exitAt)}`),
          ])
        );
      }
    } catch (err) {
      clear(activityList);
      activityList.appendChild(emptyState("⚠️", friendlyError(err)));
    }
  }

  loadReports();
  loadActivity();
}

function openReportModal(onDone) {
  const textarea = el("textarea", { class: "form-control", rows: "4", required: true, placeholder: "Ej. Registré por error la salida de otro vehículo." });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--danger btn--block btn--lg", type: "submit" }, "ENVIAR REPORTE");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!textarea.value.trim()) {
          errorBox.textContent = "Describa el error.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "ENVIANDO...";
        try {
          await createErrorReport({ description: textarea.value.trim() });
          toast("Reporte enviado a administración.", "success");
          closeFn();
          onDone();
        } catch (err) {
          errorBox.textContent = friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "ENVIAR REPORTE";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, "Reportar un error"),
      el("div", { class: "form-group" }, [el("label", { class: "form-label" }, "¿Qué ocurrió?"), textarea]),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  textarea.focus();
}
