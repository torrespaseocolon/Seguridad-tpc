import { db } from "../firebase/firebase-init.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  limit,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { getProfile } from "./auth.service.js";

/**
 * Registra una acción en audit_logs. Se llama después de cada operación
 * importante (entrada, salida, entrega, préstamo, corrección, cambios de
 * administración). Es una escritura adicional pequeña — el costo está
 * explicado en docs/MODELO_DE_DATOS.md.
 */
export async function logAudit(action, { targetCollection = null, targetId = null, details = {} } = {}) {
  const profile = getProfile();
  if (!profile) return;
  try {
    await addDoc(collection(db, "audit_logs"), {
      userUid: profile.uid,
      userName: profile.name,
      userRole: profile.role,
      action,
      targetCollection,
      targetId,
      details,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // La auditoría nunca debe bloquear la operación principal del guardia;
    // si falla, solo se registra en consola para diagnóstico.
    console.error("[SEGURIDAD TPC] No se pudo registrar auditoría:", err);
  }
}

/** Solo para administración: últimos N eventos de auditoría, bajo demanda (no listener). */
export async function fetchRecentAudit(max = 100) {
  const q = query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(max));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
