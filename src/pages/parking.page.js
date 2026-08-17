import { el, clear, toast, confirmDialog, openModal } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { subscribeParkingSpaces, registerEntry, registerExit, buildConsultaUrl, OperationError, MAX_MINUTES_OFFICE, MAX_MINUTES_APARTMENT, MAX_SIMULTANEOUS_PER_DESTINATION } from "../services/parking.service.js";
import { createDestinationField } from "../utils/destination-field.js";
import { qrImageUrl } from "../utils/qr.js";
import { formatElapsed, elapsedMinutes, startLocalTicker, formatDateTime } from "../utils/time.js";
import { getProfile } from "../services/auth.service.js";
import { navigate } from "../router.js";

const TYPE_BADGE = {
  visitor: null,
  disability: { icon: "wheelchair", text: "DISCAPACIDAD", cls: "badge--disability" },
  disabled: { icon: null, text: "FUERA DE SERVICIO", cls: "badge--disabled" },
};

export function renderParking(root) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("parking"), "Parqueos de visita"]),
    ])
  );

  const grid = el("div", { class: "parking-grid" });
  root.appendChild(grid);

  let spaces = [];

  function renderGrid() {
    clear(grid);
    for (const space of spaces) grid.appendChild(renderSpaceCard(space));
  }

  function updateTimers() {
    for (const space of spaces) {
      if (space.status !== "occupied") continue;
      const timerEl = document.getElementById(`timer-${space.number}`);
      const cardEl = document.getElementById(`space-${space.number}`);
      if (!timerEl || !cardEl) continue;
      timerEl.textContent = formatElapsed(space.entryAt);
      const mins = elapsedMinutes(space.entryAt);
      const overdue = space.maxMinutesAtEntry && mins > space.maxMinutesAtEntry;
      cardEl.classList.toggle("space-card--overdue", !!overdue);
      timerEl.classList.toggle("timer--overdue", !!overdue);
    }
  }

  const stopTicker = startLocalTicker(updateTimers);

  const unsub = subscribeParkingSpaces(
    (data) => {
      spaces = data;
      renderGrid();
    },
    () => toast("No se pudo cargar el estado de los parqueos. Verifique su conexión.", "danger")
  );

  return () => {
    unsub();
    stopTicker();
  };
}

function renderSpaceCard(space) {
  const isFree = space.status === "free";
  const isDisabled = space.type === "disabled";
  const badge = TYPE_BADGE[space.type];

  const classes = ["space-card"];
  if (isDisabled) classes.push("space-card--disabled");
  else if (isFree) classes.push(space.type === "disability" ? "space-card--disability" : "space-card--free");
  else classes.push("space-card--occupied");

  const children = [
    el("div", { class: "space-card__number" }, `PARQUEO ${space.number}`),
    badge ? el("span", { class: `badge ${badge.cls}` }, [badge.icon ? icon(badge.icon, { size: 14 }) : null, badge.text].filter(Boolean)) : null,
  ];

  if (isDisabled) {
    children.push(el("div", { class: "text-secondary" }, "No disponible"));
  } else if (isFree) {
    children.push(el("span", { class: "badge badge--free" }, [el("span", { class: "status-dot" }), "LIBRE"]));
  } else {
    children.push(el("span", { class: "badge badge--occupied" }, [el("span", { class: "status-dot" }), "OCUPADO"]));
    children.push(el("div", { style: "font-weight:700;" }, space.visitorName || ""));
    children.push(el("div", { class: "text-secondary" }, `${space.plate || ""} · Apt. ${space.destinationNumber || ""}`));
    children.push(el("div", { class: "timer mono", id: `timer-${space.number}` }, formatElapsed(space.entryAt)));
  }

  return el("div", {
    class: classes.join(" "),
    id: `space-${space.number}`,
    onclick: isDisabled ? null : () => (isFree ? openEntryModal(space) : openExitModal(space)),
  }, children.filter(Boolean));
}

function openEntryModal(space) {
  const profile = getProfile();
  const nameInput = el("input", { class: "form-control", required: true });
  const idInput = el("input", { class: "form-control", required: true });
  const plateInput = el("input", { class: "form-control", required: true, style: "text-transform:uppercase;" });

  const defaultTower = profile.lobby === "A" || profile.lobby === "B" ? profile.lobby : "A";
  const destField = createDestinationField({ defaultTower, required: true });
  const destTypeInput = el("select", { class: "form-control" }, [
    el("option", { value: "apartment" }, "Apartamento"),
    el("option", { value: "office" }, "Oficina / Comercio"),
  ]);
  function syncSuggestedType() {
    const result = destField.getResult();
    if (result.ok && result.type) destTypeInput.value = result.type;
  }
  destField.towerSelect.addEventListener("change", syncSuggestedType);
  destField.numberInput.addEventListener("input", syncSuggestedType);

  const limitHint = el(
    "div",
    { class: "form-hint" },
    `Límite automático: apartamentos hasta ${MAX_MINUTES_APARTMENT / 60} horas, oficinas/comercios hasta ${MAX_MINUTES_OFFICE / 60} horas. Máximo ${MAX_SIMULTANEOUS_PER_DESTINATION} parqueos de visita simultáneos por apartamento/oficina.`
  );
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR ENTRADA");

  let lobbySelect = null;
  if (profile.role === "admin" && !profile.lobby) {
    lobbySelect = el("select", { class: "form-control" }, [
      el("option", { value: "A" }, "Lobby A"),
      el("option", { value: "B" }, "Lobby B"),
    ]);
  }

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";
        const destResult = destField.getResult();
        if (!destResult.ok) {
          errorBox.textContent = destResult.error;
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          const result = await registerEntry(space.number, {
            visitorName: nameInput.value.trim(),
            visitorId: idInput.value.trim(),
            plate: plateInput.value.trim().toUpperCase(),
            destinationType: destTypeInput.value,
            destinationNumber: destResult.code,
            lobbyOverride: lobbySelect ? lobbySelect.value : null,
          });
          toast(`Entrada registrada en el parqueo ${space.number}.`, "success");
          showConsultaQr(space.number, result.consultaUrl, closeFn);
        } catch (err) {
          errorBox.textContent = err instanceof OperationError ? err.message : "No fue posible registrar la entrada. Intente nuevamente.";
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTRAR ENTRADA";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, `Registrar entrada — Parqueo ${space.number}`),
      field("Nombre", nameInput),
      field("Cédula", idInput),
      field("Placa", plateInput),
      field("Torre", destField.towerSelect),
      field("Número de piso + unidad", destField.numberInput),
      destField.hint,
      field("Destino", destTypeInput),
      limitHint,
      lobbySelect ? field("Lobby que registra", lobbySelect) : null,
      errorBox,
      submitBtn,
    ].filter(Boolean)
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function openExitModal(space) {
  const profile = getProfile();
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const timerEl = el("div", { class: "timer mono", id: "exit-modal-timer" }, formatElapsed(space.entryAt));
  const confirmBtn = el("button", { class: "btn btn--danger btn--block btn--lg" }, "REGISTRAR SALIDA");
  const qrBtn = el("button", { class: "btn btn--secondary btn--block" }, [icon("card", { size: 18 }), " Ver código QR de consulta"]);
  qrBtn.addEventListener("click", () => {
    if (space.sessionId) showConsultaQr(space.number, buildConsultaUrl(space.sessionId), null);
  });

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Parqueo ${space.number}`),
    el("div", { class: "card" }, [
      row("Nombre", space.visitorName),
      row("Cédula", space.visitorId),
      row("Placa", space.plate),
      row("Destino", `${space.destinationType === "office" ? "Oficina" : "Apartamento"} ${space.destinationNumber || ""}`),
      row("Entrada", formatDateTime(space.entryAt)),
      row("Registrado por", `${space.entryGuardName || ""} (Lobby ${space.entryLobby || "-"})`),
    ]),
    el("div", { class: "text-center" }, [el("div", { class: "text-secondary" }, "Tiempo transcurrido"), timerEl]),
    qrBtn,
    errorBox,
    confirmBtn,
  ]);

  const tickerStop = startLocalTicker(() => {
    timerEl.textContent = formatElapsed(space.entryAt);
  });

  const closeFn = openModal(content);
  const originalClose = closeFn;

  confirmBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Confirmar salida",
      body: `¿Confirma la salida del vehículo ${space.plate} (parqueo ${space.number})? El espacio quedará disponible de inmediato.`,
      confirmText: "Sí, registrar salida",
      danger: true,
    });
    if (!ok) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "GUARDANDO...";
    try {
      await registerExit(space.number);
      toast(`Salida registrada. Parqueo ${space.number} liberado.`, "success");
      tickerStop();
      originalClose();
    } catch (err) {
      errorBox.textContent = err instanceof OperationError ? err.message : "No fue posible registrar la salida. Intente nuevamente.";
      errorBox.style.display = "block";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "REGISTRAR SALIDA";
    }
  });
}

/** Muestra el código QR de consulta pública para que el guardia se lo enseñe al visitante. */
function showConsultaQr(spaceNumber, consultaUrl, closeParentModal) {
  if (closeParentModal) closeParentModal();
  const okBtn = el("button", { class: "btn btn--primary btn--block btn--lg mt-md" }, "LISTO");
  const content = el("div", { class: "stack text-center" }, [
    el("div", { class: "modal__title" }, `Código de consulta — Parqueo ${spaceNumber}`),
    el("div", { class: "text-secondary mb-md" }, "Muéstrele este código QR al visitante para que consulte desde su celular cuánto tiempo de parqueo le queda, sin necesidad de cuenta ni contraseña."),
    el("img", { src: qrImageUrl(consultaUrl), alt: "Código QR de consulta", style: "margin:0 auto; border-radius:var(--radius-sm);" }),
    okBtn,
  ]);
  const closeFn = openModal(content);
  okBtn.addEventListener("click", closeFn);
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}

function row(labelText, value) {
  return el("div", { class: "row row--between", style: "padding:4px 0;" }, [
    el("span", { class: "text-secondary" }, labelText),
    el("strong", {}, value || "--"),
  ]);
}
