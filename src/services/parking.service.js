import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  runTransaction,
  serverTimestamp,
  updateDoc,
  setDoc,
  getDocs,
  where,
  limit as fbLimit,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";
import { elapsedMinutes } from "../utils/time.js";
import { isOnline } from "../utils/connectivity.js";
import { settle } from "../utils/offline-write.js";

// -----------------------------------------------------------------------
// Reglas de tiempo máximo por tipo de destino (requisito de la Junta
// Directiva, ago-2026): ya no las configura el administrador — el sistema
// las aplica automáticamente según a dónde va el visitante. También se
// limita cuántos parqueos de visita puede tener EN USO al mismo tiempo un
// mismo apartamento/oficina, para evitar abuso del espacio compartido.
// -----------------------------------------------------------------------
export const MAX_MINUTES_OFFICE = 6 * 60; // 6 horas — oficinas y comercios
export const MAX_MINUTES_APARTMENT = 24 * 60; // 24 horas — apartamentos
export const MAX_SIMULTANEOUS_PER_DESTINATION = 3;

function maxMinutesForDestination(destinationType) {
  return destinationType === "office" ? MAX_MINUTES_OFFICE : MAX_MINUTES_APARTMENT;
}

/**
 * Dirección pública de consulta (sin iniciar sesión) para que el visitante
 * vea cuánto tiempo le queda escaneando su código QR. Se arma relativa a la
 * ubicación actual del sitio, así que funciona igual en GitHub Pages o en
 * cualquier otro lugar donde se publique el proyecto.
 */
export function buildConsultaUrl(sessionId) {
  return new URL(`consulta.html?id=${encodeURIComponent(sessionId)}`, window.location.href).href;
}

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

/**
 * Antes registerEntry/registerExit usaban runTransaction + getCountFromServer,
 * y luego (ago-2026) pasaron a getDoc/getDocs comunes. Pero incluso getDoc
 * "normal" puede quedarse esperando mucho tiempo una respuesta del servidor
 * cuando la señal se corta de golpe (no offline "prolijo" del navegador,
 * sino que el router deja de responder) — el guardia veía "GUARDANDO..."
 * sin que nunca terminara. Por eso ahora NINGUNA lectura de red bloquea
 * estas dos funciones: usan solo los datos que la propia pantalla ya tiene
 * en memoria (de su listener en tiempo real o de lo que el guardia acaba de
 * tocar), y escriben directo con setDoc/updateDoc — esas sí son 100%
 * offline-seguras (se guardan en el dispositivo y se sincronizan solas).
 *
 * Ago-2026: desde que SOLO el guardia de Lobby B (o un administrador) puede
 * registrar entradas/salidas (ver canOperateParking() en parking.page.js y
 * la restricción de lobby en firestore.rules), el riesgo de que dos personas
 * choquen en el mismo espacio al mismo tiempo es bajo y se acepta.
 */
export async function registerEntry(spaceNumber, data) {
  const profile = getProfile();
  const destinationType = data.destinationType;
  const destinationNumber = data.destinationNumber.trim();
  const maxMinutes = maxMinutesForDestination(destinationType);
  // entryAtOverride: solo lo usa la Demostración, para poder mostrar un
  // parqueo a punto de vencerse sin tener que esperar horas reales. Cualquier
  // llamada normal (guardia registrando una entrada real) no la pasa, así que
  // sigue usando la hora real del servidor.
  const entryAtValue = data.entryAtOverride instanceof Date ? data.entryAtOverride : serverTimestamp();

  // Límite de parqueos de visita simultáneos por apartamento/oficina: es una
  // consulta de red (getDocs), así que solo se hace si hay señal. Sin
  // conexión se omite el chequeo en vez de arriesgarse a que se quede
  // esperando — el guardia ya ve la pantalla "SIN CONEXIÓN" y sabe que está
  // operando con ese riesgo pequeño y aceptado.
  if (isOnline()) {
    // settle() por si "en línea" es un falso positivo (wifi conectado pero
    // sin internet real): en ese caso, en vez de colgarse, se omite el
    // chequeo después de esperar un poco en vez de nunca.
    const activeSnap = await settle(
      getDocs(
        query(
          collection(db, "parking_sessions"),
          where("status", "==", "open"),
          where("destinationType", "==", destinationType),
          where("destinationNumber", "==", destinationNumber)
        )
      )
    );
    if (activeSnap && activeSnap.size >= MAX_SIMULTANEOUS_PER_DESTINATION) {
      throw new OperationError(
        `Ya hay ${MAX_SIMULTANEOUS_PER_DESTINATION} parqueos de visita en uso para este ${destinationType === "office" ? "local" : "apartamento"} (máximo permitido). Debe liberarse uno antes de registrar otro.`
      );
    }
  }

  // No se vuelve a leer el espacio con getDoc: la pantalla de Parqueos solo
  // deja tocar "Registrar entrada" en un espacio que su propio listener en
  // tiempo real ya muestra como libre, así que esa validación ya se hizo
  // sola al pintar la pantalla.
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  const sessionRef = doc(collection(db, "parking_sessions"));

  // Las 3 escrituras son independientes entre sí (no necesitan esperarse una
  // a otra), así que se disparan juntas y se espera el conjunto UNA sola vez
  // con settle() — si no hay señal, Firestore ya las dejó guardadas en su
  // cola local y las sincroniza sola; esta función no se queda colgada
  // esperando la confirmación del servidor que, sin señal, no llega.
  await settle(
    Promise.all([
      setDoc(sessionRef, {
        spaceNumber,
        status: "open",
        visitorName: data.visitorName,
        visitorId: data.visitorId,
        plate: data.plate,
        visitorPhone: data.visitorPhone || "",
        isDemo: !!data.isDemo,
        destinationType,
        destinationNumber,
        entryAt: entryAtValue,
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
      }),
      updateDoc(spaceRef, {
        status: "occupied",
        sessionId: sessionRef.id,
        visitorName: data.visitorName,
        visitorId: data.visitorId,
        plate: data.plate,
        visitorPhone: data.visitorPhone || "",
        isDemo: !!data.isDemo,
        destinationType,
        destinationNumber,
        entryAt: entryAtValue,
        entryGuardName: profile.name,
        entryLobby: profile.lobby || data.lobbyOverride || null,
        maxMinutesAtEntry: maxMinutes,
        updatedAt: serverTimestamp(),
      }),
      // Espejo público (sin datos personales) para la consulta por QR.
      setDoc(doc(db, "public_status", sessionRef.id), {
        spaceNumber,
        destinationType,
        entryAt: entryAtValue,
        maxMinutesAtEntry: maxMinutes,
        extendedMinutes: 0,
        status: "open",
        exitAt: null,
      }),
    ])
  );

  // Sin await: la auditoría nunca debe sumar más espera a esta operación.
  logAudit("parking.entry", {
    targetCollection: "parking_sessions",
    targetId: sessionRef.id,
    details: { spaceNumber, plate: data.plate },
  });

  return { ok: true, sessionId: sessionRef.id, consultaUrl: buildConsultaUrl(sessionRef.id) };
}

/**
 * sessionId y entryAt los recibe de quien llama (la pantalla de Parqueos ya
 * los tiene del espacio que está mostrando; consulta.js ya los tiene del
 * documento public_status que está mirando) — así esta función no necesita
 * leer nada de Firestore antes de escribir, y queda 100% offline-segura. Si
 * el registro ya estaba cerrado (alguien más ya registró la salida), la
 * propia regla de seguridad lo rechaza al sincronizar (no antes).
 */
export async function registerExit(spaceNumber, sessionId, entryAt) {
  const profile = getProfile();
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  const durationMinutes = elapsedMinutes(entryAt);

  const writes = [
    updateDoc(spaceRef, {
      status: "free",
      sessionId: null,
      visitorName: null,
      visitorId: null,
      plate: null,
      visitorPhone: null,
      isDemo: false,
      destinationType: null,
      destinationNumber: null,
      entryAt: null,
      entryGuardName: null,
      entryLobby: null,
      maxMinutesAtEntry: null,
      updatedAt: serverTimestamp(),
    }),
  ];
  if (sessionId) {
    writes.push(
      updateDoc(doc(db, "parking_sessions", sessionId), {
        status: "closed",
        exitAt: serverTimestamp(),
        exitGuardUid: profile.uid,
        exitGuardName: profile.name,
        exitLobby: profile.lobby || null,
        durationMinutes,
      }),
      setDoc(doc(db, "public_status", sessionId), { status: "closed", exitAt: serverTimestamp() }, { merge: true })
    );
  }
  // Todas juntas, esperadas UNA sola vez con settle() (ver nota en registerEntry).
  await settle(Promise.all(writes));

  logAudit("parking.exit", {
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
    visitorPhone: null,
    isDemo: false,
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
    await setDoc(doc(db, "public_status", sessionId), { status: "closed", exitAt: serverTimestamp() }, { merge: true });
  }

  await logAudit("parking.force_release", { targetCollection: "parking_spaces", targetId: spaceNumber, details: { note } });
  return { ok: true };
}

/** Solo administración: cambia el tipo de un espacio (visitante/discapacidad/deshabilitado). */
export async function updateSpaceType(spaceNumber, type) {
  await updateDoc(doc(db, "parking_spaces", spaceNumber), { type, updatedAt: serverTimestamp() });
  await logAudit("parking_space.update_type", { targetCollection: "parking_spaces", targetId: spaceNumber, details: { type } });
}

/**
 * Solo administración: agrega minutos extra al límite de un parqueo
 * ocupado (por ejemplo, el visitante pidió por WhatsApp más tiempo antes de
 * que se le acabara). Actualiza el espacio en vivo y su sesión abierta para
 * que quede consistente en el historial.
 */
export async function extendParkingTime(spaceNumber, additionalMinutes, note) {
  const spaceRef = doc(db, "parking_spaces", spaceNumber);
  const spaceSnap = await getDoc(spaceRef);
  if (!spaceSnap.exists()) throw new OperationError("Ese parqueo no existe.");
  const space = spaceSnap.data();
  if (space.status !== "occupied") {
    throw new OperationError("Ese parqueo no está ocupado actualmente, no hay nada que extender.");
  }
  const newMax = (space.maxMinutesAtEntry || 0) + additionalMinutes;

  await updateDoc(spaceRef, { maxMinutesAtEntry: newMax, updatedAt: serverTimestamp() });
  if (space.sessionId) {
    await updateDoc(doc(db, "parking_sessions", space.sessionId), {
      maxMinutesAtEntry: newMax,
      corrected: true,
      correctionNote: note || `Tiempo extendido +${additionalMinutes} min por administración.`,
    });
    await setDoc(
      doc(db, "public_status", space.sessionId),
      { maxMinutesAtEntry: newMax, extendedMinutes: newMax - maxMinutesForDestination(space.destinationType), status: "open", exitAt: null },
      { merge: true }
    );
  }

  await logAudit("parking.extend_time", {
    targetCollection: "parking_spaces",
    targetId: spaceNumber,
    details: { additionalMinutes, newMax },
  });
  return { ok: true, newMax };
}

/** Historial con filtros — consulta bajo demanda (no listener). `from`/`to` son objetos Date opcionales. */
export async function fetchParkingHistory({ max = 50, from = null, to = null } = {}) {
  const clauses = [where("status", "==", "closed")];
  if (from) clauses.push(where("entryAt", ">=", from));
  if (to) clauses.push(where("entryAt", "<=", to));
  const q = query(collection(db, "parking_sessions"), ...clauses, orderBy("entryAt", "desc"), fbLimit(max));
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
      visitorPhone: session.visitorPhone || "",
      destinationType: session.destinationType,
      destinationNumber: session.destinationNumber,
      entryAt: session.entryAt,
      entryGuardName: session.entryGuardName,
      entryLobby: session.entryLobby,
      maxMinutesAtEntry: session.maxMinutesAtEntry,
      updatedAt: serverTimestamp(),
    });

    tx.set(
      doc(db, "public_status", sessionId),
      { status: "open", exitAt: null, maxMinutesAtEntry: session.maxMinutesAtEntry, spaceNumber: session.spaceNumber, destinationType: session.destinationType },
      { merge: true }
    );
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
