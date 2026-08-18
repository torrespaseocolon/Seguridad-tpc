import { db } from "../firebase/firebase-init.js";
import {
  collection,
  addDoc,
  updateDoc,
  doc,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";

export const CONDITION_LABELS = { bueno: "Buen estado", danado: "Con daño / observación" };

/**
 * Objetos que un guardia encuentra en las áreas comunes (no confundir con el
 * catálogo de préstamo de src/services/objects.service.js — esto es
 * "lost & found", no tiene inventario ni disponibilidad). Al entregarlo,
 * deliverFoundItem() exige nombre y apartamento de quien lo retira: es la
 * bitácora que pidió administración para poder investigar una entrega
 * equivocada después.
 */
export async function createFoundItem({ description, foundLocation, condition, notes, isDemo = false }) {
  const profile = getProfile();
  const ref = await addDoc(collection(db, "found_items"), {
    description,
    foundLocation,
    condition,
    notes: notes || "",
    isDemo,
    status: "pending",
    createdAt: serverTimestamp(),
    createdByUid: profile.uid,
    createdByName: profile.name,
    lobby: profile.lobby || null,
    deliveredAt: null,
    deliveredByUid: null,
    deliveredByName: null,
    deliveredToName: null,
    deliveredToApartment: null,
  });
  await logAudit("found_item.create", { targetCollection: "found_items", targetId: ref.id, details: { description, foundLocation } });
  return ref.id;
}

/** Consulta bajo demanda (no listener) — se llama al abrir la pantalla o presionar "Actualizar". */
export async function fetchPendingFoundItems(max = 100) {
  const q = query(collection(db, "found_items"), where("status", "==", "pending"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deliverFoundItem(id, { recipientName, apartment }) {
  const profile = getProfile();
  await updateDoc(doc(db, "found_items", id), {
    status: "delivered",
    deliveredAt: serverTimestamp(),
    deliveredByUid: profile.uid,
    deliveredByName: profile.name,
    deliveredToName: recipientName,
    deliveredToApartment: apartment || "",
  });
  await logAudit("found_item.deliver", { targetCollection: "found_items", targetId: id, details: { recipientName, apartment } });
}

export async function fetchFoundItemHistory(max = 100, { from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("createdAt", ">=", from));
  if (to) clauses.push(where("createdAt", "<=", to));
  const q = query(collection(db, "found_items"), ...clauses, orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
