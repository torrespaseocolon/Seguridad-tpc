// Directorio de teléfonos de oficinas/comercios (ago-2026) — administración
// carga el nombre y teléfono de cada oficina para que, al escribir su
// código en el campo "Torre + piso + unidad" de Parqueos/Visitantes/
// Paquetes/Tarjetas, el guardia vea el teléfono ahí mismo y pueda llamar a
// consultar sobre una visita o un paquete. Nunca aplica a apartamentos, solo
// a destinos tipo "office" (ver suggestDestinationType en destination.js).
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";

let liveDirectory = new Map();

/**
 * Escucha en tiempo real la colección completa y la deja en una caché
 * disponible de forma SÍNCRONA vía getOfficeInfo() — así destination-field.js
 * puede mostrar el teléfono en cada tecla que el guardia escribe, sin una
 * lectura de red por cada dígito (mismo patrón que getTimeRules() en
 * settings.service.js). Se suscribe una sola vez, apenas alguien inicia
 * sesión (ver app.js).
 */
export function subscribeOfficeDirectory() {
  return onSnapshot(
    collection(db, "offices"),
    (snap) => {
      const next = new Map();
      for (const d of snap.docs) next.set(d.id, d.data());
      liveDirectory = next;
    },
    (err) => console.error("[SEGURIDAD TPC] Error escuchando el directorio de oficinas:", err)
  );
}

/** { name, phone } de una oficina por su código canónico ("B-203"), o null si no está cargada en el directorio. */
export function getOfficeInfo(code) {
  return liveDirectory.get(code) || null;
}

/** Lista completa para la pantalla de administración — consulta bajo demanda, no depende de la caché en vivo. */
export async function fetchOfficeDirectory() {
  const snap = await getDocs(collection(db, "offices"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.id.localeCompare(b.id));
}

/** Crea o actualiza una oficina del directorio — `code` es el código canónico ("B-203"), igual al que arma buildDestinationCode(). */
export async function upsertOffice(code, { name, phone }) {
  const profile = getProfile();
  await setDoc(doc(db, "offices", code), {
    name: (name || "").trim(),
    phone: (phone || "").trim(),
    updatedAt: serverTimestamp(),
    updatedByUid: profile.uid,
    updatedByName: profile.name,
  });
  await logAudit("office.upsert", { targetCollection: "offices", targetId: code, details: { name, phone } });
}

export async function deleteOffice(code) {
  await deleteDoc(doc(db, "offices", code));
  await logAudit("office.delete", { targetCollection: "offices", targetId: code });
}
