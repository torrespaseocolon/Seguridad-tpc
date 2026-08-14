// Normalización y reglas de destino (torre + piso + unidad) para los
// registros de parqueo de visita. Antes el guardia escribía el número
// libremente ("A801", "A-801", "0801"...) y el sistema los trataba como
// destinos distintos aunque fueran el mismo lugar. Ahora la torre se elige
// aparte (nunca se teclea mal) y el número se normaliza siempre al mismo
// formato canónico "A-801" (sin ceros a la izquierda), así que "801" y
// "0801" en la torre A quedan como el mismo destino.
//
// Distribución de pisos (informada por administración, ago-2026):
//   Torre A: pisos 1-8 oficinas/comercios, piso 9 en adelante apartamentos.
//   Torre B: piso 1 oficinas/comercios, pisos 2-7 son de parqueos internos
//            (sin unidades), piso 8 en adelante apartamentos.
// El número se interpreta como piso+unidad: 3 dígitos = 1 dígito de piso
// (1-9) + 2 de unidad; 4 dígitos = 2 dígitos de piso (10-99) + 2 de unidad.

export const TOWERS = ["A", "B"];

/** Deja solo dígitos y quita ceros a la izquierda (pero conserva al menos un dígito). */
export function normalizeDigits(raw) {
  const digitsOnly = String(raw || "").replace(/\D/g, "");
  const stripped = digitsOnly.replace(/^0+(?=\d)/, "");
  return stripped;
}

/** true si el número normalizado tiene el largo esperado (piso+unidad = 3 o 4 dígitos). */
export function isValidDigits(digits) {
  return digits.length === 3 || digits.length === 4;
}

/** Arma el código canónico, por ejemplo torre "A" + dígitos "801" -> "A-801". */
export function buildDestinationCode(tower, digits) {
  if (!tower || !digits) return "";
  return `${tower}-${digits}`;
}

function floorFromDigits(digits) {
  if (digits.length === 4) return parseInt(digits.slice(0, 2), 10);
  if (digits.length === 3) return parseInt(digits.slice(0, 1), 10);
  return null;
}

/**
 * Sugiere "apartment" u "office" según la torre y el piso. Devuelve null si
 * no se puede determinar (número inválido, o piso 2-7 de la Torre B, que son
 * plantas de parqueo interno sin unidades). Es solo una SUGERENCIA — el
 * guardia/admin siempre puede cambiarla manualmente en el formulario.
 */
export function suggestDestinationType(tower, digits) {
  const floor = floorFromDigits(digits);
  if (floor === null) return null;
  if (tower === "A") return floor <= 8 ? "office" : "apartment";
  if (tower === "B") {
    if (floor === 1) return "office";
    if (floor >= 2 && floor <= 7) return null;
    return "apartment";
  }
  return null;
}

/**
 * Intenta reconstruir {tower, digits} a partir de un valor ya guardado
 * (para precargar el formulario de corrección de administración con datos
 * antiguos, que pueden no tener el formato canónico todavía).
 */
export function parseDestinationCode(value) {
  const match = String(value || "")
    .trim()
    .toUpperCase()
    .match(/^([AB])[\s-]*(\d+)$/);
  if (!match) return { tower: "", digits: normalizeDigits(value) };
  return { tower: match[1], digits: normalizeDigits(match[2]) };
}
