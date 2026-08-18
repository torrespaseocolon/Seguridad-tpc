// Pestaña de Demostración — pensada para preparar una presentación en vivo
// (por ejemplo ante la junta directiva) sin tener que escribir datos falsos
// a mano frente a nadie. Todo lo que crea queda marcado con isDemo:true, y
// "Limpiar demostración" lo resuelve todo con las MISMAS acciones normales
// del sistema (registrar salida, entregar, devolver) — nunca borra nada de
// la base de datos, así que el historial de auditoría queda intacto y
// honesto (se puede ver después que fue una demo).
import { el, clear, toast, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { db } from "../../firebase/firebase-init.js";
import {
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { registerEntry, registerExit } from "../../services/parking.service.js";
import { createPackage, deliverPackage } from "../../services/packages.service.js";
import { createObject, loanObject, returnObject, setObjectActive } from "../../services/objects.service.js";
import { createAccessItem, deliverAccessItem } from "../../services/access-items.service.js";
import { buildDestinationCode } from "../../utils/destination.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderDemoTab(root) {
  clear(root);

  root.appendChild(
    el("div", { class: "card mb-md" }, [
      el("div", { class: "card__title row" }, [icon("info"), "Demostración para presentaciones"]),
      el("div", { class: "text-secondary" },
        "Carga de un solo golpe datos de ejemplo — claramente marcados como \"DEMO\" — en Parqueos, Paquetes, Objetos y Tarjetas/Stickers, para no tener que escribir nada en vivo frente a la junta. Cuando termines, \"Limpiar demostración\" resuelve todo (registra salidas, entregas y devoluciones) — nunca borra nada, solo lo deja como si el ciclo normal hubiera terminado."
      ),
    ])
  );

  const loadBtn = el("button", { class: "btn btn--primary btn--block btn--lg mb-md" }, [icon("plus", { size: 18 }), " CARGAR DATOS DE DEMOSTRACIÓN"]);
  const clearBtn = el("button", { class: "btn btn--danger btn--block btn--lg mb-md" }, [icon("close", { size: 18 }), " LIMPIAR DEMOSTRACIÓN"]);
  const logBox = el("div", { class: "stack" });

  loadBtn.addEventListener("click", async () => {
    loadBtn.disabled = true;
    loadBtn.textContent = "CARGANDO...";
    clear(logBox);
    try {
      await seedDemoData(log);
      toast("Datos de demostración cargados.", "success");
    } catch (err) {
      toast(friendlyError(err), "danger");
    } finally {
      loadBtn.disabled = false;
      clear(loadBtn);
      loadBtn.appendChild(icon("plus", { size: 18 }));
      loadBtn.append(" CARGAR DATOS DE DEMOSTRACIÓN");
    }
  });

  clearBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Limpiar demostración",
      body: "Esto registra salida/entrega/devolución de todo lo que quedó marcado como demo. No afecta datos reales. ¿Continuar?",
      confirmText: "Sí, limpiar",
    });
    if (!ok) return;
    clearBtn.disabled = true;
    clearBtn.textContent = "LIMPIANDO...";
    clear(logBox);
    try {
      await clearDemoData(log);
      toast("Demostración limpiada.", "success");
    } catch (err) {
      toast(friendlyError(err), "danger");
    } finally {
      clearBtn.disabled = false;
      clear(clearBtn);
      clearBtn.appendChild(icon("close", { size: 18 }));
      clearBtn.append(" LIMPIAR DEMOSTRACIÓN");
    }
  });

  root.appendChild(loadBtn);
  root.appendChild(clearBtn);
  root.appendChild(el("div", { class: "card__title" }, "Detalle"));
  root.appendChild(logBox);

  function log(text, ok = true) {
    logBox.appendChild(
      el("div", { class: "text-secondary", style: ok ? "" : "color:var(--color-danger);" }, `${ok ? "✓" : "✗"} ${text}`)
    );
  }
}

async function findFreeSpaces(count) {
  // Trae los 13 espacios (son pocos, no hace falta filtrar en el servidor
  // con una combinación de campos que pediría un índice compuesto extra) y
  // filtra en el navegador los libres y de tipo visitante.
  const snap = await getDocs(query(collection(db, "parking_spaces"), orderBy("number")));
  return snap.docs
    .map((d) => d.data())
    .filter((s) => s.status === "free" && s.type === "visitor")
    .slice(0, count);
}

async function seedDemoData(log) {
  // Parqueos
  const freeSpaces = await findFreeSpaces(2);
  if (freeSpaces.length === 0) {
    log("No hay parqueos de visitante libres — se omite la parte de Parqueos.", false);
  } else {
    const demoVisitors = [
      { visitorName: "DEMO - María Rodríguez", visitorId: "0-0000-0001", plate: "DEMO001", destinationType: "office", destinationNumber: buildDestinationCode("A", "801") },
      { visitorName: "DEMO - Carlos Jiménez", visitorId: "0-0000-0002", plate: "DEMO002", destinationType: "apartment", destinationNumber: buildDestinationCode("B", "1002") },
    ];
    for (let i = 0; i < freeSpaces.length; i++) {
      const v = demoVisitors[i % demoVisitors.length];
      try {
        await registerEntry(freeSpaces[i].number, { ...v, visitorPhone: "", lobbyOverride: "B", isDemo: true });
        log(`Parqueo ${freeSpaces[i].number}: entrada de "${v.visitorName}" registrada.`);
      } catch (err) {
        log(`Parqueo ${freeSpaces[i].number}: ${friendlyError(err)}`, false);
      }
    }
  }

  // Paquetes
  try {
    await createPackage({
      apartment: buildDestinationCode("A", "1201"),
      recipientName: "DEMO - Residente A-1201",
      courier: "DEMO Courier Express",
      trackingNumber: "DEMO-TRACK-001",
      isDemo: true,
    });
    log("Paquete de demostración creado (Apto A-1201).");
  } catch (err) {
    log(`Paquetes: ${friendlyError(err)}`, false);
  }

  // Objetos + préstamo
  try {
    const objectId = await createObject({
      name: "DEMO - Linterna de emergencia",
      category: "Herramientas",
      quantity: 3,
      isDemo: true,
    });
    await loanObject({
      objectId,
      objectName: "DEMO - Linterna de emergencia",
      borrowerType: "resident",
      borrowerName: "DEMO - Ana Solano",
      apartment: buildDestinationCode("B", "1105"),
      isDemo: true,
    });
    log("Objeto de demostración creado y prestado (Apto B-1105).");
  } catch (err) {
    log(`Objetos: ${friendlyError(err)}`, false);
  }

  // Tarjetas / Stickers
  try {
    await createAccessItem({
      type: "card",
      recipientName: "DEMO - Residente B-903",
      apartment: buildDestinationCode("B", "903"),
      tower: "B",
      dropLobby: "B",
      isDemo: true,
    });
    log("Tarjeta de demostración registrada (Apto B-903).");
  } catch (err) {
    log(`Tarjetas: ${friendlyError(err)}`, false);
  }
}

async function clearDemoData(log) {
  // Parqueos demo ocupados -> registrar salida
  const spacesSnap = await getDocs(
    query(collection(db, "parking_spaces"), where("isDemo", "==", true), where("status", "==", "occupied"))
  );
  for (const d of spacesSnap.docs) {
    const space = d.data();
    try {
      await registerExit(space.number);
      log(`Parqueo ${space.number}: salida registrada.`);
    } catch (err) {
      log(`Parqueo ${space.number}: ${friendlyError(err)}`, false);
    }
  }

  // Paquetes demo pendientes -> entregar
  const pkgSnap = await getDocs(
    query(collection(db, "packages"), where("isDemo", "==", true), where("status", "==", "pending"))
  );
  for (const d of pkgSnap.docs) {
    try {
      await deliverPackage(d.id);
      log(`Paquete "${d.data().recipientName}": marcado como entregado.`);
    } catch (err) {
      log(`Paquete: ${friendlyError(err)}`, false);
    }
  }

  // Préstamos demo activos -> devolver
  const loanSnap = await getDocs(
    query(collection(db, "object_loans"), where("isDemo", "==", true), where("status", "==", "loaned"))
  );
  for (const d of loanSnap.docs) {
    try {
      await returnObject(d.id, { returnObservations: "Demostración finalizada.", returnCondition: "bueno" });
      log(`Préstamo "${d.data().objectName}": devuelto.`);
    } catch (err) {
      log(`Préstamo: ${friendlyError(err)}`, false);
    }
  }

  // Objetos demo -> desactivar (deja de ofrecerse a los guardias, sin borrarlo)
  const objSnap = await getDocs(
    query(collection(db, "objects"), where("isDemo", "==", true), where("active", "==", true))
  );
  for (const d of objSnap.docs) {
    try {
      await setObjectActive(d.id, false);
      log(`Objeto "${d.data().name}": desactivado.`);
    } catch (err) {
      log(`Objeto: ${friendlyError(err)}`, false);
    }
  }

  // Tarjetas demo pendientes -> entregar
  const accessSnap = await getDocs(
    query(collection(db, "access_items"), where("isDemo", "==", true), where("status", "==", "pending"))
  );
  for (const d of accessSnap.docs) {
    try {
      await deliverAccessItem(d.id);
      log(`Tarjeta "${d.data().recipientName}": marcada como entregada.`);
    } catch (err) {
      log(`Tarjeta: ${friendlyError(err)}`, false);
    }
  }
}
