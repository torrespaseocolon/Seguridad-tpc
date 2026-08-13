// =============================================================================
// PLANTILLA de configuración de Firebase — NO CONTIENE CLAVES REALES.
// =============================================================================
// Instrucciones (ver también el manual PASO 10-11):
//   1. Copia este archivo y renombra la copia a "firebase-config.js" en esta
//      misma carpeta (src/firebase/firebase-config.js).
//   2. Ve a la consola de Firebase → Configuración del proyecto → tus apps →
//      selecciona la app web → copia el objeto "firebaseConfig".
//   3. Pega esos valores reemplazando los que aparecen abajo.
//   4. Guarda. NO subas este archivo de ejemplo con valores reales; sube el
//      archivo "firebase-config.js" con tus valores reales (sí se sube a
//      GitHub — ver la nota de seguridad más abajo).
//
// ¿Es esto un secreto? NO. La configuración de una app web de Firebase
// (apiKey, authDomain, projectId, etc.) está diseñada por Google para ser
// pública — viaja al navegador de cualquiera que visite la página, igual que
// esta va a viajar. La protección real de tus datos NO es ocultar estas
// líneas: es "firestore.rules" (las reglas de seguridad) y Firebase
// Authentication. Aun así, nunca coloques aquí una contraseña, una "clave
// privada" de una cuenta de servicio, ni ningún token que sí sea secreto.
// =============================================================================

export const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};
