import { db } from "../firebase/firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { logAudit } from "./audit.service.js";
import { getProfile } from "./auth.service.js";

let cachedSettings = null;

export async function getSettings(forceRefresh = false) {
  if (cachedSettings && !forceRefresh) return cachedSettings;
  const snap = await getDoc(doc(db, "settings", "general"));
  cachedSettings = snap.exists() ? snap.data() : null;
  return cachedSettings;
}

/**
 * Reglas de tiempo de parqueo (ago-2026 v2: vuelven a ser configurables por
 * administración — antes se habían fijado en el código por pedido de la
 * Junta Directiva, pero ahora se pide poder ajustarlas desde la app si el
 * reglamento cambia, sin depender de una modificación de código).
 */
export const DEFAULT_TIME_RULES = {
  maxMinutesApartment: 24 * 60,
  maxMinutesOffice: 6 * 60,
  maxSimultaneousPerDestination: 3,
};

let liveSettings = null;

/**
 * Escucha en tiempo real settings/general y mantiene un valor en caché
 * disponible de forma SÍNCRONA vía getTimeRules() — así registerEntry() en
 * parking.service.js puede leer el límite de tiempo sin depender de una
 * lectura de red (que podría quedarse esperando sin conexión, el mismo
 * problema ya resuelto para otras operaciones — ver nota en
 * parking.service.js). Se suscribe una sola vez, apenas alguien inicia
 * sesión (ver app.js), y gracias a la caché persistente de Firestore el
 * último valor conocido sigue disponible aunque el dispositivo abra la app
 * sin conexión más adelante.
 */
export function subscribeSettings(callback) {
  return onSnapshot(
    doc(db, "settings", "general"),
    (snap) => {
      liveSettings = snap.exists() ? snap.data() : null;
      cachedSettings = liveSettings;
      if (callback) callback(liveSettings);
    },
    (err) => console.error("[SEGURIDAD TPC] Error escuchando configuración:", err)
  );
}

/** Siempre devuelve un valor usable de inmediato, con los valores por defecto si aún no cargó nada. */
export function getTimeRules() {
  return {
    maxMinutesApartment: liveSettings?.maxMinutesApartment ?? DEFAULT_TIME_RULES.maxMinutesApartment,
    maxMinutesOffice: liveSettings?.maxMinutesOffice ?? DEFAULT_TIME_RULES.maxMinutesOffice,
    maxSimultaneousPerDestination: liveSettings?.maxSimultaneousPerDestination ?? DEFAULT_TIME_RULES.maxSimultaneousPerDestination,
  };
}

export async function updateSettings(partial) {
  await updateDoc(doc(db, "settings", "general"), {
    ...partial,
    updatedAt: serverTimestamp(),
    updatedBy: getProfile()?.uid || null,
  });
  cachedSettings = { ...(cachedSettings || {}), ...partial };
  await logAudit("settings.update", { targetCollection: "settings", targetId: "general", details: partial });
}

/**
 * Primera configuración del sistema (PASO 19-20 del manual): crea
 * settings/general y los 13 espacios de parqueo (12 y 13 como
 * discapacidad). Solo debe ejecutarse una vez; el botón que llama a esta
 * función se oculta automáticamente si `initialized` ya es true.
 */
export async function initializeSystem() {
  const existing = await getSettings(true);
  if (existing?.initialized) {
    return { ok: false, message: "El sistema ya fue inicializado anteriormente." };
  }

  const batch = writeBatch(db);

  batch.set(doc(db, "settings", "general"), {
    orgName: "TORRES PASEO COLÓN",
    systemName: "SEGURIDAD TPC",
    logoUrl: "",
    initialized: true,
    updatedAt: serverTimestamp(),
    updatedBy: getProfile()?.uid || null,
  });

  for (let i = 1; i <= 13; i++) {
    const number = String(i).padStart(2, "0");
    const type = i === 12 || i === 13 ? "disability" : "visitor";
    batch.set(doc(db, "parking_spaces", number), {
      number,
      type,
      status: "free",
      sessionId: null,
      visitorName: null,
      visitorId: null,
      plate: null,
      destinationType: null,
      destinationNumber: null,
      entryAt: null,
      entryGuardName: null,
      entryLobby: null,
      maxMinutesAtEntry: null,
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();
  cachedSettings = null;
  await logAudit("system.initialize", { targetCollection: "settings", targetId: "general" });
  return { ok: true };
}
