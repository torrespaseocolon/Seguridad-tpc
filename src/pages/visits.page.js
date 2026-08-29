import { el, clear, toast, openModal, confirmDialog, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { createDestinationField } from "../utils/destination-field.js";
import { destinationLabel } from "../utils/destination.js";
import {
  registerEntry,
  registerMotoEntry,
  registerVisitExit,
  fetchAvailableVisitorSpaces,
  OperationError,
} from "../services/parking.service.js";
import { createVisit, updateVisitEntry, markVisitExited, fetchRecentVisits, fetchVisitHistory } from "../services/visits.service.js";
import { getProfile } from "../services/auth.service.js";
import { formatDateTime } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";
import { showConsultaQr } from "./parking.page.js";

// Misma restricción que en Parqueos: la entrada física real de vehículos
// está solo en Lobby B, así que solo ese guardia (o un administrador) puede
// asignar un espacio desde acá. Cualquier guardia puede registrar la visita
// en sí (sin parqueo) — ver canOperateParking() en parking.page.js, misma
// lógica repetida acá para no tener que exportar una función de una
// pantalla que no es "dueña" de esta regla.
function canOperateParking(profile) {
  return profile.role === "admin" || profile.lobby === "B";
}

export function renderVisits(root) {
  clear(root);

  const searchInput = el("input", { class: "form-control", placeholder: "Buscar por nombre, cédula o apartamento..." });
  const fromInput = el("input", { class: "form-control", type: "date" });
  const toInput = el("input", { class: "form-control", type: "date" });
  const clearFiltersBtn = el("button", { class: "btn btn--secondary" }, "Quitar filtros");
  const searchPanel = el("div", { class: "card mb-md", style: "display:none;" }, [
    el("div", { class: "card__title" }, "Buscar"),
    field("Nombre, cédula o apartamento", searchInput),
    el("div", { class: "row", style: "flex-wrap:wrap; gap:12px;" }, [
      field("Desde", fromInput),
      field("Hasta", toInput),
      el("div", { style: "align-self:flex-end;" }, [clearFiltersBtn]),
    ]),
    el("div", { class: "form-hint" }, "Sin fechas se muestran las visitas más recientes."),
  ]);
  const searchToggleBtn = el("button", { class: "theme-toggle", type: "button", title: "Buscar visitas" }, [icon("search", { size: 20 })]);
  searchToggleBtn.addEventListener("click", () => {
    const open = searchPanel.style.display === "none";
    searchPanel.style.display = open ? "" : "none";
    if (open) searchInput.focus();
  });

  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row", style: "flex:1; min-width:0;" }, [icon("users"), "Visitantes"]),
      el("div", { class: "row", style: "flex-shrink:0;" }, [searchToggleBtn]),
    ])
  );
  root.appendChild(
    el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openNewVisitModal(load) }, [icon("plus", { size: 18 }), " NUEVO VISITANTE"])
  );
  root.appendChild(searchPanel);

  const list = el("div", { class: "stack" });
  root.appendChild(list);

  let allVisits = [];

  function renderList() {
    clear(list);
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? allVisits.filter(
          (v) =>
            (v.visitorName || "").toLowerCase().includes(term) ||
            (v.visitorId || "").toLowerCase().includes(term) ||
            (v.destinationNumber || "").toLowerCase().includes(term) ||
            (v.plate || "").toLowerCase().includes(term)
        )
      : allVisits;
    if (filtered.length === 0) {
      list.appendChild(emptyState("users", allVisits.length === 0 ? "Aún no hay visitas registradas." : "Ninguna visita coincide con la búsqueda."));
      return;
    }
    for (const v of filtered) list.appendChild(renderVisitCard(v, load));
  }

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const from = fromInput.value ? new Date(`${fromInput.value}T00:00:00`) : null;
      const to = toInput.value ? new Date(`${toInput.value}T23:59:59.999`) : null;
      allVisits = from || to ? await fetchVisitHistory({ from, to, max: 300 }) : await fetchRecentVisits(50);
      renderList();
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  searchInput.addEventListener("input", renderList);
  fromInput.addEventListener("change", load);
  toInput.addEventListener("change", load);
  clearFiltersBtn.addEventListener("click", () => {
    searchInput.value = "";
    fromInput.value = "";
    toInput.value = "";
    load();
  });

  load();
}

/** Modo de ingreso efectivo — `entryMode` puede faltar en registros viejos (antes de este cambio), se usa needsParking como respaldo. */
function effectiveMode(v) {
  return v.entryMode || (v.needsParking ? "parking" : null);
}

/** Distingue las 3 formas de ingreso (ver nota en visits.service.js). */
function modeBadge(v) {
  const mode = effectiveMode(v);
  if (mode === "parking") return el("span", { class: "badge badge--info" }, `Parqueo ${v.parkingSpaceNumber || "?"}`);
  if (mode === "ownerSpace") return el("span", { class: "badge badge--free" }, `Espacio propio · ${v.plate || "sin placa"}`);
  if (mode === "pedestrian") return el("span", { class: "badge badge--free" }, "Ingreso peatonal");
  return el("span", { class: "badge badge--free" }, "No necesita parqueo");
}

function modeDescription(v) {
  const mode = effectiveMode(v);
  if (mode === "parking") return `Parqueo de visita ${v.parkingSpaceNumber || "?"}`;
  if (mode === "ownerSpace") return `Espacio propio del apartamento/oficina (placa ${v.plate || "sin placa"})`;
  if (mode === "pedestrian") return "Ingreso peatonal, sin vehículo";
  return "Sin registrar";
}

function renderVisitCard(v, reload) {
  const canOperate = canOperateParking(getProfile());
  const canRegisterExit = v.needsParking && v.parkingSessionId && !v.exitAt && canOperate;

  let exitBtn = null;
  if (canRegisterExit) {
    exitBtn = el("button", { class: "btn btn--danger", style: "min-height:32px; padding:4px 10px; font-size:13px;" }, "SALIDA");
    exitBtn.addEventListener("click", async () => {
      const ok = await confirmDialog({
        title: "Confirmar salida",
        body: `¿Confirma la salida de ${v.visitorName} (parqueo ${v.parkingSpaceNumber})? El espacio quedará disponible de inmediato.`,
        confirmText: "Sí, registrar salida",
        danger: true,
      });
      if (!ok) return;
      exitBtn.disabled = true;
      try {
        const result = await registerVisitExit(v.parkingSessionId, v.parkingSpaceNumber);
        await markVisitExited(v.id);
        toast(result.alreadyClosed ? "Esa salida ya estaba registrada." : "Salida registrada.", "success");
        reload();
      } catch (err) {
        toast(friendlyError(err), "danger");
        exitBtn.disabled = false;
      }
    });
  }

  let correctBtn = null;
  if (canOperate) {
    correctBtn = el("button", { class: "btn btn--secondary", style: "min-height:32px; padding:4px 10px; font-size:13px;" }, "CORREGIR");
    correctBtn.addEventListener("click", () => openCorrectEntryModal(v, reload));
  }

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between", style: "flex-wrap:wrap; gap:8px;" }, [
      el("strong", {}, v.visitorName),
      el("div", { class: "row", style: "gap:8px; align-items:center; flex-wrap:wrap;" }, [modeBadge(v), exitBtn, correctBtn].filter(Boolean)),
    ]),
    el("div", { class: "text-secondary" }, `${destinationLabel(v.destinationType, v.destinationNumber)} · Cédula ${v.visitorId} · Tel. ${v.visitorPhone || "-"}`),
    el("div", { class: "row row--between", style: "padding-top:4px;" }, [
      el("span", { class: "text-secondary" }, "Entrada"),
      el("strong", {}, formatDateTime(v.createdAt)),
    ]),
    v.exitAt
      ? el("div", { class: "row row--between" }, [
          el("span", { class: "text-secondary" }, "Salida"),
          el("strong", {}, formatDateTime(v.exitAt)),
        ])
      : null,
    el("div", { class: "text-faint" }, v.createdByName || ""),
    v.notes ? el("div", { class: "text-faint" }, v.notes) : null,
  ].filter(Boolean));
}

function openNewVisitModal(reload, prefill = null) {
  const profile = getProfile();
  const canOperate = canOperateParking(profile);

  const nameInput = el("input", { class: "form-control", required: true, value: prefill?.visitorName || "" });
  const idInput = el("input", { class: "form-control", required: true, value: prefill?.visitorId || "" });
  const phoneInput = el("input", { class: "form-control", type: "tel", placeholder: "Ej. 8888 8888", value: prefill?.visitorPhone || "" });
  const defaultTower = profile.lobby === "A" || profile.lobby === "B" ? profile.lobby : "A";
  const destField = createDestinationField({ defaultTower, required: true, initialValue: prefill?.destinationNumber || "" });
  const notesInput = el("textarea", { class: "form-control", rows: "2" }, prefill?.notes || "");
  const plateInput = el("input", { class: "form-control", style: "text-transform:uppercase;", value: prefill?.plate || "" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });

  function collectVisitorData() {
    if (!nameInput.value.trim() || !idInput.value.trim()) {
      errorBox.textContent = "Complete nombre y cédula.";
      errorBox.style.display = "block";
      return null;
    }
    const destResult = destField.getResult();
    if (!destResult.ok) {
      errorBox.textContent = destResult.error;
      errorBox.style.display = "block";
      return null;
    }
    errorBox.style.display = "none";
    return {
      visitorName: nameInput.value.trim(),
      visitorId: idInput.value.trim(),
      visitorPhone: phoneInput.value.trim(),
      destinationType: destResult.type,
      destinationNumber: destResult.code,
      notes: notesInput.value.trim(),
    };
  }

  let parkingBtn = null;
  if (canOperate) {
    parkingBtn = el("button", { class: "btn btn--primary btn--block btn--lg" }, [icon("parking", { size: 18 }), " ASIGNAR PARQUEO"]);
    parkingBtn.addEventListener("click", () => {
      const data = collectVisitorData();
      if (!data) return;
      closeFn();
      openAssignSpaceModal(data, reload, () => openNewVisitModal(reload, { ...data, plate: plateInput.value.trim() }));
    });
  }

  const ownerSpaceBtn = el("button", { class: "btn btn--secondary btn--block btn--lg" }, [icon("card", { size: 18 }), " PARQUEA EN ESPACIO DE PROPIETARIO"]);
  ownerSpaceBtn.addEventListener("click", async () => {
    const data = collectVisitorData();
    if (!data) return;
    const plate = plateInput.value.trim().toUpperCase();
    if (!plate) {
      errorBox.textContent = "Ingrese la placa del vehículo para poder identificarlo.";
      errorBox.style.display = "block";
      return;
    }
    ownerSpaceBtn.disabled = true;
    try {
      await createVisit({ ...data, needsParking: false, entryMode: "ownerSpace", plate });
      toast("Visita registrada.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      ownerSpaceBtn.disabled = false;
    }
  });

  const pedestrianBtn = el("button", { class: "btn btn--secondary btn--block btn--lg" }, [icon("users", { size: 18 }), " INGRESO PEATONAL"]);
  pedestrianBtn.addEventListener("click", async () => {
    const data = collectVisitorData();
    if (!data) return;
    pedestrianBtn.disabled = true;
    try {
      await createVisit({ ...data, needsParking: false, entryMode: "pedestrian" });
      toast("Visita registrada.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      pedestrianBtn.disabled = false;
    }
  });

  const content = el(
    "div",
    { class: "stack" },
    [
      el("div", { class: "modal__title" }, "Nuevo visitante"),
      field("Nombre *", nameInput),
      field("Cédula *", idInput),
      field("Teléfono", phoneInput),
      field("Torre + piso + unidad — a quién visita *", destField.input),
      destField.hint,
      field("Placa (solo si va a parquear en el espacio del propietario)", plateInput),
      field("Observaciones", notesInput),
      errorBox,
      parkingBtn,
      !canOperate ? el("div", { class: "form-hint text-center" }, "Solo el guardia de Lobby B (o un administrador) puede asignar un parqueo compartido de visita desde acá.") : null,
      ownerSpaceBtn,
      pedestrianBtn,
    ].filter(Boolean)
  );

  const closeFn = openModal(content);
  nameInput.focus();
}

/**
 * Selector de espacio libre de visita (carro o moto), reutilizado tanto
 * para asignar un parqueo nuevo (Nuevo visitante → Asignar parqueo) como
 * para corregir uno (Corregir ingreso → "en realidad usó un parqueo de
 * visita") — solo cambia el título/botón y qué hace `onConfirm` con el
 * espacio y la placa elegidos. Cualquier error que lance `onConfirm` se
 * muestra en el propio modal en vez de cerrarlo.
 */
function openSpacePickerModal({ title, confirmLabel, initialPlate = "", extraFooter = [], onConfirm }) {
  const plateInput = el("input", { class: "form-control", required: true, style: "text-transform:uppercase;", value: initialPlate });
  const spaceListBox = el("div", { class: "stack", style: "max-height:280px; overflow-y:auto;" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const confirmBtn = el("button", { class: "btn btn--primary btn--block btn--lg", disabled: true }, confirmLabel);
  let selectedSpace = null;

  async function loadSpaces() {
    clear(spaceListBox);
    spaceListBox.appendChild(loadingState());
    try {
      const options = await fetchAvailableVisitorSpaces();
      clear(spaceListBox);
      if (options.length === 0) {
        spaceListBox.appendChild(emptyState("parking", "No hay parqueos de visitante libres en este momento."));
        return;
      }
      for (const space of options) {
        const label =
          space.vehicleKind === "moto"
            ? `Parqueo ${space.number} — Moto (${space.motoOccupied}/${space.motoCapacity} ocupadas)`
            : `Parqueo ${space.number}`;
        const row = el("div", { class: "card", style: "cursor:pointer; border-width:2px;" }, label);
        row.addEventListener("click", () => {
          selectedSpace = space;
          confirmBtn.disabled = false;
          for (const child of spaceListBox.children) child.style.borderColor = "var(--color-border)";
          row.style.borderColor = "var(--color-primary)";
        });
        spaceListBox.appendChild(row);
      }
    } catch (err) {
      clear(spaceListBox);
      spaceListBox.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  confirmBtn.addEventListener("click", async () => {
    if (!selectedSpace) return;
    if (!plateInput.value.trim()) {
      errorBox.textContent = "Ingrese la placa.";
      errorBox.style.display = "block";
      return;
    }
    errorBox.style.display = "none";
    confirmBtn.disabled = true;
    confirmBtn.textContent = "GUARDANDO...";
    try {
      await onConfirm({ space: selectedSpace, plate: plateInput.value.trim().toUpperCase(), closeFn });
    } catch (err) {
      errorBox.textContent = err instanceof OperationError ? err.message : friendlyError(err);
      errorBox.style.display = "block";
      confirmBtn.disabled = false;
      confirmBtn.textContent = confirmLabel;
    }
  });

  const content = el(
    "div",
    { class: "stack" },
    [
      el("div", { class: "modal__title" }, title),
      field("Placa *", plateInput),
      el("div", { class: "card__title" }, "Elegí un espacio libre"),
      spaceListBox,
      errorBox,
      confirmBtn,
      ...extraFooter,
    ].filter(Boolean)
  );

  const closeFn = openModal(content);
  loadSpaces();
  return closeFn;
}

function openAssignSpaceModal(visitorData, reload, onBack) {
  const backBtn = onBack
    ? el("button", { class: "btn btn--secondary btn--block", type: "button" }, [icon("back", { size: 18 }), " Volver al formulario"])
    : null;

  const closeModal = openSpacePickerModal({
    title: `Asignar parqueo — ${visitorData.visitorName}`,
    confirmLabel: "REGISTRAR ENTRADA",
    extraFooter: backBtn ? [backBtn] : [],
    onConfirm: async ({ space, plate, closeFn }) => {
      const isMoto = space.vehicleKind === "moto";
      const entryFn = isMoto ? registerMotoEntry : registerEntry;
      const result = await entryFn(space.number, {
        visitorName: visitorData.visitorName,
        visitorId: visitorData.visitorId,
        plate,
        visitorPhone: visitorData.visitorPhone,
        destinationType: visitorData.destinationType,
        destinationNumber: visitorData.destinationNumber,
        lobbyOverride: "B",
      });
      await createVisit({
        ...visitorData,
        needsParking: true,
        entryMode: "parking",
        parkingSpaceNumber: space.number,
        parkingSessionId: result.sessionId,
      });
      const spaceLabel = isMoto ? `${space.number} (moto)` : space.number;
      toast(`Visita registrada. Entrada en el parqueo ${spaceLabel}.`, "success");
      showConsultaQr(spaceLabel, result.consultaUrl, closeFn, { name: visitorData.visitorName, phone: visitorData.visitorPhone });
      reload();
    },
  });

  backBtn?.addEventListener("click", () => {
    closeModal();
    onBack();
  });
}

/**
 * Menú de corrección para una visita ya registrada — ver pedido explícito
 * de administración: se le indicó al visitante una modalidad (parqueo
 * compartido / espacio del propietario / a pie) pero terminó haciendo otra
 * por un malentendido con el guardia. Solo ofrece las 2 modalidades
 * distintas a la actual; cada una decide si hace falta liberar o crear un
 * parqueo compartido real antes de guardar la corrección.
 */
function openCorrectEntryModal(v, reload) {
  const currentMode = effectiveMode(v);
  const plateInput = el("input", { class: "form-control", style: "text-transform:uppercase;", value: v.plate || "" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const buttons = [];

  if (currentMode !== "parking") {
    const btn = el("button", { class: "btn btn--primary btn--block btn--lg" }, [icon("parking", { size: 18 }), " EN REALIDAD USÓ UN PARQUEO DE VISITA"]);
    btn.addEventListener("click", () => {
      closeFn();
      openCorrectPickSpaceModal(v, reload);
    });
    buttons.push(btn);
  }

  async function applySimpleCorrection(btn, targetMode) {
    let plate = null;
    if (targetMode === "ownerSpace") {
      plate = plateInput.value.trim().toUpperCase();
      if (!plate) {
        errorBox.textContent = "Ingrese la placa del vehículo.";
        errorBox.style.display = "block";
        return;
      }
    }
    errorBox.style.display = "none";
    btn.disabled = true;
    try {
      if (currentMode === "parking" && v.parkingSessionId) {
        await registerVisitExit(v.parkingSessionId, v.parkingSpaceNumber);
      }
      await updateVisitEntry(v.id, {
        entryMode: targetMode,
        needsParking: false,
        plate,
        parkingSpaceNumber: null,
        parkingSessionId: null,
      });
      toast("Ingreso corregido.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      btn.disabled = false;
    }
  }

  if (currentMode !== "ownerSpace") {
    const btn = el("button", { class: "btn btn--secondary btn--block btn--lg" }, [icon("card", { size: 18 }), " EN REALIDAD PARQUEÓ EN EL ESPACIO DEL PROPIETARIO"]);
    btn.addEventListener("click", () => applySimpleCorrection(btn, "ownerSpace"));
    buttons.push(btn);
  }
  if (currentMode !== "pedestrian") {
    const btn = el("button", { class: "btn btn--secondary btn--block btn--lg" }, [icon("users", { size: 18 }), " EN REALIDAD INGRESÓ A PIE"]);
    btn.addEventListener("click", () => applySimpleCorrection(btn, "pedestrian"));
    buttons.push(btn);
  }

  const content = el(
    "div",
    { class: "stack" },
    [
      el("div", { class: "modal__title" }, `Corregir ingreso — ${v.visitorName}`),
      el("div", { class: "text-secondary mb-md" }, `Actualmente: ${modeDescription(v)}`),
      field("Placa (solo si va a quedar en el espacio del propietario)", plateInput),
      errorBox,
      ...buttons,
    ].filter(Boolean)
  );
  const closeFn = openModal(content);
}

/** Corrección hacia "usó un parqueo de visita": si ya tenía uno asignado (poco probable, pero por si acaso) lo libera primero, luego crea la entrada real en el espacio elegido. */
function openCorrectPickSpaceModal(v, reload) {
  const hadParking = effectiveMode(v) === "parking" && v.parkingSessionId;
  openSpacePickerModal({
    title: `Corregir ingreso — ${v.visitorName}`,
    confirmLabel: "CONFIRMAR CORRECCIÓN",
    initialPlate: v.plate || "",
    onConfirm: async ({ space, plate, closeFn }) => {
      if (hadParking) {
        await registerVisitExit(v.parkingSessionId, v.parkingSpaceNumber);
      }
      const isMoto = space.vehicleKind === "moto";
      const entryFn = isMoto ? registerMotoEntry : registerEntry;
      const result = await entryFn(space.number, {
        visitorName: v.visitorName,
        visitorId: v.visitorId,
        plate,
        visitorPhone: v.visitorPhone,
        destinationType: v.destinationType,
        destinationNumber: v.destinationNumber,
        lobbyOverride: "B",
      });
      await updateVisitEntry(v.id, {
        entryMode: "parking",
        needsParking: true,
        plate: null,
        parkingSpaceNumber: space.number,
        parkingSessionId: result.sessionId,
      });
      const spaceLabel = isMoto ? `${space.number} (moto)` : space.number;
      toast(`Ingreso corregido. Entrada en el parqueo ${spaceLabel}.`, "success");
      showConsultaQr(spaceLabel, result.consultaUrl, closeFn, { name: v.visitorName, phone: v.visitorPhone });
      reload();
    },
  });
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
