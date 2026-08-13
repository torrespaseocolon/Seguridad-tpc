import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  updateDoc,
  getDocs,
  where,
  limit as fbLimit,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { getSettings } from "./settings.service.js";
import { logAudit } from "./audit.service.js";
import { elapsedMinutes } from "../utils/time.js";

/**
 * Escucha en tiempo real los 13 espacios de parqueo. Es el ÚNICO listener
 * "permanente" de toda la aplicación, porque es la única pantalla donde
 * Lobby A y Lobby B necesitan verse coordinados al instante (requisito 23
 * y 72 del proyecto). Se cancela automáticamente al salir de la pantalla
 * de Parqueos (ver router.js).
 */
export function subscribeParkingSpaces(callback, onError) {
  const q = query(collection(db, "parking_spaces"), orderBy("number"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
    (err) => {
      console.error("[SEGURIDAD TPC] Error escuchando parqueos:", err);
      if (onError) onError(err);
    }
  );
}

class OperationError extends Error {}

export async function registerEntry(spaceNumber, data) {
  const profile = getProfile();
  const settings = await getSettings();
  const maxMinutes = settings?.maxParkingMinutes ?? 120;
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  const sessionRef = doc(collection(db, "parking_sessions"));

  await runTransaction(db, async (tx) => {
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists()) throw new OperationError("Ese parqueo no existe.");
    const space = spaceSnap.data();
    if (space.status !== "free") {
      throw new OperationError("Este parqueo acaba de ser ocupado por otro usuario. Elija otro espacio.");
    }
    if (space.type === "disabled") {
      throw new OperationError("Este parqueo está deshabilitado.");
    }

    tx.set(sessionRef, {
      spaceNumber,
      status: "open",
      visitorName: data.visitorName,
      visitorId: data.visitorId,
      plate: data.plate,
      destinationType: data.destinationType,
      destinationNumber: data.destinationNumber,
      entryAt: serverTimestamp(),
      entryGuardUid: profile.uid,
      entryGuardName: profile.name,
      entryLobby: profile.lobby || data.lobbyOverride || null,
      exitAt: null,
      exitGuardUid: null,
      exitGuardName: null,
      exitLobby: null,
      durationMinutes: null,
      maxMinutesAtEntry: maxMinutes,
      corrected: false,
      correctionNote: "",
    });

    tx.update(spaceRef, {
      status: "occupied",
      sessionId: sessionRef.id,
      visitorName: data.visitorName,
      visitorId: data.visitorId,
      plate: data.plate,
      destinationType: data.destinationType,
      destinationNumber: data.destinationNumber,
      entryAt: serverTimestamp(),
      entryGuardName: profile.name,
      entryLobby: profile.lobby || data.lobbyOverride || null,
      maxMinutesAtEntry: maxMinutes,
      updatedAt: serverTimestamp(),
    });
  });

  await logAudit("parking.entry", {
    targetCollection: "parking_sessions",
    targetId: sessionRef.id,
    details: { spaceNumber, plate: data.plate },
  });

  return { ok: true };
}

export async function registerExit(spaceNumber) {
  const profile = getProfile();
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  let sessionId = null;
  let durationMinutes = 0;

  await runTransaction(db, async (tx) => {
    const spaceSnap = await tx.get(spaceRef);
    if (!spaceSnap.exists()) throw new OperationError("Ese parqueo no existe.");
    const space = spaceSnap.data();
    if (space.status !== "occupied" || !space.sessionId) {
      throw new OperationError("Este vehículo ya fue registrado como salida por otro usuario.");
    }
    sessionId = space.sessionId;
    const sessionRef = doc(db, "parking_sessions", sessionId);
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists() || sessionSnap.data().status !== "open") {
      throw new OperationError("Este registro ya fue cerrado.");
    }
    durationMinutes = elapsedMinutes(sessionSnap.data().entryAt);

    tx.update(sessionRef, {
      status: "closed",
      exitAt: serverTimestamp(),
      exitGuardUid: profile.uid,
      exitGuardName: profile.name,
      exitLobby: profile.lobby || null,
      durationMinutes,
    });

    tx.update(spaceRef, {
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
  });

  await logAudit("parking.exit", {
    targetCollection: "parking_sessions",
    targetId: sessionId,
    details: { spaceNumber, durationMinutes },
  });

  return { ok: true };
}

/** Solo administración: libera un espacio manualmente (corrección de un error operativo). */
export async function forceReleaseSpace(spaceNumber, note) {
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  const snap = await getDocs(query(collection(db, "parking_spaces"), where("number", "==", spaceNumber), fbLimit(1)));
  const space = snap.docs[0]?.data();
  const sessionId = space?.sessionId || null;

  await updateDoc(spaceRef, {
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

  if (sessionId) {
    await updateDoc(doc(db, "parking_sessions", sessionId), {
      status: "closed",
      exitAt: serverTimestamp(),
      exitGuardUid: getProfile().uid,
      exitGuardName: getProfile().name + " (corrección admin)",
      exitLobby: getProfile().lobby || null,
      corrected: true,
      correctionNote: note || "Liberado manualmente por administración.",
    });
  }

  await logAudit("parking.force_release", { targetCollection: "parking_spaces", targetId: spaceNumber, details: { note } });
  return { ok: true };
}

/** Solo administración: cambia el tipo de un espacio (visitante/discapacidad/deshabilitado). */
export async function updateSpaceType(spaceNumber, type) {
  await updateDoc(doc(db, "parking_spaces", spaceNumber), { type, updatedAt: serverTimestamp() });
  await logAudit("parking_space.update_type", { targetCollection: "parking_spaces", targetId: spaceNumber, details: { type } });
}

/** Historial con filtros — consulta bajo demanda (no listener). */
export async function fetchParkingHistory({ max = 50 } = {}) {
  const q = query(collection(db, "parking_sessions"), where("status", "==", "closed"), orderBy("entryAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Solo administración: corrige un registro cerrado por error (por ejemplo,
 * "registré por error la salida de otro vehículo"). Reabre la sesión y
 * vuelve a ocupar su espacio, siempre que ese espacio esté libre en este
 * momento — si otra sesión lo ocupa, primero debe liberarse esa (ver
 * "Liberar (corrección)" en Configuración de Parqueos).
 */
export async function reopenSession(sessionId, note) {
  const sessionRef = doc(db, "parking_sessions", sessionId);

  await runTransaction(db, async (tx) => {
    const sessionSnap = await tx.get(sessionRef);
    if (!sessionSnap.exists()) throw new OperationError("Ese registro no existe.");
    const session = sessionSnap.data();
    if (session.status !== "closed") throw new OperationError("Ese registro no está cerrado.");

    const spaceRef = doc(db, "parking_spaces", session.spaceNumber);
    const spaceSnap = await tx.get(spaceRef);
    if (spaceSnap.exists() && spaceSnap.data().status === "occupied") {
      throw new OperationError(
        `El parqueo ${session.spaceNumber} está ocupado por otro registro. Libérelo primero desde Configuración de Parqueos.`
      );
    }

    tx.update(sessionRef, {
      status: "open",
      exitAt: null,
      exitGuardUid: null,
      exitGuardName: null,
      exitLobby: null,
      durationMinutes: null,
      corrected: true,
      correctionNote: note || "Reabierto por corrección administrativa.",
    });

    tx.update(spaceRef, {
      status: "occupied",
      sessionId,
      visitorName: session.visitorName,
      visitorId: session.visitorId,
      plate: session.plate,
      destinationType: session.destinationType,
      destinationNumber: session.destinationNumber,
      entryAt: session.entryAt,
      entryGuardName: session.entryGuardName,
      entryLobby: session.entryLobby,
      maxMinutesAtEntry: session.maxMinutesAtEntry,
      updatedAt: serverTimestamp(),
    });
  });

  await logAudit("parking_session.reopen", { targetCollection: "parking_sessions", targetId: sessionId, details: { note } });
  return { ok: true };
}

/** Búsqueda puntual por placa, para la pantalla de correcciones administrativas. */
export async function fetchSessionsByPlate(plate) {
  const q = query(
    collection(db, "parking_sessions"),
    where("plate", "==", plate.trim().toUpperCase()),
    orderBy("entryAt", "desc"),
    fbLimit(10)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Solo administración: corrige campos de un registro (nombre, cédula, placa, destino). */
export async function correctSessionFields(sessionId, patch, note) {
  await updateDoc(doc(db, "parking_sessions", sessionId), { ...patch, corrected: true, correctionNote: note || "" });
  await logAudit("parking_session.correct_fields", { targetCollection: "parking_sessions", targetId: sessionId, details: { patch, note } });
}

export { OperationError };
