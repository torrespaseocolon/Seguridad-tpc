// Pestaña de Demostración — pensada para preparar una presentación en vivo
// (por ejemplo ante la junta directiva) sin tener que escribir datos falsos
// a mano frente a nadie. Todo lo que crea queda marcado con isDemo:true.
// "Limpiar demostración" ELIMINA por completo todo lo marcado como demo
// (parqueos, paquetes, objetos, préstamos y tarjetas), sin importar en qué
// estado haya quedado durante la presentación (por ejemplo, aunque ya se
// haya tocado "entregar" o "devolver" en vivo) — así nunca queda basura de
// demostración mezclada con los datos reales. Esto es una excepción
// deliberada a la regla general del resto de la app de "nunca borrar, solo
// resolver": las reglas de Firestore (firestore.rules) solo permiten borrar
// documentos donde isDemo == true, así que los datos reales siguen
// protegidos contra borrado pase lo que pase aquí.
import { el, clear, toast, confirmDialog } from "../../utils/dom.js";
import { icon } from "../../utils/icons.js";
import { db } from "../../firebase/firebase-init.js";
import {
  collection,
  doc,
  query,
  where,
  orderBy,
  getDocs,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { registerEntry, registerExit, MAX_MINUTES_OFFICE } from "../../services/parking.service.js";
import { createPackage } from "../../services/packages.service.js";
import { createObject, loanObject } from "../../services/objects.service.js";
import { createAccessItem } from "../../services/access-items.service.js";
import { createFoundItem } from "../../services/found-items.service.js";
import { logAudit } from "../../services/audit.service.js";
import { buildDestinationCode } from "../../utils/destination.js";
import { friendlyError } from "../../utils/errors.js";

export async function renderDemoTab(root) {
  clear(root);

  root.appendChild(
    el("div", { class: "card mb-md" }, [
      el("div", { class: "card__title row" }, [icon("info"), "Demostración para presentaciones"]),
      el("div", { class: "text-secondary" },
        "Carga de un solo golpe datos de ejemplo — claramente marcados como \"DEMO\" — en Parqueos, Paquetes, Objetos, Objetos encontrados y Tarjetas/Stickers, para no tener que escribir nada en vivo frente a la junta: 3 parqueos de visita a la Oficina A-801 (para demostrar el límite de 3 simultáneos), uno de ellos a 20 segundos de cumplir su tiempo máximo (para probar el aviso de tiempo vencido). Cuando termines, \"Limpiar demostración\" ELIMINA todo lo cargado, sin importar si ya lo marcaste como entregado/devuelto durante la presentación."
      ),
    ])
  );

  const availabilityCard = el("div", { class: "card mb-md" }, "Comprobando parqueos de visitante libres...");
  root.appendChild(availabilityCard);
  checkAvailability(availabilityCard);

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
      checkAvailability(availabilityCard);
    }
  });

  clearBtn.addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Limpiar demostración",
      body: "Esto ELIMINA por completo todo lo que quedó marcado como demo (parqueos, paquetes, objetos, préstamos, objetos encontrados y tarjetas), sin importar el estado en que haya quedado. No afecta datos reales. ¿Continuar?",
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
      checkAvailability(availabilityCard);
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

/**
 * Muestra ANTES de cargar cuántos parqueos de visitante están libres ahora
 * mismo, para no descubrir a mitad de la demo (o peor, en vivo frente a la
 * junta) que faltaban espacios. Si hay menos de 3, casi siempre es porque
 * quedaron espacios REALES ocupados por pruebas anteriores (no de demo) —
 * eso hay que liberarlo a mano desde Parqueos o Administración →
 * Correcciones, la demo nunca toca datos reales.
 */
async function checkAvailability(card) {
  clear(card);
  try {
    const snap = await getDocs(query(collection(db, "parking_spaces"), orderBy("number")));
    const spaces = snap.docs.map((d) => d.data());
    const free = spaces.filter((s) => s.status === "free" && s.type === "visitor");
    const occupiedNumbers = spaces.filter((s) => s.status === "occupied" && s.type === "visitor").map((s) => s.number);
    const enough = free.length >= 3;
    card.appendChild(
      el("div", { class: "row", style: `align-items:flex-start; color:${enough ? "var(--color-success)" : "var(--color-danger)"};` }, [
        icon(enough ? "check" : "warning", { size: 20 }),
        el("div", {}, [
          el("div", { style: "font-weight:700;" }, `${free.length} parqueo(s) de visitante libres ahora mismo (se necesitan 3 para la demo completa).`),
          !enough
            ? el("div", { class: "text-secondary", style: "margin-top:4px;" },
                `Hay ${occupiedNumbers.length} parqueo(s) de visitante ocupados (${occupiedNumbers.join(", ") || "—"}). Si son de pruebas tuyas (no de una visita real), liberalos primero desde Parqueos (tocá el espacio → REGISTRAR SALIDA) o desde Administración → Correcciones si no recordás cuáles son.`)
            : null,
        ]),
      ].filter(Boolean))
    );
  } catch (err) {
    card.appendChild(el("div", { class: "text-secondary" }, "No se pudo comprobar la disponibilidad de parqueos."));
  }
}

async function seedDemoData(log) {
  // Parqueos: 3 visitas al MISMO destino (Oficina A-801) para poder
  // demostrar en vivo que un 4to intento se bloquea por el límite de
  // MAX_SIMULTANEOUS_PER_DESTINATION. La última queda a 20 segundos de
  // cumplir su tiempo máximo, para poder mostrar el aviso de tiempo vencido
  // sin tener que esperar horas reales.
  const officeDest = buildDestinationCode("A", "801");
  const demoVisitors = [
    { visitorName: "DEMO - María Rodríguez", visitorId: "0-0000-0001", plate: "DEMO001" },
    { visitorName: "DEMO - Carlos Jiménez", visitorId: "0-0000-0002", plate: "DEMO002" },
    { visitorName: "DEMO - Luis Fernández", visitorId: "0-0000-0003", plate: "DEMO003" },
  ];

  // Por si quedó algún parqueo demo ocupado de una carga anterior que no se
  // limpió (por ejemplo, se cerró la pestaña a mitad de una presentación):
  // se libera solo, antes de buscar espacios libres, para no competir por
  // espacios con su propia carga anterior. Nunca toca parqueos reales
  // (isDemo == false).
  const leftoverSnap = await getDocs(
    query(collection(db, "parking_spaces"), where("isDemo", "==", true), where("status", "==", "occupied"))
  );
  for (const d of leftoverSnap.docs) {
    try {
      await registerExit(d.data().number);
    } catch (err) {
      /* si ya se liberó por otro lado, no pasa nada */
    }
  }

  const freeSpaces = await findFreeSpaces(3);
  if (freeSpaces.length === 0) {
    log("No hay parqueos de visitante libres — se omite la parte de Parqueos.", false);
  } else {
    if (freeSpaces.length < 3) {
      log(`Solo hay ${freeSpaces.length} parqueo(s) de visitante libres (se necesitan 3 para demostrar el límite completo). Se cargan los que hay — liberá parqueos de prueba reales desde Parqueos o Correcciones para poder cargar los 3.`, false);
    }
    for (let i = 0; i < freeSpaces.length; i++) {
      const v = demoVisitors[i];
      const isNearLimit = i === freeSpaces.length - 1;
      try {
        const entryData = {
          ...v,
          visitorPhone: "",
          destinationType: "office",
          destinationNumber: officeDest,
          lobbyOverride: "B",
          isDemo: true,
        };
        if (isNearLimit) {
          // El aviso de tiempo vencido se dispara cuando los minutos
          // transcurridos (redondeados hacia abajo) SUPERAN el máximo, es
          // decir, al cruzar el minuto (maxMinutes + 1). Se backdatea la
          // entrada para que ese cruce ocurra 20 segundos después de cargar
          // la demo, sin tener que esperar horas reales.
          entryData.entryAtOverride = new Date(Date.now() - ((MAX_MINUTES_OFFICE + 1) * 60 * 1000 - 20 * 1000));
        }
        await registerEntry(freeSpaces[i].number, entryData);
        log(`Parqueo ${freeSpaces[i].number}: entrada de "${v.visitorName}" registrada (Oficina ${officeDest})${isNearLimit ? " — a 20 segundos de cumplir el tiempo máximo" : ""}.`);
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
    log("Paquete de demostración creado, pendiente de entrega (Apto A-1201).");
  } catch (err) {
    log(`Paquetes: ${friendlyError(err)}`, false);
  }

  // Objetos + préstamo — un solo objeto, con una sola unidad, prestada, para
  // que se vea claramente cómo luce un objeto sin disponibilidad.
  try {
    const objectId = await createObject({
      name: "DEMO - Linterna de emergencia",
      category: "Herramientas",
      quantity: 1,
      lobby: "B",
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

  // Objeto encontrado, pendiente de entrega
  try {
    await createFoundItem({
      description: "DEMO - Llavero con 3 llaves",
      foundLocation: "DEMO - Área de piscina",
      condition: "bueno",
      isDemo: true,
    });
    log("Objeto encontrado de demostración registrado, pendiente de entrega.");
  } catch (err) {
    log(`Objetos encontrados: ${friendlyError(err)}`, false);
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
    log("Tarjeta de demostración registrada, pendiente de entrega (Apto B-903).");
  } catch (err) {
    log(`Tarjetas: ${friendlyError(err)}`, false);
  }
}

async function clearDemoData(log) {
  // 1) Parqueos demo que sigan ocupados -> registrar salida para liberar el
  // espacio físico con el flujo normal (deja el espacio en "free").
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

  // 2) Todas las sesiones de parqueo demo (abiertas o ya cerradas) y su
  // espejo público se ELIMINAN, sin importar el estado.
  const sessionsSnap = await getDocs(query(collection(db, "parking_sessions"), where("isDemo", "==", true)));
  for (const d of sessionsSnap.docs) {
    try {
      await deleteDoc(doc(db, "parking_sessions", d.id));
      await deleteDoc(doc(db, "public_status", d.id));
    } catch (err) {
      log(`Registro de parqueo demo: ${friendlyError(err)}`, false);
    }
  }
  if (sessionsSnap.docs.length) log(`${sessionsSnap.docs.length} registro(s) de parqueo demo eliminado(s).`);

  // 3) Paquetes demo -> se eliminan sin importar si ya se marcaron entregados.
  const pkgSnap = await getDocs(query(collection(db, "packages"), where("isDemo", "==", true)));
  for (const d of pkgSnap.docs) {
    try {
      await deleteDoc(doc(db, "packages", d.id));
      log(`Paquete "${d.data().recipientName}": eliminado.`);
    } catch (err) {
      log(`Paquete: ${friendlyError(err)}`, false);
    }
  }

  // 4) Préstamos demo -> se eliminan sin importar si ya se devolvieron.
  const loanSnap = await getDocs(query(collection(db, "object_loans"), where("isDemo", "==", true)));
  for (const d of loanSnap.docs) {
    try {
      await deleteDoc(doc(db, "object_loans", d.id));
      log(`Préstamo "${d.data().objectName}": eliminado.`);
    } catch (err) {
      log(`Préstamo: ${friendlyError(err)}`, false);
    }
  }

  // 5) Objetos demo -> se eliminan del catálogo por completo.
  const objSnap = await getDocs(query(collection(db, "objects"), where("isDemo", "==", true)));
  for (const d of objSnap.docs) {
    try {
      await deleteDoc(doc(db, "objects", d.id));
      log(`Objeto "${d.data().name}": eliminado.`);
    } catch (err) {
      log(`Objeto: ${friendlyError(err)}`, false);
    }
  }

  // 6) Objetos encontrados demo -> se eliminan sin importar si ya se marcaron entregados.
  const foundSnap = await getDocs(query(collection(db, "found_items"), where("isDemo", "==", true)));
  for (const d of foundSnap.docs) {
    try {
      await deleteDoc(doc(db, "found_items", d.id));
      log(`Objeto encontrado "${d.data().description}": eliminado.`);
    } catch (err) {
      log(`Objeto encontrado: ${friendlyError(err)}`, false);
    }
  }

  // 7) Tarjetas/Stickers demo -> se eliminan sin importar si ya se marcaron entregadas.
  const accessSnap = await getDocs(query(collection(db, "access_items"), where("isDemo", "==", true)));
  for (const d of accessSnap.docs) {
    try {
      await deleteDoc(doc(db, "access_items", d.id));
      log(`Tarjeta "${d.data().recipientName}": eliminada.`);
    } catch (err) {
      log(`Tarjeta: ${friendlyError(err)}`, false);
    }
  }

  await logAudit("demo.clear", {});
}
