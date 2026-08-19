import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  increment,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";
import { settle } from "../utils/offline-write.js";

class OperationError extends Error {}

/**
 * Cada objeto pertenece a un solo lobby (ago-2026: antes el catálogo era
 * compartido; ahora un guardia de Lobby A no puede prestar objetos que
 * pertenecen al inventario de Lobby B, y viceversa — cada lobby maneja su
 * propio inventario). `lobby` es opcional aquí SOLO para que el catálogo
 * completo de administración (fetchAllObjects) pueda mostrar todo sin
 * filtrar; los guardias sí deben pasar su propio lobby.
 */
export async function fetchActiveObjects(lobby = null) {
  const clauses = [where("active", "==", true)];
  if (lobby) clauses.push(where("lobby", "==", lobby));
  const q = query(collection(db, "objects"), ...clauses, orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAllObjects() {
  const q = query(collection(db, "objects"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createObject({ name, category, identifier, quantity, description, lobby, isDemo = false }) {
  const profile = getProfile();
  const ref = doc(collection(db, "objects"));
  await settle(
    setDoc(ref, {
      name,
      category: category || "",
      identifier: identifier || "",
      description: description || "",
      lobby,
      totalQuantity: quantity,
      availableQuantity: quantity,
      active: true,
      isDemo,
      createdAt: serverTimestamp(),
      createdBy: profile.uid,
      updatedAt: serverTimestamp(),
      updatedBy: profile.uid,
    })
  );
  logAudit("object.create", { targetCollection: "objects", targetId: ref.id, details: { name, quantity, lobby } });
  return ref.id;
}

export async function updateObject(id, patch) {
  const profile = getProfile();
  await settle(updateDoc(doc(db, "objects", id), { ...patch, updatedAt: serverTimestamp(), updatedBy: profile.uid }));
  logAudit("object.update", { targetCollection: "objects", targetId: id, details: patch });
}

export async function setObjectActive(id, active) {
  await updateObject(id, { active });
}

export async function deleteObject(id, name) {
  await settle(deleteDoc(doc(db, "objects", id)));
  logAudit("object.delete", { targetCollection: "objects", targetId: id, details: { name } });
}

/**
 * Antes usaba runTransaction, y luego (ago-2026) pasó a leer el objeto con
 * getDoc antes de prestar. Pero getDoc puede quedarse esperando mucho tiempo
 * una respuesta si la señal se corta de golpe (no offline "prolijo"), y eso
 * dejaba el botón "GUARDANDO..." colgado sin terminar nunca. Ahora no se lee
 * nada: se usa increment(-1), un contador atómico de Firestore que no
 * necesita saber el valor actual para aplicarse (funciona igual online y
 * offline, se sincroniza solo). Se confía en que la pantalla de Objetos solo
 * deja tocar "PRESTAR" en algo que ya se veía disponible al cargar la lista.
 * Cada objeto pertenece a un solo lobby y solo el guardia de ESE lobby lo
 * presta (ver fetchActiveObjects), así que el riesgo de choque es mínimo —
 * corregible a mano por un admin revisando availableQuantity si llegara a
 * pasar.
 */
export async function loanObject({ objectId, objectName, borrowerType, borrowerName, apartment, notes, isDemo = false }) {
  const profile = getProfile();
  const objectRef = doc(db, "objects", objectId);
  const loanRef = doc(collection(db, "object_loans"));

  // Las 2 escrituras son independientes, se disparan juntas y se esperan
  // UNA sola vez con settle() (ver nota igual en parking.service.js).
  await settle(
    Promise.all([
      setDoc(loanRef, {
        objectId,
        objectName,
        borrowerType,
        borrowerName,
        apartment: apartment || "",
        notes: notes || "",
        isDemo,
        status: "loaned",
        // Hora del dispositivo, no serverTimestamp() — ver nota en
        // parking.service.js: si se presta sin señal, evita que la hora
        // quede fijada recién cuando sincroniza en vez de cuando pasó de verdad.
        loanedAt: new Date(),
        loanedByUid: profile.uid,
        loanedByName: profile.name,
        lobby: profile.lobby || null,
        returnedAt: null,
        returnedByUid: null,
        returnedByName: null,
        returnObservations: "",
        returnCondition: "",
      }),
      updateDoc(objectRef, { availableQuantity: increment(-1) }),
    ])
  );

  logAudit("object.loan", { targetCollection: "object_loans", targetId: loanRef.id, details: { objectId, borrowerName } });
  return loanRef.id;
}

export async function fetchActiveLoans() {
  const q = query(collection(db, "object_loans"), where("status", "==", "loaned"), orderBy("loanedAt", "desc"), fbLimit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * objectId lo recibe de quien llama (la tarjeta del préstamo, que ya tiene
 * todos sus campos en pantalla) — así tampoco hace falta leer el préstamo
 * de Firestore antes de devolver. Ya no se limita availableQuantity contra
 * totalQuantity (ese tope necesitaba leer el objeto primero); si algún día
 * quedara por encima del total por un caso raro, se corrige a mano.
 */
export async function returnObject(loanId, { objectId, returnObservations, returnCondition }) {
  const profile = getProfile();

  const writes = [
    updateDoc(doc(db, "object_loans", loanId), {
      status: "returned",
      returnedAt: new Date(),
      returnedByUid: profile.uid,
      returnedByName: profile.name,
      returnObservations: returnObservations || "",
      returnCondition: returnCondition || "bueno",
    }),
  ];
  if (objectId) {
    writes.push(updateDoc(doc(db, "objects", objectId), { availableQuantity: increment(1) }));
  }
  await settle(Promise.all(writes));

  logAudit("object.return", { targetCollection: "object_loans", targetId: loanId, details: { returnCondition } });
}

export async function fetchLoanHistory(max = 100, { from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("loanedAt", ">=", from));
  if (to) clauses.push(where("loanedAt", "<=", to));
  const q = query(collection(db, "object_loans"), ...clauses, orderBy("loanedAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export { OperationError };
