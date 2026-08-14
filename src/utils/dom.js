// Pequeñas utilidades de interfaz sin depender de ningún framework.
import { icon } from "./icons.js";

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key === "class") node.className = value;
    else if (key === "html") node.innerHTML = value;
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

let toastRegion = null;
export function toast(message, type = "info", duration = 3500) {
  if (!toastRegion) {
    toastRegion = document.getElementById("toast-region");
  }
  if (!toastRegion) return;
  const node = el("div", { class: `toast toast--${type}` }, message);
  toastRegion.appendChild(node);
  setTimeout(() => node.remove(), duration);
}

/**
 * Muestra un cuadro de confirmación (ConfirmDialog) y devuelve una Promise
 * que resuelve en `true` (confirmó) o `false` (canceló / cerró).
 */
export function confirmDialog({ title, body, confirmText = "Confirmar", cancelText = "Cancelar", danger = false }) {
  return new Promise((resolve) => {
    const backdrop = el("div", { class: "modal-backdrop" });
    const close = (result) => {
      backdrop.remove();
      resolve(result);
    };
    const modal = el("div", { class: "modal" }, [
      el("div", { class: "modal__title" }, title),
      el("div", { class: "modal__body" }, body),
      el("div", { class: "form-actions" }, [
        el("button", { class: "btn btn--secondary", onclick: () => close(false) }, cancelText),
        el(
          "button",
          { class: `btn ${danger ? "btn--danger" : "btn--primary"}`, onclick: () => close(true) },
          confirmText
        ),
      ]),
    ]);
    backdrop.appendChild(modal);
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) close(false);
    });
    document.body.appendChild(backdrop);
  });
}

/**
 * Muestra un modal genérico con contenido personalizado (un DOM node).
 * Siempre incluye un botón de cerrar (✕) visible arriba a la derecha, para
 * que sea obvio cómo salir sin completar el formulario por si se abrió por
 * error. Devuelve una función para cerrarlo.
 */
export function openModal(contentNode) {
  const backdrop = el("div", { class: "modal-backdrop" });
  const closeBtn = el(
    "button",
    { type: "button", class: "modal__close", "aria-label": "Cerrar" },
    [icon("close", { size: 18 })]
  );
  const modal = el("div", { class: "modal" }, [closeBtn, contentNode]);
  backdrop.appendChild(modal);
  const closeFn = () => backdrop.remove();
  closeBtn.addEventListener("click", closeFn);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeFn();
  });
  document.body.appendChild(backdrop);
  return closeFn;
}

export function loadingState(text = "Cargando...") {
  return el("div", { class: "loading-state" }, [el("div", { class: "spinner" }), el("div", {}, text)]);
}

/** iconName: clave de src/utils/icons.js (por ejemplo "package", "warning"). */
export function emptyState(iconName, text) {
  return el("div", { class: "empty-state" }, [
    el("div", { class: "empty-state__icon" }, [icon(iconName, { size: 36 })]),
    el("div", {}, text),
  ]);
}
