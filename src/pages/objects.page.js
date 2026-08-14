import { el, clear, toast, confirmDialog, openModal, loadingState, emptyState } from "../utils/dom.js";
import { icon } from "../utils/icons.js";
import { createDestinationField } from "../utils/destination-field.js";
import { fetchActiveObjects, fetchActiveLoans, loanObject, returnObject, OperationError } from "../services/objects.service.js";
import { formatDateTime } from "../utils/time.js";
import { navigate } from "../router.js";
import { friendlyError } from "../utils/errors.js";

const BORROWER_LABELS = { resident: "Residente", concierge: "Concierge", admin: "Administración", other: "Otro" };

export function renderObjects(root) {
  clear(root);
  root.appendChild(
    el("div", { class: "back-bar" }, [
      el("button", { class: "btn btn--secondary", onclick: () => navigate("/") }, [icon("back", { size: 18 }), " Menú"]),
      el("h2", { class: "row" }, [icon("tools"), "Objetos"]),
    ])
  );

  let tab = "available";
  const tabBar = el("div", { class: "row", style: "margin-bottom:16px;" });
  const list = el("div", { class: "stack" });
  root.appendChild(tabBar);
  root.appendChild(list);

  function renderTabs() {
    clear(tabBar);
    tabBar.appendChild(
      el(
        "button",
        { class: `btn ${tab === "available" ? "btn--primary" : "btn--secondary"} grow`, onclick: () => setTab("available") },
        "Disponibles"
      )
    );
    tabBar.appendChild(
      el(
        "button",
        { class: `btn ${tab === "loaned" ? "btn--primary" : "btn--secondary"} grow`, onclick: () => setTab("loaned") },
        "Prestados"
      )
    );
  }

  function setTab(next) {
    tab = next;
    renderTabs();
    load();
  }

  async function load() {
    clear(list);
    list.appendChild(loadingState());
    try {
      if (tab === "available") {
        const objects = await fetchActiveObjects();
        clear(list);
        const available = objects.filter((o) => o.availableQuantity > 0);
        if (available.length === 0) {
          list.appendChild(emptyState("tools", "No hay objetos disponibles en este momento."));
          return;
        }
        for (const obj of available) list.appendChild(renderObjectCard(obj, load));
      } else {
        const loans = await fetchActiveLoans();
        clear(list);
        if (loans.length === 0) {
          list.appendChild(emptyState("tools", "No hay objetos prestados actualmente."));
          return;
        }
        for (const loan of loans) list.appendChild(renderLoanCard(loan, load));
      }
    } catch (err) {
      clear(list);
      list.appendChild(emptyState("warning", friendlyError(err)));
    }
  }

  renderTabs();
  load();
}

function renderObjectCard(obj, reload) {
  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, obj.name),
      el("span", { class: "badge badge--info" }, `${obj.availableQuantity} disponible(s)`),
    ]),
    obj.category ? el("div", { class: "text-secondary" }, obj.category) : null,
    obj.description ? el("div", { class: "text-faint" }, obj.description) : null,
    el("div", { class: "mt-md" }, [
      el("button", { class: "btn btn--primary btn--block", onclick: () => openLoanModal(obj, reload) }, "PRESTAR"),
    ]),
  ].filter(Boolean));
}

function renderLoanCard(loan, reload) {
  const returnBtn = el("button", { class: "btn btn--success btn--block" }, "REGISTRAR DEVOLUCIÓN");
  returnBtn.addEventListener("click", () => openReturnModal(loan, reload));
  return el("div", { class: "card" }, [
    el("div", { class: "row row--between" }, [
      el("strong", {}, loan.objectName),
      el("span", { class: "badge badge--pending" }, "PRESTADO"),
    ]),
    el("div", { class: "text-secondary" }, `${BORROWER_LABELS[loan.borrowerType] || loan.borrowerType}: ${loan.borrowerName}${loan.apartment ? " · Apt. " + loan.apartment : ""}`),
    el("div", { class: "text-faint" }, `Prestado: ${formatDateTime(loan.loanedAt)} · ${loan.loanedByName || ""}`),
    el("div", { class: "mt-md" }, [returnBtn]),
  ]);
}

function openLoanModal(obj, reload) {
  const typeSelect = el("select", { class: "form-control" }, [
    el("option", { value: "resident" }, "Residente"),
    el("option", { value: "concierge" }, "Concierge"),
    el("option", { value: "admin" }, "Administración"),
    el("option", { value: "other" }, "Otro"),
  ]);
  const nameInput = el("input", { class: "form-control", required: true });
  const destField = createDestinationField({ required: false });
  const notesInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg", type: "submit" }, "REGISTRAR PRÉSTAMO");

  const form = el(
    "form",
    {
      class: "stack",
      onsubmit: async (e) => {
        e.preventDefault();
        if (!nameInput.value.trim()) {
          errorBox.textContent = "Ingrese el nombre de la persona.";
          errorBox.style.display = "block";
          return;
        }
        const destResult = destField.getResult();
        if (!destResult.ok) {
          errorBox.textContent = destResult.error;
          errorBox.style.display = "block";
          return;
        }
        submitBtn.disabled = true;
        submitBtn.textContent = "GUARDANDO...";
        try {
          await loanObject({
            objectId: obj.id,
            objectName: obj.name,
            borrowerType: typeSelect.value,
            borrowerName: nameInput.value.trim(),
            apartment: destResult.code,
            notes: notesInput.value.trim(),
          });
          toast("Préstamo registrado.", "success");
          closeFn();
          reload();
        } catch (err) {
          errorBox.textContent = err instanceof OperationError ? err.message : friendlyError(err);
          errorBox.style.display = "block";
          submitBtn.disabled = false;
          submitBtn.textContent = "REGISTRAR PRÉSTAMO";
        }
      },
    },
    [
      el("div", { class: "modal__title" }, `Prestar: ${obj.name}`),
      field("¿A quién se presta?", typeSelect),
      field("Nombre *", nameInput),
      field("Torre (si corresponde)", destField.towerSelect),
      field("Piso + unidad (si corresponde)", destField.numberInput),
      destField.hint,
      field("Observaciones", notesInput),
      errorBox,
      submitBtn,
    ]
  );

  const closeFn = openModal(form);
  nameInput.focus();
}

function openReturnModal(loan, reload) {
  const conditionSelect = el("select", { class: "form-control" }, [
    el("option", { value: "bueno" }, "Buen estado"),
    el("option", { value: "danado" }, "Con daño / observación"),
  ]);
  const notesInput = el("textarea", { class: "form-control", rows: "2" });
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const submitBtn = el("button", { class: "btn btn--primary btn--block btn--lg" }, "CONFIRMAR DEVOLUCIÓN");

  const content = el("div", { class: "stack" }, [
    el("div", { class: "modal__title" }, `Devolución: ${loan.objectName}`),
    el("div", { class: "text-secondary" }, `${loan.borrowerName}${loan.apartment ? " · Apt. " + loan.apartment : ""}`),
    field("Estado del objeto", conditionSelect),
    field("Observaciones (opcional)", notesInput),
    errorBox,
    submitBtn,
  ]);

  const closeFn = openModal(content);

  submitBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({ title: "Confirmar devolución", body: `¿Confirma la devolución de "${loan.objectName}"?` });
    if (!ok) return;
    submitBtn.disabled = true;
    submitBtn.textContent = "GUARDANDO...";
    try {
      await returnObject(loan.id, { returnObservations: notesInput.value.trim(), returnCondition: conditionSelect.value });
      toast("Devolución registrada.", "success");
      closeFn();
      reload();
    } catch (err) {
      errorBox.textContent = err instanceof OperationError ? err.message : friendlyError(err);
      errorBox.style.display = "block";
      submitBtn.disabled = false;
      submitBtn.textContent = "CONFIRMAR DEVOLUCIÓN";
    }
  });
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
