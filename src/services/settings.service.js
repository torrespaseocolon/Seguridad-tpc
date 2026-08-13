import { db } from "../firebase/firebase-init.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
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
    maxParkingMinutes: 120,
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
