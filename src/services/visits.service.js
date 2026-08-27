// Registro general de visitantes — separado de Parqueos a propósito
// (ago-2026): no toda visita necesita un espacio de parqueo (puede llegar a
// pie, o parquear en el propio espacio asignado del apartamento/oficina que
// visita, fuera de los parqueos compartidos de visita). Cuando SÍ hace
// falta un espacio, esta pantalla reutiliza registerEntry() de
// parking.service.js para crear el mismo registro de parqueo de siempre —
// visits/{id} solo guarda además el enlace a ese registro.
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit as fbLimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";
import { settle } from "../utils/offline-write.js";

export async function createVisit({
  visitorName,
  visitorId,
  visitorPhone,
  destinationType,
  destinationNumber,
  needsParking,
  parkingSpaceNumber = null,
  parkingSessionId = null,
  notes,
  isDemo = false,
}) {
  const profile = getProfile();
  const ref = doc(collection(db, "visits"));
  await settle(
    setDoc(ref, {
      visitorName,
      visitorId,
      visitorPhone,
      destinationType,
      destinationNumber,
      needsParking: !!needsParking,
      parkingSpaceNumber,
      parkingSessionId,
      notes: notes || "",
      isDemo,
      createdAt: new Date(), // hora del dispositivo, no serverTimestamp() — ver nota en parking.service.js
      createdByUid: profile.uid,
      createdByName: profile.name,
      lobby: profile.lobby || null,
    })
  );
  logAudit("visit.create", { targetCollection: "visits", targetId: ref.id, details: { visitorName, destinationNumber, needsParking } });
  return ref.id;
}

/**
 * Marca en el propio registro de la visita la hora en que salió del
 * condominio — separado del cierre del parqueo en sí (parking_sessions),
 * que ya queda registrado por registerVisitExit() en parking.service.js.
 * Así el registro de Visitantes muestra la salida sin tener que cruzar con
 * el historial de Parqueos.
 */
export async function markVisitExited(id) {
  await settle(updateDoc(doc(db, "visits", id), { exitAt: new Date() }));
  logAudit("visit.exit", { targetCollection: "visits", targetId: id });
}

export async function fetchRecentVisits(max = 100) {
  const q = query(collection(db, "visits"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
