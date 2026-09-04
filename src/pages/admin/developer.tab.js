// Pestaña de Desarrollador — solo la ve el usuario marcado con
// isDeveloper:true (ver users.tab.js). IMPORTANTE: esto es una comodidad
// visual, no una barrera de seguridad nueva — todo lo que se lee/escribe
// acá ya lo puede leer/escribir cualquier administrador según
// firestore.rules (settings, audit_logs, y las demás colecciones). El
// campo isDeveloper solo decide si el MENÚ aparece, no agrega permisos que
// un admin no tuviera ya.
import { el, clear, toast, loadingState, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { db } from "../../firebase/firebase-init.js";
import {
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  getDocs,
  getCountFromServer,
  deleteDoc,
  updateDoc,
  doc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { fetchRecentAudit, logAudit } from "../../services/audit.service.js";
import { getSettings, updateSettings } from "../../services/settings.service.js";
import { isOnline } from "../../utils/connectivity.js";
import { formatDateTime } from "../../utils/time.js";
import { friendlyError } from "../../utils/errors.js";
import { firebaseConfig } from "../../firebase/firebase-config.js";

// Mantener igual al CACHE_NAME de service-worker.js — no hay forma de leerlo
// automáticamente desde acá (son dos archivos totalmente separados), así que
// hay que actualizar esta línea a mano cuando se suba una versión nueva.
const APP_VERSION = "seguridad-tpc-v59";

// public_status queda afuera a propósito: firestore.rules bloquea "list" en
// esa colección sin excepción (ni siquiera para administración) — solo se
// puede leer un documento puntual si ya se sabe su ID (ver la nota en
// firestore.rules), así que ni el conteo ni el respaldo pueden traerla
// completa. No es una pérdida real: es un espejo sin datos personales de
// parking_sessions, que sí está incluida abajo con todo el detalle.
const BACKUP_COLLECTIONS = [
  "parking_spaces",
  "parking_sessions",
  "visits",
  "packages",
  "objects",
  "object_loans",
  "access_items",
  "found_items",
  "users",
  "audit_logs",
  "error_reports",
  "settings",
  "offices",
];

// Colecciones que "Reiniciar datos del sistema" borra por completo. users y
// settings quedan siempre afuera a propósito — eso no es "historial
// operativo", es la configuración de cuentas y reglas del sistema en sí.
// public_status NO está en esta lista: firestore.rules bloquea "list" ahí
// sin excepción (ver nota en BACKUP_COLLECTIONS más arriba) — se borra
// aparte, un documento a la vez por su ID (eso sí está permitido), usando
// los mismos ID que parking_sessions (se crean siempre en pareja).
const WIPE_COLLECTIONS = [
  "parking_sessions",
  "visits",
  "packages",
  "access_items",
  "found_items",
  "object_loans",
  "objects",
  "audit_logs",
  "error_reports",
];

// Aviso informativo cuando una colección supera esta cantidad de documentos
// — NO es un límite real de Firestore (que es por espacio ocupado, ~1 GB en
// el plan gratis, no por cantidad de documentos), es solo una señal para
// considerar usar la depuración manual de abajo. Con datos de solo texto
// como estos (sin fotos), falta mucho para llegar al límite real de
// espacio — este número es fácil de ajustar acá si hace falta.
const COUNT_WARNING_THRESHOLD = 5000;

/**
 * Colecciones con historial que puede crecer sin límite, purgables por
 * fecha desde "Depuración manual" más abajo. Cada una define cómo
 * identificar un documento TODAVÍA ACTIVO (`isActive`) — esos nunca se
 * borran sin importar qué tan viejos sean, aunque queden antes de la fecha
 * de corte elegida. `objects` (el catálogo en sí, no los préstamos) queda
 * afuera a propósito: no es historial, es una lista de referencia que no
 * crece con el uso diario.
 */
const PURGE_TARGETS = [
  { name: "parking_sessions", label: "Parqueos", dateField: "entryAt", isActive: (d) => d.status === "open" },
  { name: "visits", label: "Visitantes", dateField: "createdAt", isActive: (d) => d.needsParking === true && !d.exitAt },
  { name: "packages", label: "Paquetes", dateField: "createdAt", isActive: (d) => d.status === "pending" },
  { name: "access_items", label: "Tarjetas/Stickers", dateField: "createdAt", isActive: (d) => d.status === "pending" },
  { name: "found_items", label: "Objetos encontrados", dateField: "createdAt", isActive: (d) => d.status === "pending" },
  { name: "object_loans", label: "Préstamos", dateField: "loanedAt", isActive: (d) => d.status === "loaned" },
  { name: "audit_logs", label: "Auditoría", dateField: "createdAt", isActive: () => false },
  { name: "error_reports", label: "Reportes de error", dateField: "createdAt", isActive: (d) => d.status === "open" },
];

/** El documento más viejo (según su campo de fecha) de cada colección purgable — 1 lectura chica por colección. */
async function fetchOldestDates() {
  const results = {};
  for (const target of PURGE_TARGETS) {
    const snap = await getDocs(query(collection(db, target.name), orderBy(target.dateField, "asc"), fbLimit(1)));
    results[target.name] = snap.empty ? null : snap.docs[0].data()[target.dateField];
  }
  return results;
}

/**
 * Trae, por cada colección purgable, los documentos anteriores a `cutoff`
 * que YA NO están activos — una sola condición por consulta (rango de
 * fecha), sin índice compuesto, filtrando "activo" en el navegador después
 * (mismo patrón que fetchFrequentVisitorAlerts en parking.service.js).
 */
async function previewPurge(cutoff) {
  const results = [];
  for (const target of PURGE_TARGETS) {
    const snap = await getDocs(query(collection(db, target.name), where(target.dateField, "<", cutoff)));
    const purgeableDocs = snap.docs.filter((d) => !target.isActive(d.data()));
    results.push({ ...target, docs: purgeableDocs });
  }
  return results;
}

/** Borra exactamente lo que previewPurge() ya identificó — no vuelve a consultar nada, para no borrar algo distinto a lo que el admin confirmó ver. */
async function executePurge(preview, cutoff, log) {
  for (const target of preview) {
    for (const d of target.docs) {
      await deleteDoc(doc(db, target.name, d.id));
      if (target.name === "parking_sessions") {
        // Puede que ya no exista (ver nota de public_status en wipeAllData) — no es un error si falla.
        await deleteDoc(doc(db, "public_status", d.id)).catch(() => {});
      }
    }
    log(`${target.label}: ${target.docs.length} documento(s) eliminado(s).`);
  }
  await logAudit("system.purge_old_records", {
    details: { cutoff: cutoff.toISOString(), counts: preview.map((t) => ({ name: t.name, count: t.docs.length })) },
  });
}

export async function renderDeveloperTab(root) {
  clear(root);
  root.appendChild(loadingState("Cargando panel de desarrollador..."));

  try {
    const [counts, oldestDates, recentAudit, settings] = await Promise.all([
      Promise.all(BACKUP_COLLECTIONS.map((name) => getCountFromServer(collection(db, name)))),
      fetchOldestDates(),
      fetchRecentAudit(300),
      getSettings(true),
    ]);

    clear(root);
    root.appendChild(appInfoCard(settings));
    root.appendChild(countsCard(counts));
    root.appendChild(oldestRecordsCard(oldestDates));
    root.appendChild(backupCard());
    root.appendChild(purgeCard());
    root.appendChild(resetDataCard(root));
    root.appendChild(auditCard(recentAudit));
    root.appendChild(settingsEditorCard(settings));
    root.appendChild(linksCard());
  } catch (err) {
    clear(root);
    root.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
  }
}

function sectionTitle(iconName, text) {
  return el("div", { class: "card__title row" }, [icon(iconName, { size: 18 }), text]);
}

function appInfoCard(settings) {
  return el("div", { class: "card mb-md" }, [
    sectionTitle("info", "Estado de la aplicación"),
    el("div", { class: "stack", style: "gap:6px;" }, [
      infoRow("Versión publicada", APP_VERSION),
      infoRow("Conexión ahora mismo", isOnline() ? "En línea" : "Sin conexión"),
      infoRow("Sistema inicializado", settings?.initialized ? "Sí" : "No"),
      infoRow("Última configuración guardada", settings?.updatedAt ? formatDateTime(settings.updatedAt) : "—"),
    ]),
  ]);
}

function infoRow(label, value) {
  return el("div", { class: "row row--between" }, [
    el("span", { class: "text-secondary" }, label),
    el("strong", {}, value),
  ]);
}

function countsCard(counts) {
  return el("div", { class: "card mb-md" }, [
    sectionTitle("activity", "Cantidad de documentos por colección"),
    el(
      "div",
      { class: "stack", style: "gap:6px;" },
      BACKUP_COLLECTIONS.map((name, i) => {
        const count = counts[i].data().count;
        const isHigh = count >= COUNT_WARNING_THRESHOLD;
        return el("div", { class: "row row--between" }, [
          el("span", { class: "text-secondary" }, name),
          el("strong", { style: isHigh ? "color:var(--color-danger);" : "" }, isHigh ? `${count} ⚠` : String(count)),
        ]);
      })
    ),
    el(
      "div",
      { class: "form-hint mt-md" },
      `El ⚠ es un aviso informativo (más de ${COUNT_WARNING_THRESHOLD.toLocaleString("es-CR")} documentos), no un límite real de Firestore — solo una señal para considerar usar la "Depuración manual" de abajo.`
    ),
  ]);
}

/** Desde qué fecha hay historial disponible en cada pestaña — responde directo "qué margen de consulta tengo para un incidente futuro". */
function oldestRecordsCard(oldestDates) {
  return el("div", { class: "card mb-md" }, [
    sectionTitle("info", "Dato más viejo guardado, por pestaña"),
    el(
      "div",
      { class: "stack", style: "gap:6px;" },
      PURGE_TARGETS.map((t) => infoRow(t.label, oldestDates[t.name] ? formatDateTime(oldestDates[t.name]) : "Sin registros"))
    ),
  ]);
}

function backupCard() {
  const downloadBtn = el("button", { class: "btn btn--secondary btn--block" }, [icon("download", { size: 18 }), " DESCARGAR RESPALDO (JSON)"]);
  downloadBtn.addEventListener("click", async () => {
    downloadBtn.disabled = true;
    downloadBtn.textContent = "PREPARANDO...";
    try {
      const backup = {};
      for (const name of BACKUP_COLLECTIONS) {
        const snap = await getDocs(collection(db, name));
        backup[name] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `respaldo-seguridad-tpc-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast("Respaldo descargado.", "success");
    } catch (err) {
      toast(friendlyError(err), "danger");
    }
    downloadBtn.disabled = false;
    clear(downloadBtn);
    downloadBtn.appendChild(icon("download", { size: 18 }));
    downloadBtn.append(" DESCARGAR RESPALDO (JSON)");
  });

  return el("div", { class: "card mb-md" }, [
    sectionTitle("download", "Respaldo manual"),
    el(
      "div",
      { class: "text-secondary mb-md" },
      "Descarga TODA la base de datos actual (todas las pestañas: parqueos, visitantes, paquetes, tarjetas, objetos, préstamos, auditoría...) en un solo archivo .json, tal como está en este momento. Usalo antes de la depuración de abajo si querés conservar una copia de lo que se va a borrar."
    ),
    downloadBtn,
  ]);
}

/**
 * Borra registros ya CERRADOS/ENTREGADOS/DEVUELTOS anteriores a una fecha
 * elegida — a diferencia de "Reiniciar datos del sistema" (que borra TODO
 * sin excepción), esto nunca toca lo que sigue activo ahora mismo (ver
 * PURGE_TARGETS más arriba), sin importar su antigüedad. Primero muestra
 * una vista previa (previewPurge) y solo borra lo que el admin ya vio y
 * confirmó — nunca vuelve a consultar con una fecha distinta entre medio.
 */
function purgeCard() {
  const dateInput = el("input", { class: "form-control", type: "date" });
  const previewBtn = el("button", { class: "btn btn--secondary btn--block" }, "REVISAR QUÉ SE BORRARÍA");
  const previewBox = el("div", { class: "stack mt-md" });
  const confirmInput = el("input", { class: "form-control", placeholder: "Escriba BORRAR" });
  const purgeBtn = el("button", { class: "btn btn--danger btn--block", disabled: true, style: "display:none;" }, "BORRAR ESTOS REGISTROS");
  const logBox = el("div", { class: "stack mt-md" });
  let lastPreview = null;
  let lastCutoff = null;

  confirmInput.addEventListener("input", () => {
    purgeBtn.disabled = confirmInput.value.trim() !== "BORRAR";
  });

  previewBtn.addEventListener("click", async () => {
    if (!dateInput.value) {
      toast("Elegí una fecha.", "info");
      return;
    }
    lastCutoff = new Date(`${dateInput.value}T00:00:00`);
    lastPreview = null;
    confirmInput.value = "";
    purgeBtn.disabled = true;
    purgeBtn.style.display = "none";
    previewBtn.disabled = true;
    previewBtn.textContent = "REVISANDO...";
    clear(previewBox);
    clear(logBox);
    try {
      lastPreview = await previewPurge(lastCutoff);
      clear(previewBox);
      const total = lastPreview.reduce((sum, t) => sum + t.docs.length, 0);
      if (total === 0) {
        previewBox.appendChild(el("div", { class: "empty-state" }, "No hay registros ya cerrados/entregados/devueltos anteriores a esa fecha."));
      } else {
        for (const t of lastPreview) {
          if (t.docs.length > 0) previewBox.appendChild(infoRow(t.label, `${t.docs.length} para borrar`));
        }
        previewBox.appendChild(
          el(
            "div",
            { class: "form-hint mt-md" },
            "Lo que sigue activo ahora mismo (un parqueo ocupado, un paquete/tarjeta/objeto sin entregar, un préstamo sin devolver) nunca se incluye acá, sin importar qué tan viejo sea."
          )
        );
        purgeBtn.style.display = "";
      }
    } catch (err) {
      previewBox.appendChild(el("div", { class: "empty-state" }, friendlyError(err)));
    }
    previewBtn.disabled = false;
    previewBtn.textContent = "REVISAR QUÉ SE BORRARÍA";
  });

  purgeBtn.addEventListener("click", async () => {
    if (!lastPreview || !lastCutoff) return;
    const total = lastPreview.reduce((sum, t) => sum + t.docs.length, 0);
    const ok = await confirmDialog({
      title: "Confirmar depuración",
      body: `Esto borra PARA SIEMPRE ${total} registro(s) ya cerrados/entregados/devueltos, de antes del ${dateInput.value}. Si querés conservarlos, descargá primero el respaldo completo (arriba). Esta acción no se puede deshacer.`,
      confirmText: "Sí, borrar",
      danger: true,
    });
    if (!ok) return;
    purgeBtn.disabled = true;
    purgeBtn.textContent = "BORRANDO...";
    clear(logBox);
    try {
      await executePurge(lastPreview, lastCutoff, (msg) => logBox.appendChild(el("div", { class: "text-secondary" }, msg)));
      toast("Depuración completa.", "success");
      lastPreview = null;
      lastCutoff = null;
      clear(previewBox);
      confirmInput.value = "";
      purgeBtn.style.display = "none";
    } catch (err) {
      toast(friendlyError(err), "danger");
    }
    purgeBtn.disabled = false;
    purgeBtn.textContent = "BORRAR ESTOS REGISTROS";
  });

  return el("div", { class: "card mb-md" }, [
    sectionTitle("warning", "Depuración manual de historial viejo"),
    el(
      "div",
      { class: "text-secondary mb-md" },
      "Borra registros ya cerrados/entregados/devueltos anteriores a una fecha, para liberar espacio — nunca toca lo que sigue activo (un parqueo ocupado, un paquete sin entregar, etc.), sin importar su antigüedad."
    ),
    field("Borrar registros anteriores a", dateInput),
    previewBtn,
    previewBox,
    field("Escriba BORRAR para habilitar el botón", confirmInput),
    purgeBtn,
    logBox,
  ]);
}

/**
 * Borra TODO el historial operativo real (no solo demo) y deja los
 * espacios de parqueo libres — requiere que firestore.rules ya permita
 * borrar cada una de estas colecciones sin la restricción isDemo==true
 * (ver la nota del mismo cambio en firestore.rules). parking_spaces nunca
 * se borra (la regla lo bloquea a propósito, para no perder la
 * identidad de cada espacio) — se resetea a libre en su lugar.
 */
async function wipeAllData(log) {
  for (const name of WIPE_COLLECTIONS) {
    const snap = await getDocs(collection(db, name));
    for (const d of snap.docs) {
      await deleteDoc(doc(db, name, d.id));
      // public_status se crea siempre con el mismo ID que su
      // parking_sessions — se borra aquí, por ID puntual (la colección en
      // sí no se puede listar, ver nota arriba).
      if (name === "parking_sessions") {
        await deleteDoc(doc(db, "public_status", d.id));
      }
    }
    log(`${name}: ${snap.docs.length} documento(s) eliminado(s).`);
  }

  const spacesSnap = await getDocs(collection(db, "parking_spaces"));
  for (const d of spacesSnap.docs) {
    await updateDoc(doc(db, "parking_spaces", d.id), {
      status: "free",
      sessionId: null,
      visitorName: null,
      visitorId: null,
      plate: null,
      visitorPhone: null,
      isDemo: false,
      destinationType: null,
      destinationNumber: null,
      entryAt: null,
      entryGuardName: null,
      entryLobby: null,
      maxMinutesAtEntry: null,
      updatedAt: serverTimestamp(),
    });
  }
  log(`parking_spaces: ${spacesSnap.docs.length} espacio(s) reiniciado(s) a LIBRE.`);

  // Este SÍ queda: es la única entrada de auditoría del sistema "nuevo",
  // dejando registrado quién reinició todo y cuándo.
  await logAudit("system.reset", { details: { collections: WIPE_COLLECTIONS } });
}

function resetDataCard(root) {
  const confirmInput = el("input", { class: "form-control", placeholder: "Escriba BORRAR TODO" });
  const resetBtn = el("button", { class: "btn btn--danger btn--block", disabled: true }, "REINICIAR DATOS DEL SISTEMA");
  const logBox = el("div", { class: "stack mt-md" });

  confirmInput.addEventListener("input", () => {
    resetBtn.disabled = confirmInput.value.trim() !== "BORRAR TODO";
  });

  resetBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Reiniciar datos del sistema",
      body: "Esto BORRA PARA SIEMPRE todo el historial de parqueos, paquetes, tarjetas/stickers, objetos encontrados, el catálogo completo de objetos y préstamos, la auditoría y los reportes de error. Los espacios de parqueo quedan libres, listos para usar. Los usuarios y la configuración general NO se tocan. Esta acción NO se puede deshacer.",
      confirmText: "Sí, borrar todo",
      danger: true,
    });
    if (!ok) return;
    resetBtn.disabled = true;
    resetBtn.textContent = "BORRANDO...";
    clear(logBox);
    try {
      await wipeAllData((msg) => logBox.appendChild(el("div", { class: "text-secondary" }, `✓ ${msg}`)));
      toast("Sistema reiniciado.", "success");
      renderDeveloperTab(root);
    } catch (err) {
      toast(friendlyError(err), "danger");
      resetBtn.disabled = false;
      resetBtn.textContent = "REINICIAR DATOS DEL SISTEMA";
    }
  });

  return el("div", { class: "card mb-md", style: "border-color:var(--color-danger);" }, [
    sectionTitle("warning", "Reiniciar datos del sistema"),
    el("div", { class: "text-secondary mb-md" }, "Borra TODO el historial real (parqueos, paquetes, tarjetas/stickers, objetos encontrados, catálogo de objetos y préstamos, auditoría y reportes de error) y deja el sistema como recién instalado. Los usuarios y la configuración general no se tocan. No se puede deshacer — considere descargar el respaldo de arriba primero."),
    el("div", { class: "form-group" }, [el("label", { class: "form-label" }, "Para confirmar, escriba BORRAR TODO"), confirmInput]),
    resetBtn,
    logBox,
  ]);
}

function auditCard(logs) {
  const searchInput = el("input", { class: "form-control", placeholder: "Filtrar por acción, usuario o rol..." });
  const list = el("div", { class: "stack", style: "max-height:420px; overflow-y:auto; margin-top:10px;" });

  function render() {
    const q = searchInput.value.trim().toLowerCase();
    const filtered = q
      ? logs.filter((l) => `${l.action} ${l.userName} ${l.userRole} ${l.targetCollection || ""}`.toLowerCase().includes(q))
      : logs;
    clear(list);
    if (filtered.length === 0) {
      list.appendChild(el("div", { class: "empty-state" }, "Sin resultados."));
      return;
    }
    for (const log of filtered.slice(0, 150)) {
      list.appendChild(
        el("div", { class: "card", style: "padding:10px 12px;" }, [
          el("div", { class: "row row--between" }, [
            el("strong", {}, log.action),
            el("span", { class: "text-faint" }, formatDateTime(log.createdAt)),
          ]),
          el("div", { class: "text-secondary" }, `${log.userName || "?"} (${log.userRole || "?"})${log.targetCollection ? ` · ${log.targetCollection}${log.targetId ? "/" + log.targetId : ""}` : ""}`),
          Object.keys(log.details || {}).length ? el("div", { class: "text-faint", style: "font-family:ui-monospace,'Cascadia Code','Courier New',monospace; font-size:12px; word-break:break-all;" }, JSON.stringify(log.details)) : null,
        ].filter(Boolean))
      );
    }
  }
  searchInput.addEventListener("input", render);
  render();

  return el("div", { class: "card mb-md" }, [
    sectionTitle("activity", `Auditoría completa (últimos ${logs.length})`),
    searchInput,
    list,
  ]);
}

function settingsEditorCard(settings) {
  const textarea = el("textarea", { class: "form-control", rows: "10", style: "font-family:ui-monospace,'Cascadia Code','Courier New',monospace; font-size:13px;" });
  textarea.value = JSON.stringify(settings || {}, null, 2);
  const errorBox = el("div", { class: "form-error", style: "display:none;" });
  const saveBtn = el("button", { class: "btn btn--danger btn--block" }, "GUARDAR CONFIGURACIÓN");

  saveBtn.addEventListener("click", async () => {
    errorBox.style.display = "none";
    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (err) {
      errorBox.textContent = "El texto no es JSON válido. Revise comas, comillas y llaves.";
      errorBox.style.display = "block";
      return;
    }
    const ok = await confirmDialog({
      title: "Guardar configuración cruda",
      body: "Esto escribe directamente el documento de configuración. Un valor incorrecto puede afectar reglas de tiempo u otras pantallas. ¿Continuar?",
      danger: true,
    });
    if (!ok) return;
    saveBtn.disabled = true;
    try {
      await updateSettings(parsed);
      toast("Configuración guardada.", "success");
    } catch (err) {
      errorBox.textContent = friendlyError(err);
      errorBox.style.display = "block";
    }
    saveBtn.disabled = false;
  });

  return el("div", { class: "card mb-md" }, [
    sectionTitle("tools", "Configuración cruda (settings/general)"),
    el("div", { class: "text-secondary mb-md" }, "Editar en formato técnico. Guarda solo los campos que aparezcan acá — no borra los que no toque."),
    textarea,
    errorBox,
    saveBtn,
  ]);
}

function linksCard() {
  const projectId = firebaseConfig?.projectId || "";
  return el("div", { class: "card" }, [
    sectionTitle("card", "Accesos directos"),
    el("div", { class: "stack" }, [
      link(`https://console.firebase.google.com/project/${projectId}/overview`, "Consola de Firebase"),
      link(`https://console.firebase.google.com/project/${projectId}/firestore/data`, "Firestore (datos)"),
      link(`https://console.firebase.google.com/project/${projectId}/firestore/rules`, "Firestore (reglas)"),
      link(`https://console.firebase.google.com/project/${projectId}/authentication/users`, "Authentication (usuarios)"),
      link("https://github.com/torrespaseocolon/Seguridad-tpc", "Repositorio en GitHub"),
    ]),
  ]);
}

function link(href, text) {
  return el("a", { href, target: "_blank", rel: "noopener", class: "btn btn--secondary btn--block" }, text);
}

function field(labelText, inputNode) {
  return el("div", { class: "form-group" }, [el("label", { class: "form-label" }, labelText), inputNode]);
}
