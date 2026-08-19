// Inicialización de Firebase. Carga el SDK modular directamente desde el CDN
// de Google (gstatic) — por eso el proyecto no necesita "npm install" ni
// ningún paso de compilación: funciona con solo abrir index.html o
// publicarlo tal cual en GitHub Pages.
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let firebaseConfig;
try {
  ({ firebaseConfig } = await import("./firebase-config.js"));
} catch (err) {
  throw new Error(
    "Falta el archivo src/firebase/firebase-config.js. Copia " +
      "firebase-config.example.js, renómbralo a firebase-config.js y pega " +
      "allí la configuración real de tu proyecto de Firebase (ver manual, PASO 10-11)."
  );
}

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
// La sesión se mantiene aunque se cierre el navegador (el guardia no debe
// tener que iniciar sesión en cada turno si no ha cerrado sesión).
await setPersistence(auth, browserLocalPersistence);

// Caché local con soporte multi-pestaña: permite que la pantalla de
// Parqueos siga mostrando el último estado conocido si se pierde la
// conexión por un momento. Antes usaba persistentSingleTabManager (una sola
// pestaña con acceso a la vez), pero eso rompía el "doble uso del mismo QR"
// de consulta.js: al escanear el código QR de un parqueo, el celular abre
// el enlace en una pestaña NUEVA de Safari/Chrome — si la app principal ya
// estaba abierta en otra pestaña, la pestaña nueva se quedaba sin acceso a
// la base de datos local y fallaba al intentar registrar la salida desde
// ahí. persistentMultipleTabManager sincroniza la caché entre todas las
// pestañas del mismo origen en vez de restringirla a una sola.
// databaseId "default": al crear la base de datos en la consola de Firebase
// escribiendo "(default)", Firebase la registró con el ID "default" (sin
// paréntesis) en vez del nombre especial reservado "(default)" que el SDK
// busca automáticamente cuando no se indica ninguno — por eso hay que
// indicarlo explícitamente aquí.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  },
  "default"
);

// -----------------------------------------------------------------------
// App secundaria — se usa EXCLUSIVAMENTE para que un administrador pueda
// crear la cuenta de Authentication de un nuevo guardia/administrador desde
// dentro de la aplicación, sin que eso cierre la sesión del administrador
// (crear un usuario con el SDK de cliente normalmente "inicia sesión" como
// ese usuario nuevo; con una instancia de app separada evitamos ese efecto).
// No requiere Cloud Functions ni el plan Blaze.
// -----------------------------------------------------------------------
let secondaryApp = null;
export function getSecondaryAuth() {
  if (!secondaryApp) {
    secondaryApp = initializeApp(firebaseConfig, "secondary-user-creation");
  }
  return getAuth(secondaryApp);
}
