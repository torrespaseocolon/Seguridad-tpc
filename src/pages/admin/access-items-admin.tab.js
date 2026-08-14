import { el, clear, toast, openModal, loadingState } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { createAccessItem, fetchAccessItemHistory, TYPE_LABELS } from "../../services/access-items.service.js";
import { formatDateTime } from "../../utils/time.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderAccessItemsAdminTab(root) {
  clear(root);
  root.appendChild(el("button", { class: "btn btn--primary btn--block mb-md", onclick: () => openCreateModal(load) }, [icon("plus", { size: 18 }), " REGISTRAR TARJETA / STICKER"]));
  const list = el("div", { class: "stack" });
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      const items = await fetchAccessItemHistory(100);
      clear(list);
      for (const item of items) list.appendChild(renderCard(item));
    } catch (err) {
      clear(list);
      list.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
  }

  await load();
}

function renderCard(item) {
  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, `${TYPE_LABELS[item.type] || item.type} — ${item.recipientName}`),
      el("span", { class: `badge ${item.status === "pending" ? "badge--pending" : "badge--delivered"}` }, item.status === "pending" ? "PENDIENTE" : "ENTREGADO"),
    ]),
    el("div", { class: "text-secondary" }, `Apt. ${item.apartment}${item.tower ? " · Torre " + item.tower : ""} · Lobby ${item.dropLobby}`),
    el("div", { class: "text-faint" }, `Registrado: ${formatDateTime(item.createdAt)} por ${item.createdByName || ""}`),
    item.status === "delivered" ? el("div", { class: "text-faint" }, `Entregado: ${formatDateTime(item.deliveredAt)} por ${item.deliveredByName || ""}`) : null,
  ].filter(Boolean));
}

function openCreateModal(reload) {
  const typeSelect = el("select", { class: "form-control" }, [
    el("option", { value: "card" }, "Tarjeta de acceso"),
    el("option", { value: "sticker" }, "Sticker vehicular"),
    el("option", { value: "other" }, "Otro"),
  ]);
  const nameInput = el("input", { class: "form-control", required: true });
  const apartmentInput = el("input", { class: "form-control", required: true });
  const towerInput = el("input", { class: "form-control" });
  const lobbySelect = el("select", { class: "form-control" }, [
    el("option", { value: "A" }, "Lobby A"),
    el("option", { value: "B" }, "Lobby B"),
  ]);
  const notesInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!nameInput.value.trim() || !apartmentInput.value.trim()) {
          errorBox.textContent = "Complete los campos obligatorios.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await createAccessItem({
            type: typeSelect.value,
            recipientName: nameInput.value.trim(),
            apartment: apartmentInput.value.trim(),
            tower: towerInput.value.trim(),
            dropLobby: lobbySelect.value,
            notes: notesInput.value.trim(),
          });
          toast("Registrado como pendiente de entrega.", "success");
          closeFn();
          reload();
        } catch (err) {
          errorBox.textContent = friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTRAR";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, "Nueva tarjeta / sticker"),
      field("Tipo", typeSelect),
      field("Nombre de quien debe retirarlo *", nameInput),
      field("Apartamento *", apartmentInput),
      field("Torre", towerInput),
      field("Lobby donde se deja", lobbySelect),
      field("Observaciones", notesInput),
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
