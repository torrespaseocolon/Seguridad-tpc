import { el, clear, toast, confirmDialog, openModal, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { createDestinationField } from "../utils/destination-field.js";
import { createPackage, fetchPendingPackages, deliverPackage } from "../services/packages.service.js";
import { formatDateTime, elapsedDays } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

// Recomendación por defecto (7 días): tiempo razonable para que un paquete
// siga sin recogerse antes de que valga la pena avisarle al residente. Es
// solo un aviso visual para el guardia/administración — no bloquea nada.
const OLD_PENDING_DAYS = 7;

export function renderPackages(root) {
  clear(root);
  const list = el("div", { class: "stack" });
  const searchInput = el("input", { class: "form-control", placeholder: "Buscar por nombre o apartamento..." });

  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("package"), "Paquetes"]),
    ])
  );
  root.appendChild(
    el("div", { class: "row", style: "margin-bottom:16px;" }, [
      el("button", { class: "btn btn--primary grow", onclick: () => openNewPackageModal(load) }, [icon("plus", { size: 18 }), " NUEVO PAQUETE"]),
      el("button", { class: "btn btn--secondary", onclick: load }, [icon("refresh", { size: 18 }), " Actualizar"]),
    ])
  );
  root.appendChild(el("div", { class: "form-group" }, [searchInput]));
  root.appendChild(list);

  let allPackages = [];
  searchInput.addEventListener("input", renderList);

  function renderList() {
    clear(list);
    const term = searchInput.value.trim().toLowerCase();
    const filtered = term
      ? allPackages.filter((p) => (p.recipientName || "").toLowerCase().includes(term) || (p.apartment || "").toLowerCase().includes(term))
      : allPackages;
    if (filtered.length === 0) {
      list.appendChild(emptyState("package", term ? "Ningún paquete pendiente coincide con la búsqueda." : "No hay paquetes pendientes de entrega."));
      return;
    }
    for (const pkg of filtered) list.appendChild(renderPackageCard(pkg, load));
  }

  async function load() {
    clear(list);
    list.appendChild(loadingState("Cargando paquetes pendientes..."));
    try {
      allPackages = await fetchPendingPackages();
      renderList();
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  load();
}

function renderPackageCard(pkg, reload) {
  const days = elapsedDays(pkg.createdAt);
  const isOld = days >= OLD_PENDING_DAYS;
  const deliverBtn = el("button", { class: "btn btn--success btn--block" }, "ENTREGADO");
  deliverBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Confirmar entrega",
      body: `¿Confirma la entrega del paquete de ${pkg.courier} para ${pkg.recipientName} (Apt. ${pkg.apartment})?`,
      confirmText: "Sí, entregar",
    });
    if (!ok) return;
    deliverBtn.disabled = true;
    deliverBtn.textContent = "GUARDANDO...";
    try {
      await deliverPackage(pkg.id);
      toast("Paquete marcado como entregado.", "success");
      reload();
    } catch (err) {
      toast(friendlyError(err), "danger");
      deliverBtn.disabled = false;
      deliverBtn.textContent = "ENTREGADO";
    }
  });

  return el("div", { class: "card", style: isOld ? "border-color:var(--color-danger);" : "" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, `Apt. ${pkg.apartment} — ${pkg.recipientName}`),
      el("span", { class: "badge badge--pending" }, "PENDIENTE"),
    ]),
    el("div", { class: "text-secondary mt-md" }, `Empresa: ${pkg.courier}${pkg.trackingNumber ? " · Guía: " + pkg.trackingNumber : ""}`),
    pkg.notes ? el("div", { class: "text-secondary" }, `Nota: ${pkg.notes}`) : null,
    el("div", { class: "text-faint" }, `Recibido: ${formatDateTime(pkg.createdAt)} · ${pkg.createdByName || ""}`),
    isOld ? el("div", { class: "badge badge--occupied mt-md" }, `⚠ Pendiente hace ${days} días`) : null,
    el("div", { class: "mt-md" }, [deliverBtn]),
  ].filter(Boolean));
}

function openNewPackageModal(reload) {
  const destField = createDestinationField({ required: true });
  const nameInput = el("input", { class: "form-control", required: true });
  const courierInput = el("input", { class: "form-control", required: true, placeholder: "Ej. Correos de Costa Rica, Amazon, Uber..." });
  const trackingInput = el("input", { class: "form-control" });
  const notesInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR PAQUETE");

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
        if (!nameInput.value.trim() || !courierInput.value.trim()) {
          errorBox.textContent = "Complete los campos obligatorios.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await createPackage({
            apartment: destResult.code,
            recipientName: nameInput.value.trim(),
            courier: courierInput.value.trim(),
            trackingNumber: trackingInput.value.trim(),
            notes: notesInput.value.trim(),
          });
          toast("Paquete registrado.", "success");
          closeFn();
          reload();
        } catch (err) {
          errorBox.textContent = friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTRAR PAQUETE";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, "Nuevo paquete"),
      field("Torre *", destField.towerSelect),
      field("Piso + unidad *", destField.numberInput),
      destField.hint,
      field("Nombre del destinatario *", nameInput),
      field("Empresa de mensajería *", courierInput),
      field("Número de guía (opcional)", trackingInput),
      field("Observaciones (opcional)", notesInput),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  destField.numberInput.focus();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
