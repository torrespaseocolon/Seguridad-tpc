// Indicador simple de conexión (CONECTADO / SIN CONEXIÓN). Se apoya en
// los eventos nativos del navegador — no genera ninguna consulta a
// Firebase, así que no tiene costo de cuota.
export function subscribeConnectivity(callback) {
  const update = () => callback(navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
  return () => {
    window.removeEventListener("online", update);
    window.removeEventListener("offline", update);
  };
}

export function isOnline() {
  return navigator.onLine;
}
