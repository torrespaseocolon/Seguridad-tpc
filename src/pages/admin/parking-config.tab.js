import { el, clear, toast, loadingState, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { db } from "../../firebase/firebase-init.js";
import { collection, getDocs, orderBy, query } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {
  updateSpaceType,
  forceReleaseSpace,
  MAX_MINUTES_OFFICE,
  MAX_MINUTES_APARTMENT,
  MAX_SIMULTANEOUS_PER_DESTINATION,
} from "../../services/parking.service.js";
import { getSettings, initializeSystem } from "../../services/settings.service.js";
import { friendlyError } from "../../utils/errors.js";

const TYPE_OPTIONS = [
  { value: "visitor", label: "Visitante" },
  { value: "disability", label: "Discapacidad" },
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

  root.appendChild(
    el("div", { class: "card mb-md" }, [
      el("div", { class: "card__title row" }, [icon("info"), "Reglas de tiempo (automáticas)"]),
      el("div", { class: "stack", style: "gap:6px;" }, [
        el("div", { class: "row row--between" }, [
          el("span", { class: "text-secondary" }, "Apartamentos"),
          el("strong", {}, `${MAX_MINUTES_APARTMENT / 60} horas`),
        ]),
        el("div", { class: "row row--between" }, [
          el("span", { class: "text-secondary" }, "Oficinas / comercios"),
          el("strong", {}, `${MAX_MINUTES_OFFICE / 60} horas`),
        ]),
        el("div", { class: "row row--between" }, [
          el("span", { class: "text-secondary" }, "Máx. parqueos simultáneos por apartamento/oficina"),
          el("strong", {}, String(MAX_SIMULTANEOUS_PER_DESTINATION)),
        ]),
      ]),
      el("div", { class: "form-hint mt-md" }, "Estas reglas las aplica el sistema automáticamente al registrar cada entrada, según el tipo de destino. No se configuran manualmente."),
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
