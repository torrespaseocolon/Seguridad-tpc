import { el, clear, toast, loadingState, confirmDialog, openModal } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { db } from "../../firebase/firebase-init.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  updateSpaceType,
  forceReleaseSpace,
  extendParkingTime,
  addParkingSpace,
  OperationError,
} from "../../services/parking.service.js";
import { getSettings, updateSettings, getTimeRules, initializeSystem } from "../../services/settings.service.js";
import { friendlyError } from "../../utils/errors.js";

const TYPE_OPTIONS = [
  { value: "visitor", label: "Visitante" },
  { value: "disability", label: "Discapacidad" },
  { value: "moto", label: "Moto" },
  { value: "disabled", label: "Fuera de servicio" },
];

export async function renderParkingConfigTab(root) {
  clear(root);
  root.appendChild(loadingState());

  const settings = await getSettings(true).catch(() => null);

  if (!settings?.initialized) {
    clear(root);
    root.appendChild(
      el("div", { class: "card" }, [
        el("div", { class: "card__title" }, "El sistema aún no ha sido inicializado"),
        el("div", { class: "text-secondary mb-md" }, "Esto crea la configuración inicial y los 13 espacios de parqueo (12 y 13 como discapacidad). Solo debe hacerse una vez."),
        el("button", {
          class: "btn btn--primary btn--lg btn--block",
          onclick: async (e) => {
            e.target.disabled = true;
            const result = await initializeSystem();
            if (result.ok) {
              toast("Sistema inicializado.", "success");
              renderParkingConfigTab(root);
            } else {
              toast(result.message, "danger");
              e.target.disabled = false;
            }
          },
        }, "INICIALIZAR SISTEMA"),
      ])
    );
    return;
  }

  clear(root);

  const rules = getTimeRules();
  const apartmentHoursInput = el("input", { class: "form-control", type: "number", min: "1", step: "1", value: String(rules.maxMinutesApartment / 60) });
  const officeHoursInput = el("input", { class: "form-control", type: "number", min: "1", step: "1", value: String(rules.maxMinutesOffice / 60) });
  const maxSimultaneousInput = el("input", { class: "form-control", type: "number", min: "1", step: "1", value: String(rules.maxSimultaneousPerDestination) });
  const saveRulesBtn = el("button", { class: "btn btn--primary btn--block" }, "GUARDAR REGLAS DE TIEMPO");

  saveRulesBtn.addEventListener("click", async () => {
    const maxMinutesApartment = parseInt(apartmentHoursInput.value, 10) * 60;
    const maxMinutesOffice = parseInt(officeHoursInput.value, 10) * 60;
    const maxSimultaneousPerDestination = parseInt(maxSimultaneousInput.value, 10);
    if (!maxMinutesApartment || !maxMinutesOffice || !maxSimultaneousPerDestination) {
      toast("Ingrese valores válidos en las 3 reglas.", "danger");
      return;
    }
    saveRulesBtn.disabled = true;
    try {
      await updateSettings({ maxMinutesApartment, maxMinutesOffice, maxSimultaneousPerDestination });
      toast("Reglas de tiempo actualizadas.", "success");
    } catch (err) {
      toast(friendlyError(err), "danger");
    }
    saveRulesBtn.disabled = false;
  });

  root.appendChild(
    el("div", { class: "card mb-md" }, [
      el("div", { class: "card__title row" }, [icon("info"), "Reglas de tiempo"]),
      el("div", { class: "row", style: "flex-wrap:wrap; gap:12px;" }, [
        el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Horas máx. — Apartamentos"), apartmentHoursInput]),
        el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Horas máx. — Oficinas/comercios"), officeHoursInput]),
        el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Máx. simultáneos por apto./oficina"), maxSimultaneousInput]),
      ]),
      saveRulesBtn,
      el("div", { class: "form-hint mt-md" }, "El sistema aplica estas reglas automáticamente al registrar cada entrada. Cambiarlas aquí no afecta los parqueos que ya están ocupados."),
    ])
  );

  const addNumberInput = el("input", { class: "form-control", placeholder: "Ej. 01-2" });
  const addTypeSelect = el("select", { class: "form-control" }, TYPE_OPTIONS.map((opt) => el("option", { value: opt.value }, opt.label)));
  const addBtn = el("button", { class: "btn btn--primary" }, [icon("plus", { size: 16 }), " Agregar"]);
  addBtn.addEventListener("click", async () => {
    addBtn.disabled = true;
    try {
      await addParkingSpace(addNumberInput.value, addTypeSelect.value);
      toast(`Parqueo ${addNumberInput.value.trim()} agregado.`, "success");
      addNumberInput.value = "";
      renderParkingConfigTab(root);
    } catch (err) {
      toast(err instanceof OperationError ? err.message : friendlyError(err), "danger");
      addBtn.disabled = false;
    }
  });

  root.appendChild(
    el("div", { class: "card mb-md" }, [
      el("div", { class: "card__title" }, "Agregar espacio de parqueo"),
      el("div", { class: "row", style: "flex-wrap:wrap; gap:12px; align-items:flex-end;" }, [
        el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Número de parqueo"), addNumberInput]),
        el("div", { class: "form-group grow" }, [el("label", { class: "form-label" }, "Tipo"), addTypeSelect]),
        addBtn,
      ]),
      el("div", { class: "form-hint mt-md" }, "Por ejemplo, para las motos: cambie el tipo del parqueo 01 a \"Moto\" abajo y agregue 8 espacios más aquí (01-2, 01-3... 01-9) también de tipo \"Moto\", así quedan 9 espacios de moto cada uno con su propio tiempo."),
    ])
  );

  root.appendChild(el("div", { class: "card__title" }, "Espacios de parqueo"));
  const grid = el("div", { class: "stack" });
  root.appendChild(grid);

  const q = query(collection(db, "parking_spaces"), orderBy("number"));
  const snap = await getDocs(q);
  const spaces = snap.docs.map((d) => d.data());

  for (const space of spaces) {
    const typeSelect = el(
      "select",
      { class: "form-control" },
      TYPE_OPTIONS.map((opt) => el("option", { value: opt.value, selected: space.type === opt.value }, opt.label))
    );
    const saveBtn = el("button", { class: "btn btn--secondary" }, "Guardar");
    saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      try {
        await updateSpaceType(space.number, typeSelect.value);
        toast(`Parqueo ${space.number} actualizado.`, "success");
      } catch (err) {
        toast(friendlyError(err), "danger");
      }
      saveBtn.disabled = false;
    });

    const row = [
      el("strong", { style: "min-width:90px; display:inline-block;" }, `Parqueo ${space.number}`),
      el("span", { class: `badge ${space.status === "free" ? "badge--free" : "badge--occupied"}` }, [
        el("span", { class: "status-dot" }),
        space.status === "free" ? "LIBRE" : "OCUPADO",
      ]),
      typeSelect,
      saveBtn,
    ];

    if (space.status === "occupied") {
      if (space.maxMinutesAtEntry) {
        row.push(el("span", { class: "text-faint" }, `Límite: ${Math.round(space.maxMinutesAtEntry / 60)} h`));
      }

      const extendBtn = el("button", { class: "btn btn--secondary" }, [icon("refresh", { size: 16 }), " Extender tiempo"]);
      extendBtn.addEventListener("click", () => openExtendModal(space, () => renderParkingConfigTab(root)));
      row.push(extendBtn);

      const releaseBtn = el("button", { class: "btn btn--danger" }, "Liberar (corrección)");
      releaseBtn.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Liberar espacio manualmente",
          body: `Esto cerrará por la fuerza el registro activo del parqueo ${space.number} y lo marcará libre. Use esta opción solo para corregir un error operativo.`,
          danger: true,
        });
        if (!ok) return;
        try {
          await forceReleaseSpace(space.number, "Corrección manual desde configuración de parqueos.");
          toast(`Parqueo ${space.number} liberado.`, "success");
          renderParkingConfigTab(root);
        } catch (err) {
          toast(friendlyError(err), "danger");
        }
      });
      row.push(releaseBtn);
    }

    grid.appendChild(el("div", { class: "card row", style: "flex-wrap:wrap;" }, row));
  }
}

function openExtendModal(space, onDone) {
  const minutesInput = el("input", { class: "form-control", type: "number", min: "1", value: "30" });
  const noteInput = el("textarea", { class: "form-control", rows: "2", placeholder: "Opcional — por ejemplo: \"Solicitado por WhatsApp al conserje\"" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg" }, "EXTENDER TIEMPO");

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Extender tiempo — Parqueo ${space.number}`),
    space.maxMinutesAtEntry
      ? el("div", { class: "text-secondary" }, `Límite actual: ${Math.round(space.maxMinutesAtEntry / 60)} horas desde la entrada.`)
      : null,
    el("div", { class: "form-group" }, [el("label", { class: "form-label" }, "Minutos adicionales"), minutesInput]),
    el("div", { class: "form-group" }, [el("label", { class: "form-label" }, "Motivo (opcional)"), noteInput]),
    errorBox,
    submitBtn,
  ].filter(Boolean));

  const closeFn = openModal(content);
  minutesInput.focus();

  submitBtn.addEventListener("click", async () => {
    const additional = parseInt(minutesInput.value, 10);
    if (!additional || additional < 1) {
      errorBox.textContent = "Ingrese una cantidad de minutos válida.";
      errorBox.style.display = "block";
      return;
    }
    errorBox.style.display = "none";
    submitBtn.disabled = true;
    submitBtn.textContent = "GUARDANDO...";
    try {
      const result = await extendParkingTime(space.number, additional, noteInput.value.trim());
      toast(`Tiempo extendido. Nuevo límite: ${Math.round(result.newMax / 60)} h.`, "success");
      closeFn();
      onDone();
    } catch (err) {
      errorBox.textContent = err instanceof OperationError ? err.message : friendlyError(err);
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "EXTENDER TIEMPO";
    }
  });
}
