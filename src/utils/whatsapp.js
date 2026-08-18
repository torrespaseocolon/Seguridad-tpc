// Enlaces "wa.me" — abren el WhatsApp del propio guardia (app o web, el que
// tenga en su dispositivo) con un mensaje ya escrito, listo para revisar y
// enviar con un toque. No es un envío automático ni necesita ningún
// servicio de pago: el guardia sigue siendo quien realmente lo manda.
export function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  // Un número local de Costa Rica (8 dígitos) sin código de país: se le
  // agrega el 506 automáticamente. Si ya viene con código de país (más de
  // 8 dígitos), se deja tal cual.
  if (digits.length === 8) return `506${digits}`;
  return digits;
}

export function whatsappLink(phone, message) {
  const digits = normalizePhone(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
