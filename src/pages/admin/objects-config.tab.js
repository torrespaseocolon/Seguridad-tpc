import { el, clear, toast, openModal, loadingState } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { fetchAllObjects, createObject, updateObject, setObjectActive } from "../../services/objects.service.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderObjectsConfigTab(root) {
  clear(root);
  root.appendChild(el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openCreateModal(load) }, [icon("plus", { size: 18 }), " CREAR OBJETO"]));
  const list = el("div", { class: "stack" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const objects = await fetchAllObjects();
      clear(list);
      for (const obj of objects) list.appendChild(renderObjectCard(obj, load));
    } catch (err) {
      clear(list);
      list.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  await load();
}

function renderObjectCard(obj, reload) {
  const qtyInput = el("input", { class: "form-control", type: "number", min: "0", value: obj.totalQuantity, style: "max-width:100px;" });
  const saveBtn = el("button", { class: "btn btn--secondary" }, "Guardar cantidad");
  saveBtn.addEventListener("click", async () => {
    const newTotal = parseInt(qtyInput.value, 10);
    if (isNaN(newTotal) || newTotal < 0) {
      toast("Ingrese una cantidad válida.", "danger");
      return;
    }
    const delta = newTotal - obj.totalQuantity;
    const newAvailable = Math.max(0, obj.availableQuantity + delta);
    saveBtn.disabled = true;
    try {
      await updateObject(obj.id, { totalQuantity: newTotal, availableQuantity: newAvailable });
      toast("Cantidad actualizada.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      saveBtn.disabled = false;
    }
  });

  const toggleBtn = el("button", { class: `btn ${obj.active ? "btn--danger" : "btn--success"}` }, obj.active ? "Desactivar" : "Activar");
  toggleBtn.addEventListener("click", async () => {
    try {
      await setObjectActive(obj.id, !obj.active);
      toast("Estado actualizado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
    }
  });

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, obj.name),
      el("span", { class: `badge ${obj.active ? "badge--free" : "badge--disabled"}` }, obj.active ? "ACTIVO" : "INACTIVO"),
    ]),
    obj.category ? el("div", { class: "text-secondary" }, obj.category) : null,
    obj.identifier ? el("div", { class: "text-faint" }, `Identificador: ${obj.identifier}`) : null,
    el("div", { class: "text-secondary" }, `Disponibles: ${obj.availableQuantity} / ${obj.totalQuantity}`),
    el("div", { class: "row mt-md" }, [qtyInput, saveBtn, toggleBtn]),
  ].filter(Boolean));
}

function openCreateModal(reload) {
  const nameInput = el("input", { class: "form-control", required: true });
  const categoryInput = el("input", { class: "form-control" });
  const identifierInput = el("input", { class: "form-control" });
  const qtyInput = el("input", { class: "form-control", type: "number", min: "1", value: "1" });
  const descInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "CREAR OBJETO");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) {
          errorBox.textContent = "Ingrese un nombre.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await createObject({
            name: nameInput.value.trim(),
            category: categoryInput.value.trim(),
            identifier: identifierInput.value.trim(),
            quantity: parseInt(qtyInput.value, 10) || 1,
            description: descInput.value.trim(),
          });
          toast("Objeto creado.", "success");
          closeFn();
          reload();
        } catch (err) {
          errorBox.textContent = friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "CREAR OBJETO";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, "Crear objeto"),
      field("Nombre *", nameInput),
      field("Categoría", categoryInput),
      field("Identificador (opcional)", identifierInput),
      field("Cantidad", qtyInput),
      field("Descripción", descInput),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
