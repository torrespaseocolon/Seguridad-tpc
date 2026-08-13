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

export async function createErrorReport({ description, relatedCollection, relatedId }) {
  const profile = getProfile();
  const ref = await addDoc(collection(db, "error_reports"), {
    reportedByUid: profile.uid,
    reportedByName: profile.name,
    lobby: profile.lobby || null,
    relatedCollection: relatedCollection || "",
    relatedId: relatedId || "",
    description,
    status: "open",
    createdAt: serverTimestamp(),
    resolvedByUid: null,
    resolvedByName: null,
    resolvedAt: null,
    resolutionNotes: "",
  });
  await logAudit("error_report.create", { targetCollection: "error_reports", targetId: ref.id });
  return ref.id;
}

export async function fetchMyReports(max = 30) {
  const profile = getProfile();
  const q = query(
    collection(db, "error_reports"),
    where("reportedByUid", "==", profile.uid),
    orderBy("createdAt", "desc"),
    fbLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function fetchOpenReports(max = 100) {
  const q = query(collection(db, "error_reports"), where("status", "==", "open"), orderBy("createdAt", "desc"), fbLimit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function resolveErrorReport(id, resolutionNotes) {
  const profile = getProfile();
  await updateDoc(doc(db, "error_reports", id), {
    status: "resolved",
    resolvedByUid: profile.uid,
    resolvedByName: profile.name,
    resolvedAt: serverTimestamp(),
    resolutionNotes: resolutionNotes || "",
  });
  await logAudit("error_report.resolve", { targetCollection: "error_reports", targetId: id });
}
