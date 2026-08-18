import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  runTransaction,
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

export async function fetchActiveObjects() {
  const q = query(collection(db, "objects"), where("active", "==", true), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchAllObjects() {
  const q = query(collection(db, "objects"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function createObject({ name, category, identifier, quantity, description, isDemo = false }) {
  const profile = getProfile();
  const ref = await addDoc(collection(db, "objects"), {
    name,
    category: category || "",
    identifier: identifier || "",
    description: description || "",
    totalQuantity: quantity,
    availableQuantity: quantity,
    active: true,
    isDemo,
    createdAt: serverTimestamp(),
    createdBy: profile.uid,
    updatedAt: serverTimestamp(),
    updatedBy: profile.uid,
  });
  await logAudit("object.create", { targetCollection: "objects", targetId: ref.id, details: { name, quantity } });
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

export async function loanObject({ objectId, objectName, borrowerType, borrowerName, apartment, notes, isDemo = false }) {
  const profile = getProfile();
  const objectRef = doc(db, "objects", objectId);
  const loanRef = doc(collection(db, "object_loans"));

  await runTransaction(db, async (tx) => {
    const objSnap = await tx.get(objectRef);
    if (!objSnap.exists() || objSnap.data().active !== true) {
      throw new OperationError("Este objeto ya no está disponible.");
    }
    const available = objSnap.data().availableQuantity;
    if (available <= 0) {
      throw new OperationError("No hay unidades disponibles de este objeto en este momento.");
    }
    tx.set(loanRef, {
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
    tx.update(objectRef, { availableQuantity: available - 1 });
  });

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

  await runTransaction(db, async (tx) => {
    const loanSnap = await tx.get(loanRef);
    if (!loanSnap.exists() || loanSnap.data().status !== "loaned") {
      throw new OperationError("Este préstamo ya fue devuelto.");
    }
    const objectRef = doc(db, "objects", loanSnap.data().objectId);
    const objSnap = await tx.get(objectRef);

    tx.update(loanRef, {
      status: "returned",
      returnedAt: serverTimestamp(),
      returnedByUid: profile.uid,
      returnedByName: profile.name,
      returnObservations: returnObservations || "",
      returnCondition: returnCondition || "bueno",
    });

    if (objSnap.exists()) {
      const available = objSnap.data().availableQuantity;
      const total = objSnap.data().totalQuantity;
      tx.update(objectRef, { availableQuantity: Math.min(available + 1, total) });
    }
  });

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
