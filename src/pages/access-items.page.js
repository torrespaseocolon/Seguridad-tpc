import { el, clear, toast, confirmDialog, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { fetchPendingAccessItems, deliverAccessItem, TYPE_LABELS } from "../services/access-items.service.js";
import { formatDateTime } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

export function renderAccessItems(root) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("card"), "Tarjetas / Stickers"]),
    ])
  );
  const list = el("div", { class: "stack" });
  root.appendChild(el("button", { class: "btn btn--secondary mb-md", onclick: load }, [icon("refresh", { size: 18 }), " Actualizar"]));
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState("Cargando pendientes..."));
    try {
      const items = await fetchPendingAccessItems();
      clear(list);
      if (items.length === 0) {
        list.appendChild(emptyState("card", "No hay tarjetas ni stickers pendientes de entrega."));
        return;
      }
      for (const item of items) list.appendChild(renderCard(item, load));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  load();
}

function renderCard(item, reload) {
  const deliverBtn = el("button", { class: "btn btn--success btn--block" }, "ENTREGADO");
  deliverBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Confirmar entrega",
      body: `¿Confirma la entrega de ${TYPE_LABELS[item.type] || item.type} a ${item.recipientName} (Apt. ${item.apartment})?`,
      confirmText: "Sí, entregar",
    });
    if (!ok) return;
    deliverBtn.disabled = true;
    deliverBtn.textContent = "GUARDANDO...";
    try {
      await deliverAccessItem(item.id);
      toast("Entrega registrada.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      deliverBtn.disabled = false;
      deliverBtn.textContent = "ENTREGADO";
    }
  });

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, TYPE_LABELS[item.type] || item.type),
      el("span", { class: "badge badge--pending" }, "PENDIENTE"),
    ]),
    el("div", { class: "text-secondary mt-md" }, `Para: ${item.recipientName}`),
    el("div", { class: "text-secondary" }, `Apt. ${item.apartment}${item.tower ? " · Torre " + item.tower : ""} · Se deja en Lobby ${item.dropLobby}`),
    item.notes ? el("div", { class: "text-faint" }, item.notes) : null,
    el("div", { class: "text-faint" }, `Registrado: ${formatDateTime(item.createdAt)} por ${item.createdByName || ""}`),
    el("div", { class: "mt-md" }, [deliverBtn]),
  ].filter(Boolean));
}
