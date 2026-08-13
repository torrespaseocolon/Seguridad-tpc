import { db } from "../firebase/firebase-init.js";
import {
  collection,
  doc,
  updateDoc,
  serverTimestamp,
  orderBy,
  query,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";
import { logAudit } from "./audit.service.js";

export async function fetchUsers() {
  const q = query(collection(db, "users"), orderBy("name"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
}

export async function updateUser(uid, patch) {
  const profile = getProfile();
  await updateDoc(doc(db, "users", uid), { ...patch, updatedAt: serverTimestamp(), updatedBy: profile.uid });
  await logAudit("user.update", { targetCollection: "users", targetId: uid, details: patch });
}
