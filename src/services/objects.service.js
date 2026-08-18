import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";

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
  const ref = await addDoc(collection(db, "objects"), {
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
  });
  await logAudit("object.create", { targetCollection: "objects", targetId: ref.id, details: { name, quantity, lobby } });
  return ref.id;
}

export async function updateObject(id, patch) {
  const profile = getProfile();
  await updateDoc(doc(db, "objects", id), { ...patch, updatedAt: serverTimestamp(), updatedBy: profile.uid });
  await logAudit("object.update", { targetCollection: "objects", targetId: id, details: patch });
}

export async function setObjectActive(id, active) {
  await updateObject(id, { active });
}

export async function deleteObject(id, name) {
  await deleteDoc(doc(db, "objects", id));
  await logAudit("object.delete", { targetCollection: "objects", targetId: id, details: { name } });
}

/**
 * Antes usaba runTransaction para bajar availableQuantity de forma segura
 * (evitar que dos guardias presten la última unidad al mismo tiempo). Las
 * transacciones de Firestore NO se pueden ejecutar sin conexión — necesitan
 * ida y vuelta al servidor — así que bloqueaban por completo el préstamo de
 * objetos offline. Ahora que cada objeto pertenece a un solo lobby y solo el
 * guardia de ESE lobby lo presta (ver fetchActiveObjects), el riesgo real de
 * un choque es mínimo: se acepta ese riesgo pequeño (corregible a mano por
 * un admin revisando availableQuantity) a cambio de poder prestar objetos
 * sin señal — igual que ya funciona Paquetes y Tarjetas.
 */
export async function loanObject({ objectId, objectName, borrowerType, borrowerName, apartment, notes, isDemo = false }) {
  const profile = getProfile();
  const objectRef = doc(db, "objects", objectId);
  const loanRef = doc(collection(db, "object_loans"));

  const objSnap = await getDoc(objectRef);
  if (!objSnap.exists() || objSnap.data().active !== true) {
    throw new OperationError("Este objeto ya no está disponible.");
  }
  const available = objSnap.data().availableQuantity;
  if (available <= 0) {
    throw new OperationError("No hay unidades disponibles de este objeto en este momento.");
  }

  await setDoc(loanRef, {
    objectId,
    objectName,
    borrowerType,
    borrowerName,
    apartment: apartment || "",
    notes: notes || "",
    isDemo,
    status: "loaned",
    loanedAt: serverTimestamp(),
    loanedByUid: profile.uid,
    loanedByName: profile.name,
    lobby: profile.lobby || null,
    returnedAt: null,
    returnedByUid: null,
    returnedByName: null,
    returnObservations: "",
    returnCondition: "",
  });
  await updateDoc(objectRef, { availableQuantity: available - 1 });

  await logAudit("object.loan", { targetCollection: "object_loans", targetId: loanRef.id, details: { objectId, borrowerName } });
  return loanRef.id;
}

export async function fetchActiveLoans() {
  const q = query(collection(db, "object_loans"), where("status", "==", "loaned"), orderBy("loanedAt", "desc"), fbLimit(100));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function returnObject(loanId, { returnObservations, returnCondition }) {
  const profile = getProfile();
  const loanRef = doc(db, "object_loans", loanId);

  const loanSnap = await getDoc(loanRef);
  if (!loanSnap.exists() || loanSnap.data().status !== "loaned") {
    throw new OperationError("Este préstamo ya fue devuelto.");
  }

  await updateDoc(loanRef, {
    status: "returned",
    returnedAt: serverTimestamp(),
    returnedByUid: profile.uid,
    returnedByName: profile.name,
    returnObservations: returnObservations || "",
    returnCondition: returnCondition || "bueno",
  });

  const objectRef = doc(db, "objects", loanSnap.data().objectId);
  const objSnap = await getDoc(objectRef);
  if (objSnap.exists()) {
    const available = objSnap.data().availableQuantity;
    const total = objSnap.data().totalQuantity;
    await updateDoc(objectRef, { availableQuantity: Math.min(available + 1, total) });
  }

  await logAudit("object.return", { targetCollection: "object_loans", targetId: loanId, details: { returnCondition } });
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
