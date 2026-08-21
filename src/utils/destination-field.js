// Campo reutilizable "Torre + piso + unidad" — usado en Parqueos, Paquetes,
// Objetos y Tarjetas/Stickers para que un mismo destino siempre se guarde
// igual sin importar cómo lo escriba el guardia (A801 = A-801 = A-0801), y
// para sugerir si es oficina/comercio o apartamento según el piso, con las
// mismas reglas en todas las pantallas.
//
// Es UN solo cuadro de texto (no un botón de torre + un número aparte): el
// guardia escribe todo seguido, por ejemplo "A801". El propio campo obliga
// a que el primer carácter sea A o B (la torre) y el resto sean números (el
// piso + unidad) — no deja escribir nada fuera de esas reglas.
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

/** Deja solo lo permitido: primer carácter A o B, hasta 4 dígitos después. */
function sanitize(raw) {
  const upper = String(raw || "").toUpperCase();
  let out = "";
  for (const ch of upper) {
    if (out.length === 0) {
      if (ch === "A" || ch === "B") out = ch;
    } else if (/[0-9]/.test(ch) && out.length < 5) {
      out += ch;
    }
  }
  return out;
}

/**
 * @param {Object} opts
 * @param {"A"|"B"} [opts.defaultTower]
 * @param {boolean} [opts.required] — si el campo es obligatorio.
 * @param {string} [opts.initialValue] — valor existente a precargar (por ejemplo "A-801" o "A801").
 * @returns {{ input, hint, refresh, getResult: () => {ok, code, tower, digits, type} | {ok:false, error} }}
 */
export function createDestinationField({ defaultTower = "A", required = true, initialValue = "" } = {}) {
  const parsedInitial = initialValue ? parseDestinationCode(initialValue) : null;
  const initialTower = parsedInitial && parsedInitial.tower ? parsedInitial.tower : defaultTower;
  const initialDigits = parsedInitial ? parsedInitial.digits : "";

  const input = el("input", {
    class: "form-control",
    required,
    maxlength: "5",
    placeholder: "Ej. A801",
    style: "text-transform:uppercase;",
    value: initialDigits ? `${initialTower}${initialDigits}` : "",
  });
  const hint = el("div", { class: "form-hint" }, "—");

  function parts() {
    const clean = sanitize(input.value);
    const tower = clean.slice(0, 1);
    const digits = normalizeDigits(clean.slice(1));
    return { tower, digits };
  }

  function refresh() {
    const clean = sanitize(input.value);
    if (input.value !== clean) input.value = clean;
    const { tower, digits } = parts();
    if (!tower) {
      hint.textContent = "Empiece con la torre: A o B.";
      return;
    }
    if (!digits) {
      hint.textContent = required ? "Continúe con el piso + unidad, ej. 801." : "Vacío si no aplica.";
      return;
    }
    const code = buildDestinationCode(tower, digits);
    const suggested = isValidDigits(digits) ? suggestDestinationType(tower, digits) : null;
    hint.textContent = `Se guardará como: ${code}${suggested ? ` (${suggested === "office" ? "Oficina/Comercio" : "Apartamento"})` : ""}`;
  }
  input.addEventListener("input", refresh);
  refresh();

  function getResult() {
    const { tower, digits } = parts();
    if (!tower) {
      if (required) return { ok: false, error: "Ingrese la torre y el número de piso + unidad, por ejemplo A801." };
      return { ok: true, code: "", tower: "", digits: "", type: null };
    }
    if (!digits) {
      return { ok: false, error: "Ingrese el número de piso + unidad, por ejemplo 801." };
    }
    if (!isValidDigits(digits)) {
      return { ok: false, error: "Ingrese el número de piso + unidad (3 o 4 dígitos), por ejemplo A801 o B1204." };
    }
    if (!isValidFloor(digits)) {
      return { ok: false, error: `El piso ingresado no es válido (ningún edificio supera el piso ${MAX_FLOOR}). Revise el número.` };
    }
    return {
      ok: true,
      code: buildDestinationCode(tower, digits),
      tower,
      digits,
      type: suggestDestinationType(tower, digits),
    };
  }

  return { input, hint, refresh, getResult };
}
