import { el, clear, toast, confirmDialog, openModal, loadingState, emptyState } from "../utils/dom.js";
import { createPackage, fetchPendingPackages, deliverPackage } from "../services/packages.service.js";
import { formatDateTime } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

export function renderPackages(root) {
  clear(root);
  const list = el("div", { class: "stack" });

  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, "← Menú"),
      el("h2", {}, "📦 Paquetes"),
    ])
  );
  root.appendChild(
    el("div", { class: "row", style: "margin-bottom:16px;" }, [
      el("button", { class: "btn btn--primary grow", onclick: () => openNewPackageModal(load) }, "+ NUEVO PAQUETE"),
      el("button", { class: "btn btn--secondary", onclick: load }, "↻ Actualizar"),
    ])
  );
  root.appendChild(list);

  async function load() {
    clear(list);
    list.appendChild(loadingState("Cargando paquetes pendientes..."));
    try {
      const packages = await fetchPendingPackages();
      clear(list);
      if (packages.length === 0) {
        list.appendChild(emptyState("📦", "No hay paquetes pendientes de entrega."));
        return;
      }
      for (const pkg of packages) list.appendChild(renderPackageCard(pkg, load));
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("⚠️", friendlyError(err)));
    }
  }

  load();
}

function renderPackageCard(pkg, reload) {
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

  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, `Apt. ${pkg.apartment} — ${pkg.recipientName}`),
      el("span", { class: "badge badge--pending" }, "PENDIENTE"),
    ]),
    el("div", { class: "text-secondary mt-md" }, `Empresa: ${pkg.courier}${pkg.trackingNumber ? " · Guía: " + pkg.trackingNumber : ""}`),
    pkg.notes ? el("div", { class: "text-secondary" }, `Nota: ${pkg.notes}`) : null,
    el("div", { class: "text-faint" }, `Recibido: ${formatDateTime(pkg.createdAt)} · ${pkg.createdByName || ""}`),
    el("div", { class: "mt-md" }, [deliverBtn]),
  ].filter(Boolean));
}

function openNewPackageModal(reload) {
  const apartmentInput = el("input", { class: "form-control", required: true, placeholder: "Ej. 804" });
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
        if (!apartmentInput.value.trim() || !nameInput.value.trim() || !courierInput.value.trim()) {
          errorBox.textContent = "Complete los campos obligatorios.";
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await createPackage({
            apartment: apartmentInput.value.trim(),
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
      field("Apartamento / Oficina *", apartmentInput),
      field("Nombre del destinatario *", nameInput),
      field("Empresa de mensajería *", courierInput),
      field("Número de guía (opcional)", trackingInput),
      field("Observaciones (opcional)", notesInput),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  apartmentInput.focus();
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
