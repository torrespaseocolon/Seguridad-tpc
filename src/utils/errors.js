// Traduce errores técnicos de Firebase a mensajes que un guardia sin
// conocimientos técnicos pueda entender. El detalle técnico original se
// conserva en consola (console.error) para poder diagnosticar problemas,
// pero nunca se muestra crudo en la pantalla.
const MESSAGES = {
  "auth/invalid-email": "El correo no tiene un formato válido.",
  "auth/user-disabled": "Esta cuenta está deshabilitada. Contacte a administración.",
  "auth/user-not-found": "No existe una cuenta con ese correo.",
  "auth/wrong-password": "Contraseña incorrecta.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/too-many-requests": "Demasiados intentos. Espere unos minutos e intente de nuevo.",
  "auth/network-request-failed": "Sin conexión a Internet. Verifique su conexión e intente de nuevo.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "permission-denied": "No tiene permisos para realizar esta acción.",
  "unavailable": "Sin conexión con el servidor. Intente nuevamente en unos segundos.",
  "not-found": "El registro que intenta usar ya no existe (puede que otra persona lo haya modificado).",
  "already-exists": "Ese registro ya existe.",
  "deadline-exceeded": "La operación tardó demasiado. Intente nuevamente.",
};

export function friendlyError(error) {
  const code = error?.code || "";
  const short = code.replace("firestore/", "").replace("auth/", "auth/");
  console.error("[SEGURIDAD TPC] Error técnico:", code, error?.message || error);
  return (
    MESSAGES[code] ||
    MESSAGES[short] ||
    "No fue posible completar la acción. Intente nuevamente. Si el problema continúa, reporte el error desde el botón correspondiente."
  );
}
