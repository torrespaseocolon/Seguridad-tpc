// Avisos del sistema operativo mientras la app está abierta (pantalla de
// Parqueos). Es el nivel "gratis" de notificaciones: funciona sin ningún
// servicio de pago porque no hace falta que nada la "empuje" desde un
// servidor — el propio navegador, que ya está viendo los parqueos en tiempo
// real, dispara el aviso localmente apenas detecta un vehículo excedido.
// No llega si el celular está bloqueado o la app totalmente cerrada — para
// eso sí hace falta un servidor (Cloud Functions, plan pago Blaze).
const STORAGE_KEY = "tpc-notify-enabled";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

export function getPermission() {
  return notificationsSupported() ? Notification.permission : "unsupported";
}

/** true solo si el navegador dio permiso Y el guardia no lo silenció desde la app. */
export function isEnabled() {
  return notificationsSupported() && Notification.permission === "granted" && localStorage.getItem(STORAGE_KEY) !== "off";
}

export async function enable() {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  if (result === "granted") {
    localStorage.setItem(STORAGE_KEY, "on");
    return true;
  }
  return false;
}

export function disable() {
  localStorage.setItem(STORAGE_KEY, "off");
}

export async function notify(title, options) {
  if (!isEnabled()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification(title, { icon: "./icons/logo-square.svg", badge: "./icons/logo-square.svg", ...options });
  } catch (err) {
    console.error("[SEGURIDAD TPC] No se pudo mostrar la notificación:", err);
  }
}
