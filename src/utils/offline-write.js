// Firestore's setDoc/updateDoc/addDoc devuelven una promesa que SOLO se
// resuelve cuando el SERVIDOR confirma la escritura — es el comportamiento
// documentado del SDK, no un error de este proyecto. El dato queda guardado
// de inmediato en el dispositivo (en la cola de sincronización local) pase
// lo que pase, pero esa promesa en particular no se entera de eso: sin
// conexión, la confirmación del servidor nunca llega, así que la promesa
// se queda esperando indefinidamente aunque el dato ya esté a salvo.
//
// settle() deja de esperar esa promesa después de `timeoutMs` y sigue
// adelante igual (la escritura real sigue su curso en segundo plano;
// Firestore la sincroniza sola apenas regrese la señal). Si la promesa
// rechaza RÁPIDO (un error real: permisos, datos inválidos, etc. — no un
// simple silencio por falta de conexión), ese rechazo se propaga normal, no
// se oculta: solo se ignora la espera cuando lo que pasa es que nunca
// llega ninguna respuesta.
export function settle(promise, timeoutMs = 3000) {
  // Handler "silencioso" aparte, solo para que un rechazo tardío (después de
  // que ya seguimos adelante por el timeout) no aparezca como "Unhandled
  // promise rejection" en la consola — no cambia el resultado de la carrera.
  promise.catch((err) => {
    console.error("[SEGURIDAD TPC] Una escritura en segundo plano terminó con error después de continuar sin esperarla:", err);
  });
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
