import { db } from "../firebase/firebase-init.js";
import {
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";
import { settle } from "../utils/offline-write.js";

const TYPE_LABELS = { card: "Tarjeta de acceso", sticker: "Sticker vehicular", other: "Otro" };
export { TYPE_LABELS };

export async function createAccessItem({ type, recipientName, apartment, tower, dropLobby, notes, isDemo = false }) {
  const profile = getProfile();
  const ref = doc(collection(db, "access_items"));
  await settle(
    setDoc(ref, {
      type,
      recipientName,
      apartment,
      tower: tower || "",
      dropLobby,
      notes: notes || "",
      isDemo,
      status: "pending",
      createdAt: new Date(), // hora del dispositivo, no serverTimestamp() — ver nota en parking.service.js
      createdByUid: profile.uid,
      createdByName: profile.name,
      deliveredAt: null,
      deliveredByUid: null,
      deliveredByName: null,
      deliveredLobby: null,
    })
  );
  logAudit("access_item.create", { targetCollection: "access_items", targetId: ref.id, details: { type, recipientName } });
  return ref.id;
}

export async function fetchPendingAccessItems(max = 100) {
  const q = query(collection(db, "access_items"), where("status", "==", "pending"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deliverAccessItem(id) {
  const profile = getProfile();
  await settle(
    updateDoc(doc(db, "access_items", id), {
      status: "delivered",
      deliveredAt: new Date(),
      deliveredByUid: profile.uid,
      deliveredByName: profile.name,
      deliveredLobby: profile.lobby || null,
    })
  );
  logAudit("access_item.deliver", { targetCollection: "access_items", targetId: id });
}

export async function updateAccessItem(id, patch) {
  const profile = getProfile();
  await settle(updateDoc(doc(db, "access_items", id), { ...patch, updatedAt: new Date(), updatedByUid: profile.uid }));
  logAudit("access_item.update", { targetCollection: "access_items", targetId: id, details: patch });
}

/**
 * Requiere que firestore.rules permita borrar access_items reales (no solo
 * isDemo:true) — ver la nota del mismo cambio en firestore.rules. Antes de
 * este cambio, un admin no podía borrar una tarjeta/sticker real por
 * diseño (solo desactivarla no era una opción disponible, y el historial
 * quedaba fijo para siempre); ahora sí puede, a pedido explícito de
 * administración.
 */
export async function deleteAccessItem(id, name) {
  await deleteDoc(doc(db, "access_items", id));
  await logAudit("access_item.delete", { targetCollection: "access_items", targetId: id, details: { name } });
}

export async function fetchAccessItemHistory(max = 100, { from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("createdAt", ">=", from));
  if (to) clauses.push(where("createdAt", "<=", to));
  const q = query(collection(db, "access_items"), ...clauses, orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
