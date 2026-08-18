// El cronómetro de parqueos NUNCA escribe en Firestore cada segundo: solo
// se guarda la hora de entrada una vez. Estas funciones calculan el tiempo
// transcurrido en el navegador, localmente, a partir de esa hora.

/** Convierte un Timestamp de Firestore (o Date) a milisegundos. */
export function toMillis(value) {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

export function elapsedMinutes(entryAt) {
  const start = toMillis(entryAt);
  if (!start) return 0;
  return Math.floor((Date.now() - start) / 60000);
}

/** Días completos transcurridos desde un Timestamp/Date — para avisos de "pendiente hace mucho". */
export function elapsedDays(value) {
  const start = toMillis(value);
  if (!start) return 0;
  return Math.floor((Date.now() - start) / 86400000);
}

/** Formato HH:MM:SS a partir de una hora de inicio. */
export function formatElapsed(entryAt) {
  const start = toMillis(entryAt);
  if (!start) return "--:--:--";
  let totalSeconds = Math.max(0, Math.floor((Date.now() - start) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function formatMinutesDuration(totalMinutes) {
  if (totalMinutes === null || totalMinutes === undefined) return "--";
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h} h ${m} min`;
}

export function formatDateTime(value) {
  const ms = toMillis(value);
  if (!ms) return "--";
  return new Date(ms).toLocaleString("es-CR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value) {
  const ms = toMillis(value);
  if (!ms) return "--";
  return new Date(ms).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Registra un callback que se ejecuta cada segundo (para refrescar
 * cronómetros en pantalla) y devuelve una función para detenerlo. No hace
 * ninguna llamada a red: es puramente local.
 */
export function startLocalTicker(callback) {
  const id = setInterval(callback, 1000);
  return () => clearInterval(id);
}
