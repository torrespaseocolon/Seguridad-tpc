import { el, clear, toast, confirmDialog, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { fetchPendingAccessItems, deliverAccessItem, TYPE_LABELS } from "../services/access-items.service.js";
import { formatDateTime, elapsedDays } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

// Ver misma nota en packages.page.js: 7 días es el umbral recomendado antes
// de resaltar visualmente una tarjeta/sticker pendiente hace mucho.
const OLD_PENDING_DAYS = 7;

export function renderAccessItems(root) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("card"), "Tarjetas / Stickers"]),
    ])
  );
  const searchInput = el("input", { class: "form-control", placeholder: "Buscar por nombre o apartamento..." });
  const list = el("div", { class: "stack" });
  root.appendChild(el("button", { class: "btn btn--secondary mb-md", onclick: load }, [icon("refresh", { size: 18 }), " Actualizar"]));
  root.appendChild(el("div", { class: "form-group" }, [searchInput]));
  root.appendChild(list);

  let allItems = [];
  searchInput.addEventListener("input", renderList);

  function renderList() {
    clear(list);
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? allItems.filter((it) => (it.recipientName || "").toLowerCase().includes(term) || (it.apartment || "").toLowerCase().includes(term))
      : allItems;
    if (filtered.length === 0) {
      list.appendChild(emptyState("card", term ? "Ninguna tarjeta/sticker pendiente coincide con la búsqueda." : "No hay tarjetas ni stickers pendientes de entrega."));
      return;
    }
    for (const item of filtered) list.appendChild(renderCard(item, load));
  }

  async function load() {
    clear(list);
    list.appendChild(loadingState("Cargando pendientes..."));
    try {
      allItems = await fetchPendingAccessItems();
      renderList();
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  load();
}

function renderCard(item, reload) {
  const days = elapsedDays(item.createdAt);
  const isOld = days >= OLD_PENDING_DAYS;
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

  return el("div", { class: "card", style: isOld ? "border-color:var(--color-danger);" : "" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, TYPE_LABELS[item.type] || item.type),
      el("span", { class: "badge badge--pending" }, "PENDIENTE"),
    ]),
    el("div", { class: "text-secondary mt-md" }, `Para: ${item.recipientName}`),
    el("div", { class: "text-secondary" }, `Apt. ${item.apartment}${item.tower ? " · Torre " + item.tower : ""} · Se deja en Lobby ${item.dropLobby}`),
    item.notes ? el("div", { class: "text-faint" }, item.notes) : null,
    el("div", { class: "text-faint" }, `Registrado: ${formatDateTime(item.createdAt)} por ${item.createdByName || ""}`),
    isOld ? el("div", { class: "badge badge--occupied mt-md" }, `⚠ Pendiente hace ${days} días`) : null,
    el("div", { class: "mt-md" }, [deliverBtn]),
  ].filter(Boolean));
}
