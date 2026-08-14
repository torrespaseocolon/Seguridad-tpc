// Campo reutilizable "Torre" + "Piso y unidad" — usado en Parqueos,
// Paquetes, Objetos y Tarjetas/Stickers para que un mismo destino siempre se
// guarde igual sin importar cómo lo escriba el guardia (A801 = A-801 =
// A-0801), y para sugerir si es oficina/comercio o apartamento según el
// piso, con las mismas reglas en todas las pantallas.
import { el } from "./dom.js";
import {
  normalizeDigits,
  isValidDigits,
  isValidFloor,
  buildDestinationCode,
  suggestDestinationType,
  parseDestinationCode,
  MAX_FLOOR,
} from "./destination.js";

/**
 * @param {Object} opts
 * @param {"A"|"B"} [opts.defaultTower]
 * @param {boolean} [opts.required] — si el campo es obligatorio.
 * @param {string} [opts.initialValue] — valor existente a precargar (por ejemplo "A-801" o "A801").
 * @returns {{ towerSelect, numberInput, hint, getResult: () => {ok, code, tower, digits, type} | {ok:false, error} }}
 */
export function createDestinationField({ defaultTower = "A", required = true, initialValue = "" } = {}) {
  const parsedInitial = initialValue ? parseDestinationCode(initialValue) : null;
  const initialTower = parsedInitial && parsedInitial.tower ? parsedInitial.tower : defaultTower;

  const towerSelect = el("select", { class: "form-control" }, [
    el("option", { value: "A", selected: initialTower === "A" }, "Torre A"),
    el("option", { value: "B", selected: initialTower === "B" }, "Torre B"),
  ]);
  const numberInput = el("input", {
    class: "form-control",
    required,
    inputmode: "numeric",
    maxlength: "4",
    placeholder: "Ej. 801",
    value: parsedInitial ? parsedInitial.digits : "",
  });
  const hint = el("div", { class: "form-hint" }, "—");

  function refresh() {
    const digits = normalizeDigits(numberInput.value);
    if (numberInput.value !== digits) numberInput.value = digits;
    if (!digits) {
      hint.textContent = required ? "—" : "Vacío si no aplica.";
      return;
    }
    const code = buildDestinationCode(towerSelect.value, digits);
    const suggested = isValidDigits(digits) ? suggestDestinationType(towerSelect.value, digits) : null;
    hint.textContent = `Se guardará como: ${code}${suggested ? ` (${suggested === "office" ? "Oficina/Comercio" : "Apartamento"})` : ""}`;
  }
  towerSelect.addEventListener("change", refresh);
  numberInput.addEventListener("input", refresh);
  refresh();

  function getResult() {
    const digits = normalizeDigits(numberInput.value);
    if (!digits) {
      if (required) return { ok: false, error: "Ingrese el número de piso + unidad." };
      return { ok: true, code: "", tower: "", digits: "", type: null };
    }
    if (!isValidDigits(digits)) {
      return { ok: false, error: "Ingrese el número de piso + unidad (3 o 4 dígitos), por ejemplo 801 o 1204." };
    }
    if (!isValidFloor(digits)) {
      return { ok: false, error: `El piso ingresado no es válido (ningún edificio supera el piso ${MAX_FLOOR}). Revise el número.` };
    }
    return {
      ok: true,
      code: buildDestinationCode(towerSelect.value, digits),
      tower: towerSelect.value,
      digits,
      type: suggestDestinationType(towerSelect.value, digits),
    };
  }

  return { towerSelect, numberInput, hint, refresh, getResult };
}
