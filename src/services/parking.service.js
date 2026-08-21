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
import { getTimeRules } from "./settings.service.js";
import { elapsedMinutes } from "../utils/time.js";
import { isOnline } from "../utils/connectivity.js";
import { settle } from "../utils/offline-write.js";

// -----------------------------------------------------------------------
// Reglas de tiempo máximo por tipo de destino y máximo de parqueos
// simultáneos por apartamento/oficina: las configura administración desde
// Administración → Parqueos (ver settings.service.js: getTimeRules() lee un
// valor en caché, disponible de inmediato aunque no haya conexión).
// -----------------------------------------------------------------------
function maxMinutesForDestination(destinationType) {
  const rules = getTimeRules();
  return destinationType === "office" ? rules.maxMinutesOffice : rules.maxMinutesApartment;
}

// Si la app se está probando en una computadora local (localhost /
// 127.0.0.1 — típicamente con "python -m http.server"), el código QR NO
// puede apuntar a esa misma dirección: "localhost" en el celular de un
// visitante significa "el propio celular de esa persona", nunca la PC del
// guardia, así que nunca podría abrirlo. En ese caso se usa la dirección
// real ya publicada — funciona igual porque ambas leen y escriben la MISMA
// base de datos de Firebase, sin importar desde qué URL se generó el código.
const PRODUCTION_ORIGIN = "https://torrespaseocolon.github.io/Seguridad-tpc/";

/**
 * Dirección pública de consulta (sin iniciar sesión) para que el visitante
 * vea cuánto tiempo le queda escaneando su código QR. Se arma relativa a la
 * ubicación actual del sitio (salvo que sea una prueba local, ver arriba),
 * así que funciona igual en GitHub Pages o en cualquier otro lugar donde se
 * publique el proyecto.
 */
export function buildConsultaUrl(sessionId) {
  const isLocalTesting = ["localhost", "127.0.0.1"].includes(window.location.hostname);
  const base = isLocalTesting ? PRODUCTION_ORIGIN : window.location.href;
  return new URL(`consulta.html?id=${encodeURIComponent(sessionId)}`, base).href;
}

/**
 * Escucha en tiempo real los 13 espacios de parqueo. Es el ÚNICO listener
 * "permanente" de toda la aplicación, porque es la única pantalla donde
 * Lobby A y Lobby B necesitan verse coordinados al instante (requisito 23
 * y 72 del proyecto). Se cancela automáticamente al salir de la pantalla
 * de Parqueos (ver router.js).
 *
 * `d.data({ serverTimestamps: "estimate" })`: registerEntry() guarda
 * `entryAt` como serverTimestamp() (un "marcador" que Firestore reemplaza
 * por la hora real recién cuando el servidor confirma la escritura). Sin
 * esa opción, mientras no hay señal ese campo se ve `null` — el cronómetro
 * no tiene de dónde arrancar y el guardia no ve a qué hora entró el
 * vehículo. Con "estimate", Firestore usa el reloj del propio dispositivo
 * como hora provisional hasta que llegue la confirmación real del
 * servidor (que la reemplaza sola, sin que el guardia note el cambio).
 */
export function subscribeParkingSpaces(callback, onError) {
  const q = query(collection(db, "parking_spaces"), orderBy("number"));
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))),
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
  // parqueo a punto de vencerse sin tener que esperar horas reales.
  //
  // Se usa la hora del propio dispositivo (new Date()), NO serverTimestamp():
  // serverTimestamp() es un "marcador" que Firestore reemplaza recién cuando
  // el SERVIDOR recibe la escritura — si el guardia registró la entrada sin
  // señal y la conexión vuelve varios minutos después, ese marcador quedaría
  // con la hora en que volvió la señal, no la hora real en que entró el
  // vehículo, y el cronómetro "saltaría" de golpe cuando sincroniza. Con la
  // hora del dispositivo, el valor queda fijo desde el momento real del
  // registro y no cambia después, sincronice cuando sincronice.
  const entryAtValue = data.entryAtOverride instanceof Date ? data.entryAtOverride : new Date();

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
    const maxSimultaneous = getTimeRules().maxSimultaneousPerDestination;
    if (activeSnap && activeSnap.size >= maxSimultaneous) {
      throw new OperationError(
        `Ya hay ${maxSimultaneous} parqueos de visita en uso para este ${destinationType === "office" ? "local" : "apartamento"} (máximo permitido). Debe liberarse uno antes de registrar otro.`
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
      // vehicleKind: "car" — así consulta.js sabe, sin leer nada más, si el
      // botón "Registrar salida" debe usar registerExit (toca el espacio) o
      // registerMotoExit (no lo toca, ver nota de motos más abajo).
      setDoc(doc(db, "public_status", sessionRef.id), {
        spaceNumber,
        vehicleKind: "car",
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
  // Hora del dispositivo, no serverTimestamp() — mismo motivo que entryAt en
  // registerEntry: si no hay señal, no debe quedar la hora en que sincronizó
  // en vez de la hora real en que el guardia registró la salida.
  const exitAtValue = new Date();

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
        exitAt: exitAtValue,
        exitGuardUid: profile.uid,
        exitGuardName: profile.name,
        exitLobby: profile.lobby || null,
        durationMinutes,
      }),
      setDoc(doc(db, "public_status", sessionId), { status: "closed", exitAt: exitAtValue }, { merge: true })
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

// -----------------------------------------------------------------------
// Parqueo de motos: espacio 01, un solo espacio FÍSICO donde caben varias
// motos a la vez (hasta MOTO_SPACE_CAPACITY), cada una con su propio tiempo.
// A diferencia de un espacio normal (1 ocupante = los campos del propio
// documento parking_spaces/{numero}), acá el documento del espacio nunca se
// toca al entrar/salir una moto — cada moto es su propio registro en
// parking_sessions (igual que un carro), y lo que está "ocupado ahora" se ve
// en vivo simplemente contando cuántos de esos registros siguen abiertos
// para ese número de espacio (subscribeMotoSessions). Así varias motos
// pueden entrar y salir de forma independiente sin pisarse entre ellas.
// -----------------------------------------------------------------------
export const MOTO_SPACE_CAPACITY = 9;

/** Escucha en tiempo real las motos actualmente parqueadas (registros abiertos) en un espacio de motos. */
export function subscribeMotoSessions(spaceNumber, callback) {
  const q = query(
    collection(db, "parking_sessions"),
    where("status", "==", "open"),
    where("spaceNumber", "==", spaceNumber)
  );
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: "estimate" }) }))),
    (err) => console.error("[SEGURIDAD TPC] Error escuchando motos:", err)
  );
}

/** Igual que registerEntry, pero sin tocar parking_spaces (ver nota arriba) — la pantalla ya valida el cupo con subscribeMotoSessions antes de mostrar el botón. */
export async function registerMotoEntry(spaceNumber, data) {
  const profile = getProfile();
  const destinationType = data.destinationType;
  const destinationNumber = data.destinationNumber.trim();
  const maxMinutes = maxMinutesForDestination(destinationType);
  const entryAtValue = data.entryAtOverride instanceof Date ? data.entryAtOverride : new Date();

  if (isOnline()) {
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
    const maxSimultaneous = getTimeRules().maxSimultaneousPerDestination;
    if (activeSnap && activeSnap.size >= maxSimultaneous) {
      throw new OperationError(
        `Ya hay ${maxSimultaneous} parqueos de visita en uso para este ${destinationType === "office" ? "local" : "apartamento"} (máximo permitido). Debe liberarse uno antes de registrar otro.`
      );
    }
  }

  const sessionRef = doc(collection(db, "parking_sessions"));
  await settle(
    Promise.all([
      setDoc(sessionRef, {
        spaceNumber,
        vehicleKind: "moto",
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
      setDoc(doc(db, "public_status", sessionRef.id), {
        spaceNumber,
        vehicleKind: "moto",
        destinationType,
        entryAt: entryAtValue,
        maxMinutesAtEntry: maxMinutes,
        extendedMinutes: 0,
        status: "open",
        exitAt: null,
      }),
    ])
  );

  logAudit("parking.moto_entry", {
    targetCollection: "parking_sessions",
    targetId: sessionRef.id,
    details: { spaceNumber, plate: data.plate },
  });

  return { ok: true, sessionId: sessionRef.id, consultaUrl: buildConsultaUrl(sessionRef.id) };
}

/** Igual que registerExit, pero sin tocar parking_spaces (esa moto nunca fue dueña única del documento del espacio). */
export async function registerMotoExit(sessionId, entryAt) {
  const profile = getProfile();
  const durationMinutes = elapsedMinutes(entryAt);
  const exitAtValue = new Date();

  await settle(
    Promise.all([
      updateDoc(doc(db, "parking_sessions", sessionId), {
        status: "closed",
        exitAt: exitAtValue,
        exitGuardUid: profile.uid,
        exitGuardName: profile.name,
        exitLobby: profile.lobby || null,
        durationMinutes,
      }),
      setDoc(doc(db, "public_status", sessionId), { status: "closed", exitAt: exitAtValue }, { merge: true }),
    ])
  );

  logAudit("parking.moto_exit", { targetCollection: "parking_sessions", targetId: sessionId, details: { durationMinutes } });
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

/**
 * Solo administración: agrega un espacio de parqueo nuevo (por ejemplo, uno
 * de los 9 espacios individuales para motos, o cualquier otro que haga
 * falta) sin tener que tocar el código. `number` es el identificador único
 * del espacio (se usa tal cual como número de parqueo en toda la app).
 */
export async function addParkingSpace(number, type = "visitor") {
  const trimmed = (number || "").trim();
  if (!trimmed) throw new OperationError("Ingrese un número de parqueo.");
  const ref = doc(db, "parking_spaces", trimmed);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    throw new OperationError(`Ya existe un parqueo con el número "${trimmed}".`);
  }
  await setDoc(ref, {
    number: trimmed,
    type,
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
  await logAudit("parking_space.create", { targetCollection: "parking_spaces", targetId: trimmed, details: { type } });
  return { ok: true };
}

/**
 * Solo administración: cierra TODOS los registros de parqueo que sigan
 * "abiertos" para un apartamento/oficina exacto (por ejemplo, para destrabar
 * la Demostración cuando el límite de simultáneos ya está copado por
 * registros viejos de prueba — ver demo.tab.js). Si el registro todavía es
 * el que ocupa su espacio, usa el flujo normal de salida (registerExit, deja
 * todo consistente); si el espacio ya cambió de mano o ya está libre (un
 * registro "huérfano" que quedó abierto por alguna falla anterior), solo
 * cierra el registro en sí, sin tocar el espacio de nadie más.
 */
export async function closeOpenSessionsForDestination(destinationType, destinationNumber, note) {
  const openSnap = await getDocs(
    query(
      collection(db, "parking_sessions"),
      where("status", "==", "open"),
      where("destinationType", "==", destinationType),
      where("destinationNumber", "==", destinationNumber)
    )
  );

  const closed = [];
  for (const d of openSnap.docs) {
    const session = d.data();
    const spaceSnap = await getDoc(doc(db, "parking_spaces", session.spaceNumber));
    const space = spaceSnap.exists() ? spaceSnap.data() : null;
    if (space && space.sessionId === d.id) {
      await registerExit(session.spaceNumber, d.id, session.entryAt);
    } else {
      const exitAtValue = new Date();
      await updateDoc(doc(db, "parking_sessions", d.id), {
        status: "closed",
        exitAt: exitAtValue,
        corrected: true,
        correctionNote: note || "Cerrado automáticamente por administración (registro sin espacio ocupado).",
      });
      await setDoc(doc(db, "public_status", d.id), { status: "closed", exitAt: exitAtValue }, { merge: true });
    }
    closed.push({ sessionId: d.id, visitorName: session.visitorName, plate: session.plate });
  }

  if (closed.length) {
    await logAudit("parking.close_destination_sessions", {
      targetCollection: "parking_sessions",
      details: { destinationType, destinationNumber, count: closed.length, note },
    });
  }
  return closed;
}

export { OperationError };
