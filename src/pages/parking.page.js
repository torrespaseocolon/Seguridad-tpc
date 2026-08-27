import { el, clear, toast, confirmDialog, openModal, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import {
  subscribeParkingSpaces,
  registerEntry,
  registerExit,
  subscribeMotoSessions,
  registerMotoEntry,
  registerMotoExit,
  MOTO_SPACE_CAPACITY,
  buildConsultaUrl,
  fetchParkingHistory,
  OperationError,
} from "../services/parking.service.js";
import { createDestinationField } from "../utils/destination-field.js";
import { destinationLabel, PROVIDER_DESTINATION_TYPE, PROVIDER_DESTINATION_NUMBER } from "../utils/destination.js";
import { qrImageUrl } from "../utils/qr.js";
import { formatElapsed, elapsedMinutes, startLocalTicker, formatDateTime, formatMinutesDuration } from "../utils/time.js";
import { getProfile } from "../services/auth.service.js";
import { navigate } from "../router.js";
import { notificationsSupported, getPermission, isEnabled, enable, disable, notify } from "../utils/notify.js";
import { whatsappLink } from "../utils/whatsapp.js";
import { friendlyError } from "../utils/errors.js";

// La entrada física de los parqueos de visita está solo en Lobby B (ver
// commit "Poner Lobby B primero en el selector de lobby"). Por eso, desde
// ago-2026, solo el guardia de Lobby B (o un administrador, que no está
// atado a un lobby) puede registrar entradas y salidas; el guardia de
// Lobby A queda en modo consulta: ve el estado en tiempo real y puede
// avisarle al visitante por WhatsApp o mostrarle su QR, para poder ayudar a
// Lobby B a distancia, pero no puede cambiar nada. La barrera real está en
// firestore.rules — esto es solo para no mostrarle botones que de todas
// formas el servidor le rechazaría.
function canOperateParking(profile) {
  return profile.role === "admin" || profile.lobby === "B";
}

const TYPE_BADGE = {
  visitor: null,
  disability: { icon: "wheelchair", text: "DISCAPACIDAD", cls: "badge--disability" },
  disabled: { icon: null, text: "FUERA DE SERVICIO", cls: "badge--disabled" },
};

export function renderParking(root) {
  clear(root);

  const notifyBtn = buildNotifyToggle();
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("parking"), "Parqueos de visita"]),
      notifyBtn,
    ])
  );

  const searchInput = el("input", { class: "form-control", placeholder: "Buscar por nombre, cédula, placa o apartamento..." });
  root.appendChild(el("div", { class: "form-group mb-md" }, [searchInput]));
  searchInput.addEventListener("input", () => renderGrid());

  root.appendChild(buildHistorySearch());

  const grid = el("div", { class: "parking-grid" });
  root.appendChild(grid);

  let spaces = [];
  const notifiedSpaces = new Set();
  // Los espacios de moto (varias motos independientes en UN solo espacio
  // físico) se renderizan con su propio widget persistente, que trae su
  // propia suscripción en tiempo real a las motos parqueadas — no se
  // recrean en cada renderGrid() para no reiniciar esa suscripción cada vez
  // que cambia OTRO espacio normal del grid (ver renderMotoSpaceCard).
  const motoWidgets = new Map();

  function renderGrid() {
    const term = searchInput.value.trim().toLowerCase();
    const motoSpaces = spaces.filter((s) => s.type === "moto");
    let normalSpaces = spaces.filter((s) => s.type !== "moto");
    if (term) {
      normalSpaces = normalSpaces.filter(
        (s) =>
          s.status === "occupied" &&
          ((s.visitorName || "").toLowerCase().includes(term) ||
            (s.visitorId || "").toLowerCase().includes(term) ||
            (s.plate || "").toLowerCase().includes(term) ||
            (s.destinationNumber || "").toLowerCase().includes(term))
      );
    }

    clear(grid);
    for (const space of motoSpaces) {
      if (!motoWidgets.has(space.number)) {
        motoWidgets.set(space.number, renderMotoSpaceCard(space));
      }
      grid.appendChild(motoWidgets.get(space.number).el);
    }
    for (const space of normalSpaces) grid.appendChild(renderSpaceCard(space));
    if (term && normalSpaces.length === 0) {
      const notice = emptyState("parking", "Ningún parqueo de carro coincide con la búsqueda.");
      notice.style.gridColumn = "1 / -1";
      grid.appendChild(notice);
    }

    for (const [number, widget] of motoWidgets) {
      if (!motoSpaces.some((s) => s.number === number)) {
        widget.cleanup();
        motoWidgets.delete(number);
      }
    }
  }

  function updateTimers() {
    for (const space of spaces) {
      if (space.type === "moto" || space.status !== "occupied") continue;
      const timerEl = document.getElementById(`timer-${space.number}`);
      const cardEl = document.getElementById(`space-${space.number}`);
      const mins = elapsedMinutes(space.entryAt);
      const overdue = space.maxMinutesAtEntry && mins > space.maxMinutesAtEntry;

      if (overdue && !notifiedSpaces.has(space.number)) {
        notifiedSpaces.add(space.number);
        notify(`Parqueo ${space.number} — tiempo vencido`, {
          body: `${space.visitorName || "El vehículo"} (${space.plate || "sin placa"}) ya superó el tiempo permitido.`,
          tag: `parking-overdue-${space.number}`,
        });
      } else if (!overdue) {
        notifiedSpaces.delete(space.number);
      }

      if (!timerEl || !cardEl) continue;
      timerEl.textContent = formatElapsed(space.entryAt);
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
    for (const widget of motoWidgets.values()) widget.cleanup();
  };
}

/**
 * Espacio 01 — Motos: un solo espacio físico donde caben varias motos a la
 * vez (ver MOTO_SPACE_CAPACITY), cada una con su propio tiempo. En la
 * cuadrícula se ve como una tarjeta compacta más (mismo tamaño que un
 * espacio normal, para no verse fuera de lugar en pantallas chicas) con la
 * cantidad ocupada; al tocarla se abre un modal con el detalle: una fila
 * por moto parqueada (con su cronómetro y botón de salida individual) y una
 * fila "LIBRE" por cada cupo disponible. El documento del espacio en sí
 * nunca cambia — lo que está ocupado se ve en vivo con subscribeMotoSessions
 * (ver nota en parking.service.js).
 */
function renderMotoSpaceCard(space) {
  const capacity = space.capacity || MOTO_SPACE_CAPACITY;
  let motoSessions = [];
  const notifiedSessions = new Set();
  let onListChange = null; // se activa mientras el modal de detalle está abierto, para refrescarlo en vivo

  const statusBadge = el("span", { class: "badge badge--free" }, [el("span", { class: "status-dot" }), "LIBRE"]);
  const tile = el(
    "div",
    { class: "space-card space-card--free", id: `space-${space.number}`, onclick: () => openMotoListModal() },
    [el("div", { class: "space-card__number" }, `PARQUEO ${space.number}`), statusBadge]
  );

  function refreshTile() {
    const occupied = motoSessions.length;
    const anyOverdue = motoSessions.some((s) => s.maxMinutesAtEntry && elapsedMinutes(s.entryAt) > s.maxMinutesAtEntry);
    clear(statusBadge);
    if (occupied === 0) {
      tile.className = "space-card space-card--free";
      statusBadge.className = "badge badge--free";
      statusBadge.append(el("span", { class: "status-dot" }), "LIBRE");
    } else {
      tile.className = "space-card space-card--occupied";
      statusBadge.className = "badge badge--occupied";
      statusBadge.append(el("span", { class: "status-dot" }), `${occupied}/${capacity} OCUPADAS`);
    }
    tile.classList.toggle("space-card--overdue", !!anyOverdue);
  }

  function checkNotifications() {
    const liveIds = new Set(motoSessions.map((s) => s.id));
    for (const id of notifiedSessions) {
      if (!liveIds.has(id)) notifiedSessions.delete(id);
    }
    for (const session of motoSessions) {
      const mins = elapsedMinutes(session.entryAt);
      const overdue = session.maxMinutesAtEntry && mins > session.maxMinutesAtEntry;
      if (overdue && !notifiedSessions.has(session.id)) {
        notifiedSessions.add(session.id);
        notify(`Parqueo ${space.number} (moto) — tiempo vencido`, {
          body: `${session.visitorName || "La moto"} (${session.plate || "sin placa"}) ya superó el tiempo permitido.`,
          tag: `parking-overdue-moto-${session.id}`,
        });
      } else if (!overdue) {
        notifiedSessions.delete(session.id);
      }
    }
  }

  function openMotoListModal() {
    const list = el("div", { class: "stack" });
    const content = el("div", { class: "stack" }, [
      el("div", { class: "modal__title" }, `Parqueo ${space.number} — Motos`),
      list,
    ]);

    function renderList() {
      clear(list);
      for (const session of motoSessions) list.appendChild(renderMotoSlot(space, session));
      const emptySlots = Math.max(0, capacity - motoSessions.length);
      for (let i = 0; i < emptySlots; i++) list.appendChild(renderEmptyMotoSlot(space));
    }

    renderList();
    openModal(content, { onClose: () => { onListChange = null; } });
    onListChange = renderList;
  }

  function updateMotoTimers() {
    checkNotifications();
    refreshTile();
    for (const session of motoSessions) {
      const timerEl = document.getElementById(`moto-timer-${session.id}`);
      const rowEl = document.getElementById(`moto-row-${session.id}`);
      if (!timerEl || !rowEl) continue;
      const mins = elapsedMinutes(session.entryAt);
      const overdue = session.maxMinutesAtEntry && mins > session.maxMinutesAtEntry;
      timerEl.textContent = formatElapsed(session.entryAt);
      timerEl.classList.toggle("timer--overdue", !!overdue);
      rowEl.classList.toggle("space-card--overdue", !!overdue);
    }
  }

  const unsub = subscribeMotoSessions(space.number, (sessions) => {
    motoSessions = sessions;
    refreshTile();
    if (onListChange) onListChange();
  });
  const stopTicker = startLocalTicker(updateMotoTimers);

  return {
    el: tile,
    cleanup: () => {
      unsub();
      stopTicker();
    },
  };
}

function renderMotoSlot(space, session) {
  const canOperate = canOperateParking(getProfile());
  return el(
    "div",
    {
      class: "card row row--between",
      id: `moto-row-${session.id}`,
      style: "cursor:pointer; flex-wrap:wrap; gap:8px;",
      onclick: () => openMotoExitModal(space, session),
    },
    [
      el("div", {}, [
        el("div", { style: "font-weight:700;" }, session.visitorName || ""),
        el("div", { class: "text-secondary" }, `${session.plate || ""} · Apt. ${session.destinationNumber || ""}`),
      ]),
      el("div", { class: "row", style: "gap:10px; align-items:center;" }, [
        canOperate ? null : el("span", { class: "badge badge--info" }, "CONSULTA"),
        el("div", { class: "timer mono", id: `moto-timer-${session.id}` }, formatElapsed(session.entryAt)),
      ].filter(Boolean)),
    ]
  );
}

function renderEmptyMotoSlot(space) {
  const canOperate = canOperateParking(getProfile());
  return el(
    "div",
    {
      class: "card row",
      style: "cursor:pointer;",
      onclick: () => {
        if (!canOperate) {
          toast("Solo el guardia de Lobby B (o un administrador) puede registrar entradas de parqueo.", "info");
          return;
        }
        openMotoEntryModal(space);
      },
    },
    [el("span", { class: "badge badge--free" }, [el("span", { class: "status-dot" }), "LIBRE — Registrar moto"])]
  );
}

function renderSpaceCard(space) {
  const isFree = space.status === "free";
  const isDisabled = space.type === "disabled";
  const canOperate = canOperateParking(getProfile());
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
    onclick: isDisabled
      ? null
      : () => {
          if (isFree && !canOperate) {
            toast("Solo el guardia de Lobby B (o un administrador) puede registrar entradas de parqueo.", "info");
            return;
          }
          if (isFree) openEntryModal(space);
          else openExitModal(space);
        },
  }, children.filter(Boolean));
}

function openEntryModal(space) {
  const profile = getProfile();
  const nameInput = el("input", { class: "form-control", required: true });
  const idInput = el("input", { class: "form-control", required: true });
  const plateInput = el("input", { class: "form-control", required: true, style: "text-transform:uppercase;" });
  const phoneInput = el("input", { class: "form-control", type: "tel", required: true, placeholder: "Ej. 8888 8888" });

  const defaultTower = profile.lobby === "A" || profile.lobby === "B" ? profile.lobby : "A";
  const destField = createDestinationField({ defaultTower, required: true });

  const categorySelect = el("select", { class: "form-control" }, [
    el("option", { value: "visitor" }, "Visitante"),
    el("option", { value: "provider" }, "Proveedor (sin límite de tiempo, no visita una unidad puntual)"),
  ]);
  const destFieldWrapper = field("Torre + piso + unidad", destField.input);
  categorySelect.addEventListener("change", () => {
    const isProvider = categorySelect.value === "provider";
    destFieldWrapper.style.display = isProvider ? "none" : "";
    destField.hint.style.display = isProvider ? "none" : "";
  });

  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR ENTRADA");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";
        const isProvider = categorySelect.value === "provider";
        let destinationType, destinationNumber;
        if (isProvider) {
          destinationType = PROVIDER_DESTINATION_TYPE;
          destinationNumber = PROVIDER_DESTINATION_NUMBER;
        } else {
          const destResult = destField.getResult();
          if (!destResult.ok) {
            errorBox.textContent = destResult.error;
            errorBox.style.display = "block";
            return;
          }
          if (!destResult.type) {
            errorBox.textContent = "No se pudo determinar automáticamente si es apartamento u oficina/comercio para ese piso (los pisos 2 a 7 de la Torre B son de parqueo interno, sin unidades). Verifique el número.";
            errorBox.style.display = "block";
            return;
          }
          destinationType = destResult.type;
          destinationNumber = destResult.code;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          // El lobby que registra se detecta del propio perfil que inició
          // sesión (profile.lobby); si es un administrador sin lobby
          // asignado, se usa Lobby B por defecto — es donde físicamente
          // está la entrada real de los parqueos de visita.
          const result = await registerEntry(space.number, {
            visitorName: nameInput.value.trim(),
            visitorId: idInput.value.trim(),
            plate: plateInput.value.trim().toUpperCase(),
            visitorPhone: phoneInput.value.trim(),
            destinationType,
            destinationNumber,
            lobbyOverride: "B",
          });
          toast(`Entrada registrada en el parqueo ${space.number}.`, "success");
          showConsultaQr(space.number, result.consultaUrl, closeFn, { name: nameInput.value.trim(), phone: phoneInput.value.trim() });
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
      field("Teléfono *", phoneInput),
      field("Categoría", categorySelect),
      destFieldWrapper,
      destField.hint,
      errorBox,
      submitBtn,
    ].filter(Boolean)
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function openExitModal(space) {
  const profile = getProfile();
  const canOperate = canOperateParking(profile);
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const timerEl = el("div", { class: "timer mono", id: "exit-modal-timer" }, formatElapsed(space.entryAt));
  const confirmBtn = canOperate ? el("button", { class: "btn btn--danger btn--block btn--lg" }, "REGISTRAR SALIDA") : null;
  const readOnlyNote = canOperate
    ? null
    : el("div", { class: "form-hint text-center" }, "Solo el guardia de Lobby B (o un administrador) puede registrar la salida. Puede avisarle al visitante por WhatsApp o mostrarle el QR mientras tanto.");
  const qrBtn = el("button", { class: "btn btn--secondary btn--block" }, [icon("card", { size: 18 }), " Ver código QR de consulta"]);
  qrBtn.addEventListener("click", () => {
    if (space.sessionId) showConsultaQr(space.number, buildConsultaUrl(space.sessionId), null, { name: space.visitorName, phone: space.visitorPhone });
  });

  let whatsappBtn = null;
  if (space.visitorPhone) {
    const link = whatsappLink(
      space.visitorPhone,
      `Hola${space.visitorName ? " " + space.visitorName : ""}, le escribimos de seguridad Torres Paseo Colón: su tiempo de parqueo en el espacio ${space.number} está por vencer (o ya venció). Si necesita más tiempo, avísenos y con gusto se lo extendemos.`
    );
    if (link) {
      whatsappBtn = el(
        "a",
        { href: link, target: "_blank", rel: "noopener", class: "btn btn--success btn--block" },
        [icon("whatsapp", { size: 18 }), " Avisar por WhatsApp"]
      );
    }
  }

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Parqueo ${space.number}`),
    el("div", { class: "card" }, [
      row("Nombre", space.visitorName),
      row("Cédula", space.visitorId),
      row("Placa", space.plate),
      row("Destino", destinationLabel(space.destinationType, space.destinationNumber)),
      row("Entrada", formatDateTime(space.entryAt)),
      row("Registrado por", `${space.entryGuardName || ""} (Lobby ${space.entryLobby || "-"})`),
    ]),
    el("div", { class: "text-center" }, [el("div", { class: "text-secondary" }, "Tiempo transcurrido"), timerEl]),
    qrBtn,
    whatsappBtn,
    readOnlyNote,
    errorBox,
    confirmBtn,
  ].filter(Boolean));

  const tickerStop = startLocalTicker(() => {
    timerEl.textContent = formatElapsed(space.entryAt);
  });

  const closeFn = openModal(content);
  const originalClose = closeFn;

  if (confirmBtn) {
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
        await registerExit(space.number, space.sessionId, space.entryAt);
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
}

function openMotoEntryModal(space) {
  const profile = getProfile();
  const nameInput = el("input", { class: "form-control", required: true });
  const idInput = el("input", { class: "form-control", required: true });
  const plateInput = el("input", { class: "form-control", required: true, style: "text-transform:uppercase;" });
  const phoneInput = el("input", { class: "form-control", type: "tel", required: true, placeholder: "Ej. 8888 8888" });

  const defaultTower = profile.lobby === "A" || profile.lobby === "B" ? profile.lobby : "A";
  const destField = createDestinationField({ defaultTower, required: true });

  const categorySelect = el("select", { class: "form-control" }, [
    el("option", { value: "visitor" }, "Visitante"),
    el("option", { value: "provider" }, "Proveedor (sin límite de tiempo, no visita una unidad puntual)"),
  ]);
  const destFieldWrapper = field("Torre + piso + unidad", destField.input);
  categorySelect.addEventListener("change", () => {
    const isProvider = categorySelect.value === "provider";
    destFieldWrapper.style.display = isProvider ? "none" : "";
    destField.hint.style.display = isProvider ? "none" : "";
  });

  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR ENTRADA");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        errorBox.style.display = "none";
        const isProvider = categorySelect.value === "provider";
        let destinationType, destinationNumber;
        if (isProvider) {
          destinationType = PROVIDER_DESTINATION_TYPE;
          destinationNumber = PROVIDER_DESTINATION_NUMBER;
        } else {
          const destResult = destField.getResult();
          if (!destResult.ok) {
            errorBox.textContent = destResult.error;
            errorBox.style.display = "block";
            return;
          }
          if (!destResult.type) {
            errorBox.textContent = "No se pudo determinar automáticamente si es apartamento u oficina/comercio para ese piso (los pisos 2 a 7 de la Torre B son de parqueo interno, sin unidades). Verifique el número.";
            errorBox.style.display = "block";
            return;
          }
          destinationType = destResult.type;
          destinationNumber = destResult.code;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          const result = await registerMotoEntry(space.number, {
            visitorName: nameInput.value.trim(),
            visitorId: idInput.value.trim(),
            plate: plateInput.value.trim().toUpperCase(),
            visitorPhone: phoneInput.value.trim(),
            destinationType,
            destinationNumber,
            lobbyOverride: "B",
          });
          toast(`Entrada de moto registrada en el parqueo ${space.number}.`, "success");
          showConsultaQr(`${space.number} (moto)`, result.consultaUrl, closeFn, { name: nameInput.value.trim(), phone: phoneInput.value.trim() });
        } catch (err) {
          errorBox.textContent = err instanceof OperationError ? err.message : "No fue posible registrar la entrada. Intente nuevamente.";
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTRAR ENTRADA";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, `Registrar entrada de moto — Parqueo ${space.number}`),
      field("Nombre", nameInput),
      field("Cédula", idInput),
      field("Placa", plateInput),
      field("Teléfono *", phoneInput),
      field("Categoría", categorySelect),
      destFieldWrapper,
      destField.hint,
      errorBox,
      submitBtn,
    ].filter(Boolean)
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function openMotoExitModal(space, session) {
  const profile = getProfile();
  const canOperate = canOperateParking(profile);
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const timerEl = el("div", { class: "timer mono", id: "exit-modal-timer" }, formatElapsed(session.entryAt));
  const confirmBtn = canOperate ? el("button", { class: "btn btn--danger btn--block btn--lg" }, "REGISTRAR SALIDA") : null;
  const readOnlyNote = canOperate
    ? null
    : el("div", { class: "form-hint text-center" }, "Solo el guardia de Lobby B (o un administrador) puede registrar la salida. Puede avisarle al visitante por WhatsApp o mostrarle el QR mientras tanto.");
  const qrBtn = el("button", { class: "btn btn--secondary btn--block" }, [icon("card", { size: 18 }), " Ver código QR de consulta"]);
  qrBtn.addEventListener("click", () => showConsultaQr(`${space.number} (moto)`, buildConsultaUrl(session.id), null, { name: session.visitorName, phone: session.visitorPhone }));

  let whatsappBtn = null;
  if (session.visitorPhone) {
    const link = whatsappLink(
      session.visitorPhone,
      `Hola${session.visitorName ? " " + session.visitorName : ""}, le escribimos de seguridad Torres Paseo Colón: su tiempo de parqueo de moto en el espacio ${space.number} está por vencer (o ya venció). Si necesita más tiempo, avísenos y con gusto se lo extendemos.`
    );
    if (link) {
      whatsappBtn = el(
        "a",
        { href: link, target: "_blank", rel: "noopener", class: "btn btn--success btn--block" },
        [icon("whatsapp", { size: 18 }), " Avisar por WhatsApp"]
      );
    }
  }

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Parqueo ${space.number} — Moto`),
    el("div", { class: "card" }, [
      row("Nombre", session.visitorName),
      row("Cédula", session.visitorId),
      row("Placa", session.plate),
      row("Destino", destinationLabel(session.destinationType, session.destinationNumber)),
      row("Entrada", formatDateTime(session.entryAt)),
      row("Registrado por", `${session.entryGuardName || ""} (Lobby ${session.entryLobby || "-"})`),
    ]),
    el("div", { class: "text-center" }, [el("div", { class: "text-secondary" }, "Tiempo transcurrido"), timerEl]),
    qrBtn,
    whatsappBtn,
    readOnlyNote,
    errorBox,
    confirmBtn,
  ].filter(Boolean));

  const tickerStop = startLocalTicker(() => {
    timerEl.textContent = formatElapsed(session.entryAt);
  });

  const closeFn = openModal(content);

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Confirmar salida",
        body: `¿Confirma la salida de la moto ${session.plate} (parqueo ${space.number})? Ese cupo de moto quedará disponible de inmediato.`,
        confirmText: "Sí, registrar salida",
        danger: true,
      });
      if (!ok) return;
      confirmBtn.disabled = true;
      confirmBtn.textContent = "GUARDANDO...";
      try {
        await registerMotoExit(session.id, session.entryAt);
        toast(`Salida registrada. Cupo de moto liberado en el parqueo ${space.number}.`, "success");
        tickerStop();
        closeFn();
      } catch (err) {
        errorBox.textContent = err instanceof OperationError ? err.message : "No fue posible registrar la salida. Intente nuevamente.";
        errorBox.style.display = "block";
        confirmBtn.disabled = false;
        confirmBtn.textContent = "REGISTRAR SALIDA";
      }
    });
  }
}

/**
 * Panel colapsable para buscar en el HISTORIAL de parqueos (registros ya
 * cerrados) por nombre, cédula, placa o apartamento, con filtro opcional de
 * fecha — a diferencia del buscador de arriba (que filtra la cuadrícula EN
 * VIVO, solo lo que está ocupado ahora mismo). Cualquier guardia puede
 * usarlo: no necesita entrar a Administración → Reportes (esa pantalla es
 * solo para administradores).
 */
function buildHistorySearch() {
  const toggleBtn = el("button", { class: "btn btn--secondary btn--block mb-md" }, [icon("activity", { size: 18 }), " Buscar en historial de parqueos"]);
  const panel = el("div", { class: "card mb-md", style: "display:none;" });
  const wrapper = el("div", {}, [toggleBtn, panel]);

  const searchInput = el("input", { class: "form-control", placeholder: "Buscar por nombre, cédula, placa o apartamento..." });
  const fromInput = el("input", { class: "form-control", type: "date" });
  const toInput = el("input", { class: "form-control", type: "date" });
  const clearBtn = el("button", { class: "btn btn--secondary" }, "Quitar filtros");
  const list = el("div", { class: "stack" });

  panel.appendChild(el("div", { class: "card__title" }, "Historial de parqueos"));
  panel.appendChild(field("Nombre, cédula, placa o apartamento", searchInput));
  panel.appendChild(
    el("div", { class: "row", style: "flex-wrap:wrap; gap:12px;" }, [
      field("Desde", fromInput),
      field("Hasta", toInput),
      el("div", { style: "align-self:flex-end;" }, [clearBtn]),
    ])
  );
  panel.appendChild(el("div", { class: "form-hint mb-md" }, "Sin fechas se muestran los registros más recientes."));
  panel.appendChild(list);

  let allRows = [];
  let loaded = false;

  function renderList() {
    clear(list);
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? allRows.filter(
          (r) =>
            (r.visitorName || "").toLowerCase().includes(term) ||
            (r.visitorId || "").toLowerCase().includes(term) ||
            (r.plate || "").toLowerCase().includes(term) ||
            (r.destinationNumber || "").toLowerCase().includes(term)
        )
      : allRows;
    if (filtered.length === 0) {
      list.appendChild(emptyState("parking", allRows.length === 0 ? "Sin registros en el historial." : "Ningún registro coincide con la búsqueda."));
      return;
    }
    for (const r of filtered) {
      list.appendChild(
        el("div", { class: "card" }, [
          el("div", { class: "row row--between" }, [el("strong", {}, `Parqueo ${r.spaceNumber} — ${r.plate || ""}`), el("span", { class: "text-faint" }, `Lobby ${r.entryLobby || "-"}`)]),
          el("div", { class: "text-secondary" }, `${r.visitorName || ""} · Cédula ${r.visitorId || "-"} · ${destinationLabel(r.destinationType, r.destinationNumber)}`),
          el("div", { class: "text-faint" }, `${formatDateTime(r.entryAt)} → ${formatDateTime(r.exitAt)} (${formatMinutesDuration(r.durationMinutes)})`),
        ])
      );
    }
  }

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const from = fromInput.value ? new Date(`${fromInput.value}T00:00:00`) : null;
      const to = toInput.value ? new Date(`${toInput.value}T23:59:59.999`) : null;
      allRows = await fetchParkingHistory({ max: from || to ? 500 : 100, from, to });
      loaded = true;
      renderList();
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  searchInput.addEventListener("input", renderList);
  fromInput.addEventListener("change", load);
  toInput.addEventListener("change", load);
  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    load();
  });

  toggleBtn.addEventListener("click", () => {
    const open = panel.style.display === "none";
    panel.style.display = open ? "" : "none";
    if (open && !loaded) load();
  });

  return wrapper;
}

/**
 * Botón para activar/silenciar los avisos del sistema operativo cuando un
 * parqueo se pasa del tiempo permitido. Solo funciona mientras esta
 * pantalla está abierta (ver nota en utils/notify.js) — es el nivel gratis
 * de notificaciones, sin ningún servicio de pago de por medio.
 */
function buildNotifyToggle() {
  if (!notificationsSupported()) return el("span", {});

  const btn = el("button", { class: "btn btn--secondary", style: "margin-left:auto;", title: "Avisos de tiempo vencido" });

  function refresh() {
    clear(btn);
    const permission = getPermission();
    if (permission === "denied") {
      btn.appendChild(icon("bellOff", { size: 18 }));
      btn.title = "Notificaciones bloqueadas por el navegador. Habilítelas desde la configuración del sitio.";
      btn.disabled = false;
    } else if (isEnabled()) {
      btn.appendChild(icon("bell", { size: 18 }));
      btn.title = "Avisos activados. Tocar para silenciar.";
    } else {
      btn.appendChild(icon("bellOff", { size: 18 }));
      btn.title = "Tocar para activar avisos cuando un parqueo se pase del tiempo.";
    }
  }

  btn.addEventListener("click", async () => {
    if (getPermission() === "denied") {
      toast("Las notificaciones están bloqueadas para este sitio. Actívelas desde la configuración del navegador.", "info");
      return;
    }
    if (isEnabled()) {
      disable();
      toast("Avisos silenciados.", "info");
    } else {
      const ok = await enable();
      toast(ok ? "Avisos activados." : "No se pudo activar el permiso de notificaciones.", ok ? "success" : "danger");
    }
    refresh();
  });

  refresh();
  return btn;
}

/**
 * Muestra el código QR de consulta pública para que el guardia se lo
 * enseñe al visitante. `contact` (opcional: { name, phone }) agrega un
 * botón para mandárselo por WhatsApp — el mensaje lleva el enlace de
 * consulta como texto (WhatsApp no permite adjuntar la imagen del QR desde
 * un enlace wa.me sin la API de pago de WhatsApp Business), así que si el
 * QR no carga o no se puede escanear, el enlace es el respaldo: abre la
 * misma pantalla, que también muestra el código QR.
 */
export function showConsultaQr(spaceNumber, consultaUrl, closeParentModal, contact) {
  if (closeParentModal) closeParentModal();
  const okBtn = el("button", { class: "btn btn--primary btn--block btn--lg mt-md" }, "LISTO");
  const children = [
    el("div", { class: "modal__title" }, `Código de consulta — Parqueo ${spaceNumber}`),
    el("div", { class: "text-secondary mb-md" }, "Muéstrele este código QR al visitante para que consulte desde su celular cuánto tiempo de parqueo le queda, sin necesidad de cuenta ni contraseña."),
    el("img", { src: qrImageUrl(consultaUrl), alt: "Código QR de consulta", style: "margin:0 auto; border-radius:var(--radius-sm);" }),
  ];

  if (contact?.phone) {
    const message = `Hola${contact.name ? " " + contact.name : ""}, le escribimos de seguridad Torres Paseo Colón: este es su enlace para consultar el tiempo de su parqueo (parqueo ${spaceNumber}): ${consultaUrl}`;
    const link = whatsappLink(contact.phone, message);
    if (link) {
      children.push(
        el("a", { href: link, target: "_blank", rel: "noopener", class: "btn btn--success btn--block mt-md" }, [icon("whatsapp", { size: 18 }), " Enviar por WhatsApp"])
      );
    }
  }

  children.push(okBtn);
  const content = el("div", { class: "stack text-center" }, children);
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
