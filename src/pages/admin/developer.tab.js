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
  getDocs,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { fetchRecentAudit } from "../../services/audit.service.js";
import { getSettings, updateSettings } from "../../services/settings.service.js";
import { isOnline } from "../../utils/connectivity.js";
import { formatDateTime } from "../../utils/time.js";
import { friendlyError } from "../../utils/errors.js";
import { firebaseConfig } from "../../firebase/firebase-config.js";

// Mantener igual al CACHE_NAME de service-worker.js — no hay forma de leerlo
// automáticamente desde acá (son dos archivos totalmente separados), así que
// hay que actualizar esta línea a mano cuando se suba una versión nueva.
const APP_VERSION = "seguridad-tpc-v38";

// public_status queda afuera a propósito: firestore.rules bloquea "list" en
// esa colección sin excepción (ni siquiera para administración) — solo se
// puede leer un documento puntual si ya se sabe su ID (ver la nota en
// firestore.rules), así que ni el conteo ni el respaldo pueden traerla
// completa. No es una pérdida real: es un espejo sin datos personales de
// parking_sessions, que sí está incluida abajo con todo el detalle.
const BACKUP_COLLECTIONS = [
  "parking_spaces",
  "parking_sessions",
  "packages",
  "objects",
  "object_loans",
  "access_items",
  "found_items",
  "users",
  "audit_logs",
  "error_reports",
  "settings",
];

export async function renderDeveloperTab(root) {
  clear(root);
  root.appendChild(loadingState("Cargando panel de desarrollador..."));

  try {
    const [counts, recentAudit, settings] = await Promise.all([
      Promise.all(BACKUP_COLLECTIONS.map((name) => getCountFromServer(collection(db, name)))),
      fetchRecentAudit(300),
      getSettings(true),
    ]);

    clear(root);
    root.appendChild(appInfoCard(settings));
    root.appendChild(countsCard(counts));
    root.appendChild(backupCard());
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
      BACKUP_COLLECTIONS.map((name, i) => infoRow(name, String(counts[i].data().count)))
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
    el("div", { class: "text-secondary mb-md" }, "Descarga TODA la base de datos actual en un solo archivo .json, tal como está en este momento."),
    downloadBtn,
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
