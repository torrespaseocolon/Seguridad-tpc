// Página pública de consulta de tiempo de parqueo — SIN iniciar sesión.
// Lee únicamente la colección public_status (sin datos personales) a
// partir del código que viene en la URL (o que el visitante pega a mano).
// Ver la nota de seguridad en firestore.rules, sección public_status.
//
// Doble uso del mismo QR: si quien lo abre es un visitante sin sesión, solo
// ve su tiempo restante. Si lo abre un guardia/admin que YA tiene sesión
// iniciada en ese mismo celular/tablet (la app de guardias), además le
// aparece un botón para registrar la salida — sin tener que volver a la
// pantalla de Parqueos y buscar el espacio. La protección real sigue siendo
// del lado del servidor (firestore.rules): aunque alguien manipulara esta
// página, registrar una salida real sigue exigiendo sesión de personal.
import { db } from "./firebase/firebase-init.js";
import {
  doc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { el, clear, toast, confirmDialog } from "./utils/dom.js";
import { icon } from "./utils/icons.js";
import { initTheme } from "./utils/theme.js";
import { formatDateTime, startLocalTicker, toMillis } from "./utils/time.js";
import { subscribeAuth } from "./services/auth.service.js";
import { registerExit, OperationError } from "./services/parking.service.js";
import { friendlyError } from "./utils/errors.js";

initTheme();

const root = document.getElementById("consulta-root");
let unsubscribeStatus = null;
let stopTicker = null;
let latestData = null;
let staffProfile = null; // null = sin sesión de personal (o todavía no se sabe)

function card(children) {
  return el("div", { class: "login-screen" }, [
    el("div", { class: "login-card" }, [
      el("div", { class: "login-title mb-md" }, [
        el("h1", {}, "TORRES PASEO COLÓN"),
        el("p", {}, "Consulta de tiempo de parqueo"),
      ]),
      el("div", { class: "card" }, children),
    ]),
  ]);
}

function renderCodeForm() {
  const input = el("input", { class: "form-control", placeholder: "Pegue aquí el código de su recibo" });
  const btn = el("button", { class: "btn btn--primary btn--block btn--lg mt-md" }, "CONSULTAR");
  const go = () => {
    const value = input.value.trim();
    if (!value) return;
    const url = new URL(window.location.href);
    url.searchParams.set("id", value);
    window.location.href = url.href;
  };
  btn.addEventListener("click", go);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") go();
  });
  clear(root);
  root.appendChild(
    card([
      el("div", { class: "text-secondary mb-md" }, "Escaneá el código QR que te dio el guardia al registrar tu entrada. Si no podés escanearlo, pegá el código aquí:"),
      el("div", { class: "form-group" }, [el("label", { class: "form-label" }, "Código"), input]),
      btn,
    ])
  );
  input.focus();
}

function renderLoading() {
  clear(root);
  root.appendChild(card([el("div", { class: "loading-state" }, [el("div", { class: "spinner" }), el("div", {}, "Consultando...")])]));
}

function renderNotFound() {
  clear(root);
  root.appendChild(
    card([
      el("div", { class: "empty-state" }, [
        el("div", { class: "empty-state__icon" }, [icon("warning", { size: 36 })]),
        el("div", {}, "Ese código no es válido, o el registro ya no existe. Verifique el código o consulte con el guardia."),
      ]),
    ])
  );
}

function renderStatus(data) {
  clear(root);

  const children = [
    el("div", { class: "row row--between mb-md" }, [
      el("strong", {}, `Parqueo ${data.spaceNumber || "-"}`),
      el(
        "span",
        { class: `badge ${data.status === "open" ? "badge--occupied" : "badge--free"}` },
        [el("span", { class: "status-dot" }), data.status === "open" ? "ACTIVO" : "SALIDA REGISTRADA"]
      ),
    ]),
  ];

  if (data.status === "open") {
    const timerEl = el("div", { class: "timer mono text-center", style: "font-size:36px; margin:16px 0;" }, "--:--:--");
    const labelEl = el("div", { class: "text-secondary text-center mb-md" }, "Tiempo restante");
    children.push(labelEl, timerEl);

    function tick() {
      const startMs = toMillis(data.entryAt);
      if (!startMs || !data.maxMinutesAtEntry) {
        timerEl.textContent = "--:--:--";
        return;
      }
      const deadlineMs = startMs + data.maxMinutesAtEntry * 60000;
      const diffMs = deadlineMs - Date.now();
      const overdue = diffMs < 0;
      const totalSeconds = Math.floor(Math.abs(diffMs) / 1000);
      const h = Math.floor(totalSeconds / 3600);
      const m = Math.floor((totalSeconds % 3600) / 60);
      const s = totalSeconds % 60;
      const text = [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
      timerEl.textContent = text;
      timerEl.classList.toggle("timer--overdue", overdue);
      labelEl.textContent = overdue ? "Tiempo excedido hace" : "Tiempo restante";
    }
    tick();
    if (stopTicker) stopTicker();
    stopTicker = startLocalTicker(tick);

    if (data.extendedMinutes > 0) {
      children.push(
        el("div", { class: "alert alert--info" }, `Se le extendió el tiempo permitido en ${data.extendedMinutes} minutos adicionales.`)
      );
    }

    if (staffProfile) {
      const exitBtn = el("button", { class: "btn btn--danger btn--block btn--lg mt-md" }, "REGISTRAR SALIDA");
      exitBtn.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Confirmar salida",
          body: `¿Confirma la salida del vehículo del parqueo ${data.spaceNumber}? El espacio quedará disponible de inmediato.`,
          confirmText: "Sí, registrar salida",
          danger: true,
        });
        if (!ok) return;
        exitBtn.disabled = true;
        exitBtn.textContent = "GUARDANDO...";
        try {
          await registerExit(data.spaceNumber, id, data.entryAt);
          toast("Salida registrada.", "success");
          // La propia consulta se actualiza sola (escucha en tiempo real).
        } catch (err) {
          toast(err instanceof OperationError ? err.message : friendlyError(err), "danger");
          exitBtn.disabled = false;
          exitBtn.textContent = "REGISTRAR SALIDA";
        }
      });
      children.push(el("div", { class: "form-hint text-center" }, `Sesión de personal detectada (${staffProfile.name}) — solo por eso ves esta opción.`));
      children.push(exitBtn);
    }
  } else {
    if (stopTicker) {
      stopTicker();
      stopTicker = null;
    }
    children.push(
      el("div", { class: "alert alert--success" }, `La salida ya fue registrada${data.exitAt ? " — " + formatDateTime(data.exitAt) : ""}. Gracias por su visita.`)
    );
  }

  root.appendChild(card(children));
}

function rerenderIfReady() {
  if (latestData) renderStatus(latestData);
}

function loadStatus(id) {
  renderLoading();
  if (unsubscribeStatus) unsubscribeStatus();
  unsubscribeStatus = onSnapshot(
    doc(db, "public_status", id),
    (snap) => {
      if (!snap.exists()) {
        latestData = null;
        renderNotFound();
        return;
      }
      // "estimate": mismo motivo que en parking.service.js — mientras
      // entryAt no haya sincronizado con el servidor, usa la hora del
      // propio dispositivo en vez de mostrar el cronómetro vacío.
      latestData = snap.data({ serverTimestamps: "estimate" });
      renderStatus(latestData);
    },
    () => {
      latestData = null;
      renderNotFound();
    }
  );
}

// Detecta, sin bloquear la carga de la consulta, si quien mira esta página
// ya tiene sesión de guardia/admin abierta en este dispositivo.
subscribeAuth((state) => {
  staffProfile = state && state.profile ? state.profile : null;
  rerenderIfReady();
});

const params = new URLSearchParams(window.location.search);
const id = params.get("id");
if (id) {
  loadStatus(id);
} else {
  renderCodeForm();
}
