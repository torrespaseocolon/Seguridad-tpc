import { el, clear, toast, openModal, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { db } from "../firebase/firebase-init.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { createDestinationField } from "../utils/destination-field.js";
import { destinationLabel } from "../utils/destination.js";
import { registerEntry, registerMotoEntry, MOTO_SPACE_CAPACITY, OperationError } from "../services/parking.service.js";
import { createVisit, fetchRecentVisits } from "../services/visits.service.js";
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
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("users"), "Visitantes"]),
    ])
  );
  root.appendChild(
    el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openNewVisitModal(load) }, [icon("plus", { size: 18 }), " NUEVO VISITANTE"])
  );
  const list = el("div", { class: "stack" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const visits = await fetchRecentVisits(50);
      clear(list);
      if (visits.length === 0) {
        list.appendChild(emptyState("users", "Aún no hay visitas registradas."));
        return;
      }
      for (const v of visits) list.appendChild(renderVisitCard(v));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  load();
}

function renderVisitCard(v) {
  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, v.visitorName),
      v.needsParking
        ? el("span", { class: "badge badge--info" }, `Parqueo ${v.parkingSpaceNumber || "?"}`)
        : el("span", { class: "badge badge--free" }, "No necesita parqueo"),
    ]),
    el("div", { class: "text-secondary" }, `${destinationLabel(v.destinationType, v.destinationNumber)} · Cédula ${v.visitorId} · Tel. ${v.visitorPhone || "-"}`),
    el("div", { class: "row row--between", style: "padding-top:4px;" }, [
      el("span", { class: "text-secondary" }, "Entrada"),
      el("strong", {}, formatDateTime(v.createdAt)),
    ]),
    el("div", { class: "text-faint" }, v.createdByName || ""),
    v.notes ? el("div", { class: "text-faint" }, v.notes) : null,
  ].filter(Boolean));
}

function openNewVisitModal(reload) {
  const profile = getProfile();
  const canOperate = canOperateParking(profile);

  const nameInput = el("input", { class: "form-control", required: true });
  const idInput = el("input", { class: "form-control", required: true });
  const phoneInput = el("input", { class: "form-control", type: "tel", required: true, placeholder: "Ej. 8888 8888" });
  const defaultTower = profile.lobby === "A" || profile.lobby === "B" ? profile.lobby : "A";
  const destField = createDestinationField({ defaultTower, required: true });
  const notesInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });

  function collectVisitorData() {
    if (!nameInput.value.trim() || !idInput.value.trim() || !phoneInput.value.trim()) {
      errorBox.textContent = "Complete nombre, cédula y teléfono.";
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

  const noParkingBtn = el("button", { class: "btn btn--secondary btn--block btn--lg" }, [icon("card", { size: 18 }), " NO NECESITA PARQUEO"]);
  noParkingBtn.addEventListener("click", async () => {
    const data = collectVisitorData();
    if (!data) return;
    noParkingBtn.disabled = true;
    try {
      await createVisit({ ...data, needsParking: false });
      toast("Visita registrada.", "success");
      closeFn();
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      noParkingBtn.disabled = false;
    }
  });

  let parkingBtn = null;
  if (canOperate) {
    parkingBtn = el("button", { class: "btn btn--primary btn--block btn--lg" }, [icon("parking", { size: 18 }), " ASIGNAR ESPACIO DE PARQUEO"]);
    parkingBtn.addEventListener("click", () => {
      const data = collectVisitorData();
      if (!data) return;
      closeFn();
      openAssignSpaceModal(data, reload);
    });
  }

  const content = el(
    "div",
    { class: "stack" },
    [
      el("div", { class: "modal__title" }, "Nuevo visitante"),
      field("Nombre *", nameInput),
      field("Cédula *", idInput),
      field("Teléfono *", phoneInput),
      field("Torre + piso + unidad — a quién visita *", destField.input),
      destField.hint,
      field("Observaciones", notesInput),
      errorBox,
      parkingBtn,
      noParkingBtn,
      !canOperate ? el("div", { class: "form-hint text-center" }, "Solo el guardia de Lobby B (o un administrador) puede asignar un espacio de parqueo desde acá.") : null,
    ].filter(Boolean)
  );

  const closeFn = openModal(content);
  nameInput.focus();
}

function openAssignSpaceModal(visitorData, reload) {
  const plateInput = el("input", { class: "form-control", required: true, style: "text-transform:uppercase;" });
  const spaceListBox = el("div", { class: "stack", style: "max-height:280px; overflow-y:auto;" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const confirmBtn = el("button", { class: "btn btn--primary btn--block btn--lg", disabled: true }, "REGISTRAR ENTRADA");
  let selectedSpace = null;

  async function loadSpaces() {
    clear(spaceListBox);
    spaceListBox.appendChild(loadingState());
    try {
      // Trae todos los espacios y filtra en JS (no where+orderBy en campos
      // distintos) para no depender de un índice compuesto — mismo patrón
      // que demo.tab.js.
      const snap = await getDocs(collection(db, "parking_spaces"));
      const allSpaces = snap.docs.map((d) => d.data());
      const options = allSpaces
        .filter((s) => s.type === "visitor" && s.status === "free")
        .map((s) => ({ ...s, vehicleKind: "car" }));

      // El espacio de motos nunca marca su propio documento como
      // "ocupado" (ver nota de motos en parking.service.js) — la
      // disponibilidad real se calcula contando cuántas sesiones de moto
      // siguen abiertas para ese espacio, igual que en Parqueos.
      for (const space of allSpaces.filter((s) => s.type === "moto")) {
        const capacity = space.capacity || MOTO_SPACE_CAPACITY;
        const openSnap = await getDocs(
          query(collection(db, "parking_sessions"), where("status", "==", "open"), where("spaceNumber", "==", space.number))
        );
        const occupied = openSnap.size;
        if (occupied < capacity) {
          options.push({ ...space, vehicleKind: "moto", motoOccupied: occupied, motoCapacity: capacity });
        }
      }
      options.sort((a, b) => String(a.number).localeCompare(String(b.number)));

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
      const isMoto = selectedSpace.vehicleKind === "moto";
      const entryFn = isMoto ? registerMotoEntry : registerEntry;
      const result = await entryFn(selectedSpace.number, {
        visitorName: visitorData.visitorName,
        visitorId: visitorData.visitorId,
        plate: plateInput.value.trim().toUpperCase(),
        visitorPhone: visitorData.visitorPhone,
        destinationType: visitorData.destinationType,
        destinationNumber: visitorData.destinationNumber,
        lobbyOverride: "B",
      });
      await createVisit({
        ...visitorData,
        needsParking: true,
        parkingSpaceNumber: selectedSpace.number,
        parkingSessionId: result.sessionId,
      });
      const spaceLabel = isMoto ? `${selectedSpace.number} (moto)` : selectedSpace.number;
      toast(`Visita registrada. Entrada en el parqueo ${spaceLabel}.`, "success");
      showConsultaQr(spaceLabel, result.consultaUrl, closeFn, { name: visitorData.visitorName, phone: visitorData.visitorPhone });
      reload();
    } catch (err) {
      errorBox.textContent = err instanceof OperationError ? err.message : friendlyError(err);
      errorBox.style.display = "block";
      confirmBtn.disabled = false;
      confirmBtn.textContent = "REGISTRAR ENTRADA";
    }
  });

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Asignar parqueo — ${visitorData.visitorName}`),
    field("Placa *", plateInput),
    el("div", { class: "card__title" }, "Elegí un espacio libre"),
    spaceListBox,
    errorBox,
    confirmBtn,
  ]);

  const closeFn = openModal(content);
  loadSpaces();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
