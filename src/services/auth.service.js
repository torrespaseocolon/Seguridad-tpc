import { auth, db, getSecondaryAuth } from "../firebase/firebase-init.js";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import { friendlyError } from "../utils/errors.js";

let currentProfile = null;

/**
 * Se suscribe a los cambios de sesión. `callback` recibe:
 *  - null                          -> nadie ha iniciado sesión
 *  - { user, profile }             -> sesión válida y activa
 *  - { error }                     -> hubo sesión pero el perfil no es válido
 */
export function subscribeAuth(callback) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      currentProfile = null;
      callback(null);
      return;
    }
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (!snap.exists() || snap.data().active !== true) {
        await signOut(auth);
        currentProfile = null;
        callback({
          error:
            "Su cuenta no tiene un perfil activo en el sistema. Contacte a administración.",
        });
        return;
      }
      currentProfile = { uid: user.uid, email: user.email, ...snap.data() };
      callback({ user, profile: currentProfile });
    } catch (err) {
      callback({ error: friendlyError(err) });
    }
  });
}

export function getProfile() {
  return currentProfile;
}

export async function login(email, password) {
  try {
    await signInWithEmailAndPassword(auth, email.trim(), password);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

export async function logout() {
  await signOut(auth);
  currentProfile = null;
}

/**
 * Crea una cuenta de Authentication + su perfil en Firestore para un nuevo
 * guardia o administrador. Solo debe invocarse desde el panel de
 * Administración.
 *
 * Nota de seguridad importante (documentada también en el README):
 * Firebase Authentication no tiene, en el plan Spark, una forma de
 * restringir "quién puede crear una cuenta" desde el servidor sin usar
 * Cloud Functions (que requieren plan Blaze). Por eso esta función valida
 * el rol del lado del cliente como primera barrera, pero la protección
 * REAL es que el documento de perfil en `users/{uid}` -que es lo único que
 * permite iniciar sesión en la aplicación- solo lo puede crear un
 * administrador (regla de Firestore). Una cuenta de Authentication creada
 * sin ese documento de perfil queda inutilizable: al iniciar sesión, el
 * sistema la cierra automáticamente con el mensaje "no tiene un perfil
 * activo".
 */
export async function createStaffAccount({ name, email, tempPassword, role, lobby }) {
  if (!currentProfile || currentProfile.role !== "admin") {
    return { ok: false, message: "No tiene permisos para realizar esta acción." };
  }
  const secondaryAuth = getSecondaryAuth();
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email.trim(), tempPassword);
    const uid = cred.user.uid;
    await setDoc(doc(db, "users", uid), {
      name: name.trim(),
      email: email.trim(),
      role,
      lobby: lobby || null,
      active: true,
      createdAt: serverTimestamp(),
      createdBy: currentProfile.uid,
    });
    await signOut(secondaryAuth);
    return { ok: true, uid };
  } catch (err) {
    try {
      await signOut(secondaryAuth);
    } catch (_) {
      /* ignore */
    }
    return { ok: false, message: friendlyError(err) };
  }
}

/**
 * Administración → Usuarios: "en caso de pérdida" de contraseña, esta es la
 * única forma disponible sin pagar el plan Blaze de Firebase — el plan
 * gratuito (Spark) no permite que el administrador ESCRIBA directamente una
 * contraseña nueva para otra persona (eso requiere el SDK de administrador,
 * que solo corre en un servidor de pago). En su lugar, se envía un correo
 * con un enlace para que la propia persona elija una contraseña nueva. La
 * persona debe tener acceso a ese correo.
 */
export async function resetUserPassword(email) {
  if (!currentProfile || currentProfile.role !== "admin") {
    return { ok: false, message: "No tiene permisos para realizar esta acción." };
  }
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}

/**
 * "¿Olvidó su contraseña?" en la pantalla de inicio de sesión — a
 * diferencia de resetUserPassword() de arriba, esta SÍ debe poder llamarse
 * sin haber iniciado sesión (nadie tiene perfil todavía en ese momento), así
 * que no valida ningún rol. Envía el mismo correo de restablecimiento que
 * usa administración.
 */
export async function sendSelfPasswordReset(email) {
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyError(err) };
  }
}
