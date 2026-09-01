// Registro general de visitantes — separado de Parqueos a propósito
// (ago-2026): no toda visita necesita un espacio de parqueo (puede llegar a
// pie, o parquear en el propio espacio asignado del apartamento/oficina que
// visita, fuera de los parqueos compartidos de visita). Cuando SÍ hace
// falta un espacio, esta pantalla reutiliza registerEntry() de
// parking.service.js para crear el mismo registro de parqueo de siempre —
// visits/{id} solo guarda además el enlace a ese registro.
//
// `entryMode` distingue las 3 formas en que puede ingresar una visita:
// "parking" (se le asignó un parqueo compartido de visita — needsParking
// true, con parkingSpaceNumber/parkingSessionId), "ownerSpace" (parquea en
// el espacio propio del apartamento/oficina que visita — se guarda la placa
// para poder identificar el auto si hace falta, pero no toca parking_spaces
// ni parking_sessions) o "pedestrian" (ingreso a pie, sin vehículo).
import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  query,
  where,
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
  entryMode = null,
  plate = null,
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
      visitorPhone: visitorPhone || "",
      destinationType,
      destinationNumber,
      needsParking: !!needsParking,
      entryMode,
      plate: plate || null,
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
  logAudit("visit.create", { targetCollection: "visits", targetId: ref.id, details: { visitorName, destinationNumber, entryMode } });
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

/**
 * Corrige CÓMO ingresó una visita (el guardia se equivocó de modalidad al
 * registrarla, o el visitante terminó haciendo algo distinto de lo
 * indicado — ver nota arriba). `patch` solo puede tocar los campos que
 * firestore.rules permite para un guardia de Lobby B: entryMode, plate,
 * needsParking, parkingSpaceNumber, parkingSessionId. Si el cambio implica
 * crear o liberar un parqueo compartido real, eso ya debe haberse hecho
 * ANTES de llamar a esta función (ver visits.page.js).
 */
export async function updateVisitEntry(id, patch) {
  await settle(updateDoc(doc(db, "visits", id), patch));
  logAudit("visit.correct_entry", { targetCollection: "visits", targetId: id, details: patch });
}

/**
 * Busca la visita (si hay alguna) vinculada a una sesión de parqueo — usada
 * por las 3 funciones de abajo para mantener sincronizado el registro de
 * Visitantes con lo que pasa del lado de Parqueos, sin importar desde cuál
 * pantalla se haga la operación.
 */
async function findVisitBySession(sessionId) {
  const snap = await getDocs(query(collection(db, "visits"), where("parkingSessionId", "==", sessionId), fbLimit(1)));
  return snap.empty ? null : snap.docs[0];
}

/**
 * Si esta sesión de parqueo tiene una visita vinculada, la marca como salida
 * también — para que el registro de Visitantes quede al día sin importar si
 * la salida se registró ahí mismo o directo desde Parqueos. No hace nada si
 * no hay ninguna visita vinculada o si esa visita ya estaba marcada como
 * salida.
 */
export async function closeLinkedVisit(sessionId) {
  const visit = await findVisitBySession(sessionId);
  if (!visit || visit.data().exitAt) return;
  await markVisitExited(visit.id);
}

/**
 * Contraparte de closeLinkedVisit: cuando administración reabre una sesión
 * cerrada por error (ver reopenSession() en parking.service.js), la visita
 * vinculada no debe seguir mostrando "salida registrada".
 */
export async function reopenLinkedVisit(sessionId) {
  const visit = await findVisitBySession(sessionId);
  if (!visit || !visit.data().exitAt) return;
  await updateDoc(doc(db, "visits", visit.id), { exitAt: null });
  logAudit("visit.reopen", { targetCollection: "visits", targetId: visit.id });
}

/**
 * Si se corrige el número de espacio de una sesión (ver correctSessionSpace()
 * en parking.service.js — "en realidad está en otro parqueo"), la visita
 * vinculada debe mostrar el número correcto, no el viejo.
 */
export async function updateLinkedVisitSpace(sessionId, newSpaceNumber) {
  const visit = await findVisitBySession(sessionId);
  if (!visit) return;
  await updateDoc(doc(db, "visits", visit.id), { parkingSpaceNumber: newSpaceNumber });
}

/**
 * Visitas por rango de fecha que parquearon en el espacio del propietario
 * (entryMode "ownerSpace") — usado por fetchFrequentVisitorAlerts() en
 * parking.service.js para poder detectar patrones de placas repetidas
 * incluso cuando el vehículo no usó un parqueo compartido de visita (esas
 * nunca quedan en parking_sessions).
 */
export async function fetchOwnerSpaceVisitsSince(since) {
  const snap = await getDocs(query(collection(db, "visits"), where("createdAt", ">=", since), orderBy("createdAt", "desc")));
  return snap.docs.map((d) => d.data()).filter((v) => v.entryMode === "ownerSpace");
}

export async function fetchRecentVisits(max = 100) {
  const q = query(collection(db, "visits"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Búsqueda por rango de fecha (una sola condición, no necesita índice compuesto) — mismo patrón que fetchParkingHistory. */
export async function fetchVisitHistory({ max = 300, from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("createdAt", ">=", from));
  if (to) clauses.push(where("createdAt", "<=", to));
  const q = query(collection(db, "visits"), ...clauses, orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
