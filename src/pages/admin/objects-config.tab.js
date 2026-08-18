import { el, clear, toast, openModal, loadingState, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { fetchAllObjects, createObject, updateObject, setObjectActive, deleteObject } from "../../services/objects.service.js";
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
  const lobbySelect = el("select", { class: "form-control", style: "max-width:140px;" }, [
    el("option", { value: "A", selected: obj.lobby === "A" }, "Lobby A"),
    el("option", { value: "B", selected: obj.lobby === "B" }, "Lobby B"),
  ]);
  const saveBtn = el("button", { class: "btn btn--secondary" }, "Guardar cambios");
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
      await updateObject(obj.id, { totalQuantity: newTotal, availableQuantity: newAvailable, lobby: lobbySelect.value });
      toast("Objeto actualizado.", "success");
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

  const deleteBtn = el("button", { class: "btn btn--danger" }, [icon("close", { size: 16 }), " Eliminar"]);
  deleteBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Eliminar objeto",
      body: `¿Confirma eliminar "${obj.name}" de la lista? Si tiene préstamos activos, esos registros de historial se conservan, pero el objeto desaparece del catálogo. Esta acción no se puede deshacer desde la app.`,
      confirmText: "Sí, eliminar",
      danger: true,
    });
    if (!ok) return;
    deleteBtn.disabled = true;
    try {
      await deleteObject(obj.id, obj.name);
      toast("Objeto eliminado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      deleteBtn.disabled = false;
    }
  });

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, obj.name),
      el("div", { class: "row", style: "gap:6px;" }, [
        el("span", { class: "badge badge--info" }, `Lobby ${obj.lobby || "?"}`),
        el("span", { class: `badge ${obj.active ? "badge--free" : "badge--disabled"}` }, obj.active ? "ACTIVO" : "INACTIVO"),
      ]),
    ]),
    obj.category ? el("div", { class: "text-secondary" }, obj.category) : null,
    obj.identifier ? el("div", { class: "text-faint" }, `Identificador: ${obj.identifier}`) : null,
    el("div", { class: "text-secondary" }, `Disponibles: ${obj.availableQuantity} / ${obj.totalQuantity}`),
    el("div", { class: "row mt-md", style: "flex-wrap:wrap; gap:8px;" }, [qtyInput, lobbySelect, saveBtn, toggleBtn, deleteBtn]),
  ].filter(Boolean));
}

function openCreateModal(reload) {
  const nameInput = el("input", { class: "form-control", required: true });
  const categoryInput = el("input", { class: "form-control" });
  const identifierInput = el("input", { class: "form-control" });
  const qtyInput = el("input", { class: "form-control", type: "number", min: "1", value: "1" });
  const descInput = el("textarea", { class: "form-control", rows: "2" });
  const lobbySelect = el("select", { class: "form-control" }, [
    el("option", { value: "A" }, "Lobby A"),
    el("option", { value: "B" }, "Lobby B"),
  ]);
  const lobbyHint = el("div", { class: "form-hint" }, "Cada objeto pertenece a un solo lobby: solo el guardia de ese lobby podrá prestarlo (un administrador puede prestar cualquiera).");
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
            lobby: lobbySelect.value,
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
      field("Lobby *", lobbySelect),
      lobbyHint,
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
