import { el, clear, toast, openModal, loadingState, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { createDestinationField } from "../../utils/destination-field.js";
import { fetchOfficeDirectory, upsertOffice, deleteOffice } from "../../services/offices.service.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderOfficesTab(root) {
  clear(root);
  root.appendChild(
    el(
      "div",
      { class: "form-hint mb-md" },
      "Directorio de teléfonos de oficinas/comercios — al escribir el código de una de estas oficinas en cualquier formulario (Parqueos, Visitantes, Paquetes, Tarjetas), el guardia va a ver acá mismo el nombre y teléfono guardados, para poder llamar a consultar. No aplica a apartamentos."
    )
  );
  root.appendChild(
    el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openOfficeModal(null, load) }, [icon("plus", { size: 18 }), " AGREGAR OFICINA"])
  );
  const list = el("div", { class: "stack" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const offices = await fetchOfficeDirectory();
      clear(list);
      if (offices.length === 0) {
        list.appendChild(el("div", { class: "empty-state" }, "Todavía no hay oficinas cargadas en el directorio."));
        return;
      }
      for (const office of offices) list.appendChild(renderOfficeCard(office, load));
    } catch (err) {
      clear(list);
      list.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  await load();
}

function renderOfficeCard(office, reload) {
  const editBtn = el("button", { class: "btn btn--secondary" }, [icon("tools", { size: 16 }), " Editar"]);
  editBtn.addEventListener("click", () => openOfficeModal(office, reload));

  const deleteBtn = el("button", { class: "btn btn--danger" }, [icon("close", { size: 16 }), " Eliminar"]);
  deleteBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Eliminar del directorio",
      body: `¿Confirma quitar "${office.id}" del directorio? Ya no se mostrará su teléfono al escribir ese código.`,
      confirmText: "Sí, eliminar",
      danger: true,
    });
    if (!ok) return;
    deleteBtn.disabled = true;
    try {
      await deleteOffice(office.id);
      toast("Oficina eliminada del directorio.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      deleteBtn.disabled = false;
    }
  });

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, office.id),
      el("div", { class: "row", style: "gap:6px;" }, [editBtn, deleteBtn]),
    ]),
    el("div", { class: "text-secondary" }, office.name || "Sin nombre registrado"),
    el("div", { class: "text-secondary" }, office.phone ? `Tel. ${office.phone}` : "Sin teléfono registrado"),
  ]);
}

function openOfficeModal(office, reload) {
  const isEdit = !!office;
  const destField = createDestinationField({ required: true, initialValue: office?.id || "" });
  const nameInput = el("input", { class: "form-control", value: office?.name || "" });
  const phoneInput = el("input", { class: "form-control", type: "tel", value: office?.phone || "", placeholder: "Ej. 2222-3333" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el(
    "button",
    { class: "btn btn--primary btn--block btn--lg", type: "submit" },
    isEdit ? "GUARDAR CAMBIOS" : "AGREGAR OFICINA"
  );

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        const destResult = destField.getResult();
        if (!destResult.ok) {
          errorBox.textContent = destResult.error;
          errorBox.style.display = "block";
          return;
        }
        if (!nameInput.value.trim() && !phoneInput.value.trim()) {
          errorBox.textContent = "Ingrese al menos el nombre o el teléfono.";
          errorBox.style.display = "block";
          return;
        }
        errorBox.style.display = "none";
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await upsertOffice(destResult.code, { name: nameInput.value.trim(), phone: phoneInput.value.trim() });
          toast(isEdit ? "Oficina actualizada." : "Oficina agregada al directorio.", "success");
          closeFn();
          reload();
        } catch (err) {
          errorBox.textContent = friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = isEdit ? "GUARDAR CAMBIOS" : "AGREGAR OFICINA";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, isEdit ? `Editar oficina — ${office.id}` : "Agregar oficina al directorio"),
      // El código no se puede editar después de creado (es el ID del
      // documento) — para cambiarlo hay que eliminar y agregar de nuevo.
      isEdit ? null : field("Torre + piso + unidad *", destField.input),
      isEdit ? null : destField.hint,
      field("Nombre del negocio/oficina", nameInput),
      field("Teléfono", phoneInput),
      errorBox,
      submitBtn,
    ].filter(Boolean)
  );

  const closeFn = openModal(form);
  (isEdit ? nameInput : destField.input).focus();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
