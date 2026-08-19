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

export async function createPackage({ apartment, recipientName, courier, trackingNumber, notes, isDemo = false }) {
  const profile = getProfile();
  const ref = await addDoc(collection(db, "packages"), {
    apartment,
    recipientName,
    courier,
    trackingNumber: trackingNumber || "",
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
  await logAudit("package.create", { targetCollection: "packages", targetId: ref.id, details: { apartment, courier } });
  return ref.id;
}

/** Consulta bajo demanda (no listener) — se llama al abrir la pantalla o presionar "Actualizar". */
export async function fetchPendingPackages(max = 100) {
  const q = query(collection(db, "packages"), where("status", "==", "pending"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** recipientName/apartment: bitácora de quién retiró el paquete (ver nota igual en found-items.service.js). */
export async function deliverPackage(id, { recipientName, apartment } = {}) {
  const profile = getProfile();
  await updateDoc(doc(db, "packages", id), {
    status: "delivered",
    deliveredAt: serverTimestamp(),
    deliveredByUid: profile.uid,
    deliveredByName: profile.name,
    deliveredToName: recipientName || null,
    deliveredToApartment: apartment || "",
  });
  await logAudit("package.deliver", { targetCollection: "packages", targetId: id, details: { recipientName, apartment } });
}

export async function fetchPackageHistory(max = 100, { from = null, to = null } = {}) {
  const clauses = [];
  if (from) clauses.push(where("createdAt", ">=", from));
  if (to) clauses.push(where("createdAt", "<=", to));
  const q = query(collection(db, "packages"), ...clauses, orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
