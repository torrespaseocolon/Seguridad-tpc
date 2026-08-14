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

const TYPE_LABELS = { card: "Tarjeta de acceso", sticker: "Sticker vehicular", other: "Otro" };
export { TYPE_LABELS };

export async function createAccessItem({ type, recipientName, apartment, tower, dropLobby, notes }) {
  const profile = getProfile();
  const ref = await addDoc(collection(db, "access_items"), {
    type,
    recipientName,
    apartment,
    tower: tower || "",
    dropLobby,
    notes: notes || "",
    status: "pending",
    createdAt: serverTimestamp(),
    createdByUid: profile.uid,
    createdByName: profile.name,
    deliveredAt: null,
    deliveredByUid: null,
    deliveredByName: null,
    deliveredLobby: null,
  });
  await logAudit("access_item.create", { targetCollection: "access_items", targetId: ref.id, details: { type, recipientName } });
  return ref.id;
}

export async function fetchPendingAccessItems(max = 100) {
  const q = query(collection(db, "access_items"), where("status", "==", "pending"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function deliverAccessItem(id) {
  const profile = getProfile();
  await updateDoc(doc(db, "access_items", id), {
    status: "delivered",
    deliveredAt: serverTimestamp(),
    deliveredByUid: profile.uid,
    deliveredByName: profile.name,
    deliveredLobby: profile.lobby || null,
  });
  await logAudit("access_item.deliver", { targetCollection: "access_items", targetId: id });
}

export async function fetchAccessItemHistory(max = 100, { from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("createdAt", ">=", from));
  if (to) clauses.push(where("createdAt", "<=", to));
  const q = query(collection(db, "access_items"), ...clauses, orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
