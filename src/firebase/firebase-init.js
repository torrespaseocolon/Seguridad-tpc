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
  persistentSingleTabManager,
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

// Caché local con una sola pestaña activa: permite que la pantalla de
// Parqueos siga mostrando el último estado conocido si se pierde la
// conexión por un momento, sin arriesgar datos contradictorios entre
// pestañas del mismo dispositivo.
// databaseId "seguridad-tpc": la base de datos de este proyecto no se creó
// con el nombre "(default)" (Firebase ahora permite varias bases de datos
// por proyecto), así que hay que indicar su nombre explícitamente o el SDK
// intenta conectarse a una base "(default)" que no existe.
export const db = initializeFirestore(
  app,
  {
    localCache: persistentLocalCache({ tabManager: persistentSingleTabManager({}) }),
  },
  "seguridad-tpc"
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
