# Manual de publicación — SEGURIDAD TPC

**Para quien nunca ha usado GitHub ni Firebase.** Empezamos asumiendo que no tienes absolutamente
nada configurado. Sigue los pasos en orden, sin saltarte ninguno. Cada paso indica: qué página
abrir, qué botón presionar, qué escribir, qué debería aparecer, y qué hacer si algo sale mal.

Guarda en un lugar seguro (un documento aparte, no en este repositorio) las contraseñas que vayas
creando durante este proceso.

---

## PASO 1 — Crear cuenta de GitHub

GitHub es el sitio donde va a vivir el código de la aplicación, y desde donde se va a publicar
gratis con "GitHub Pages".

1. Abre `https://github.com` en tu navegador.
2. Presiona el botón **Sign up** (arriba a la derecha).
3. Escribe tu correo, crea una contraseña, y elige un nombre de usuario (por ejemplo
   `torrespaseocolon` o el que prefieras — este nombre aparecerá en la dirección web final).
4. Resuelve la verificación que te pida (puzzle o código) y confirma tu correo (te llega un
   código a tu bandeja de entrada — cópialo donde te lo pida GitHub).
5. **Qué debería aparecer:** entras automáticamente a tu panel de GitHub ("GitHub Dashboard").

**Si algo sale mal:** si dice que el nombre de usuario ya existe, prueba otro (por ejemplo
agregando un número). Si el correo de verificación no llega en unos minutos, revisa la carpeta de
spam.

---

## PASO 2 — Crear el repositorio

Un "repositorio" es simplemente la carpeta del proyecto dentro de GitHub.

1. Ya con sesión iniciada en GitHub, presiona el botón verde **New** (o el ícono **+** arriba a
   la derecha → **New repository**).
2. **Repository name:** escribe `seguridad-tpc`.
3. Marca la opción **Public** (debe ser público para que GitHub Pages funcione gratis).
4. NO marques "Add a README file" (nosotros ya tenemos uno).
5. Presiona **Create repository**.
6. **Qué debería aparecer:** una página con instrucciones de Git y una dirección como
   `https://github.com/TU-USUARIO/seguridad-tpc`. Anota esa dirección.

---

## PASO 3 — Crear cuenta de Firebase

Firebase es el servicio de Google que va a guardar los datos (parqueos, paquetes, usuarios,
etc.) y va a manejar los inicios de sesión.

1. Abre `https://console.firebase.google.com`.
2. Inicia sesión con una cuenta de Google (Gmail). Si no tienes una, créala primero en
   `https://accounts.google.com/signup`. Se recomienda usar (o crear) una cuenta de Google que
   pertenezca a la administración del condominio, no una personal, para que el proyecto no quede
   atado a una sola persona.
3. **Qué debería aparecer:** la pantalla principal de Firebase Console, con un botón para crear
   un proyecto.

---

## PASO 4 — Crear el proyecto de Firebase

1. Presiona **Crear un proyecto** (o **Add project**).
2. **Nombre del proyecto:** escribe `seguridad-tpc` (Firebase le agregará automáticamente un
   identificador único al final, algo como `seguridad-tpc-a1b2c`; no importa, es normal).
3. Firebase preguntará sobre Google Analytics — puedes **desactivarlo** (no lo necesitamos, y así
   evitas configuración extra). Desmarca la casilla si aparece marcada.
4. Presiona **Crear proyecto** y espera unos segundos a que termine.
5. **Qué debería aparecer:** "Tu nuevo proyecto ya está listo" → presiona **Continuar**.

---

## PASO 5 — Confirmar el plan Spark (gratuito)

Todo proyecto de Firebase nuevo empieza en el plan **Spark**, que es gratuito. No necesitas hacer
nada especial para "elegirlo" — solo confirmar que NO lo cambies a "Blaze" (de pago) más adelante.

1. En el menú izquierdo de Firebase Console, abajo del todo, verás el nombre del plan actual
   (`Spark`).
2. No presiones ningún botón de "Actualizar" / "Upgrade" durante todo este proceso. Este proyecto
   está diseñado para funcionar completo en Spark.

**Nota:** si en algún momento Firebase te pide pasar a Blaze para activar algo, **detente y no lo
actives** — ninguna función de esta aplicación lo necesita. Si ves ese mensaje, probablemente
estás en una pantalla que no vas a usar (como Cloud Functions o Storage), así que simplemente
sal de ahí.

---

## PASO 6 — Configurar Authentication

1. En el menú izquierdo, presiona **Compilación** (Build) → **Authentication**.
2. Presiona **Comenzar** (Get started).
3. En la lista de proveedores, presiona **Correo electrónico/contraseña** (Email/Password).
4. Activa el interruptor de **Correo electrónico/contraseña** (el primero de los dos). El segundo
   interruptor ("Vínculo de correo electrónico") déjalo desactivado.
5. Presiona **Guardar**.
6. **Qué debería aparecer:** en la pestaña "Sign-in method", "Correo electrónico/contraseña"
   aparece como "Habilitado".

**Importante:** no actives "registro público" en ninguna parte de la app — no existe esa opción
en este sistema a propósito. Las cuentas solo las crea un administrador desde dentro de la
aplicación (o, la primera vez, tú mismo desde esta consola en el PASO 15).

---

## PASO 7 — Crear Cloud Firestore

1. En el menú izquierdo, presiona **Compilación** → **Firestore Database**.
2. Presiona **Crear base de datos** (Create database).
3. Elige **Modo de producción** (Production mode) — esto empieza con todo bloqueado hasta que
   publiquemos nuestras propias reglas en el PASO 8. Presiona **Siguiente**.
4. **Ubicación (location):** elige la región disponible más cercana a Costa Rica (por ejemplo
   `us-central1` o `southamerica-east1`, según lo que te ofrezca la lista — cualquiera de las
   más cercanas funciona bien). **Esta elección no se puede cambiar después**, así que revísala
   antes de continuar.
5. Presiona **Habilitar** (Enable) y espera a que se cree.
6. **Qué debería aparecer:** la pantalla de Firestore con una tabla vacía y una pestaña
   "Reglas" arriba.

---

## PASO 8 — Configurar las reglas de seguridad

1. Dentro de Firestore, presiona la pestaña **Reglas** (Rules).
2. Verás un editor de texto con unas reglas de ejemplo. Selecciona todo el contenido (Ctrl+A
   dentro del editor) y bórralo.
3. Abre el archivo `firestore.rules` de este proyecto (en tu computadora, con el Bloc de notas o
   cualquier editor de texto), selecciona todo su contenido, cópialo, y pégalo en el editor de
   reglas de Firebase.
4. Presiona **Publicar** (Publish).
5. **Qué debería aparecer:** un mensaje de confirmación tipo "Reglas publicadas correctamente" y
   la fecha/hora de la última publicación se actualiza.

**Si aparece un error de sintaxis:** revisa que copiaste el archivo completo, desde la primera
línea (`rules_version = '2';`) hasta la última llave de cierre `}`. No agregues ni quites nada.

---

## PASO 9 — Planificar los usuarios (sin crearlos todavía)

Antes de seguir, anota en un papel o documento aparte la lista de personas que van a usar el
sistema: nombre completo, correo, rol (Administrador o Guardia) y lobby asignado (A, B, o
ninguno para administración). Los vas a crear de verdad en el **PASO 15** y **PASO 16**, una vez
la aplicación esté publicada — aquí solo se trata de tenerlos listos.

---

## PASO 10 — Copiar la configuración de Firebase

1. En Firebase Console, presiona el ícono de **engranaje** (⚙️) junto a "Descripción general del
   proyecto" (arriba a la izquierda) → **Configuración del proyecto**.
2. Baja hasta la sección **Tus apps**. Presiona el ícono **</>** (Web) para agregar una app web.
3. **Apodo de la app:** escribe `seguridad-tpc-web`. NO marques "También configurar Firebase
   Hosting" (usamos GitHub Pages en su lugar).
4. Presiona **Registrar app**.
5. Firebase te muestra un bloque de código con `const firebaseConfig = { ... }`. **Copia
   únicamente ese objeto** (desde `{` hasta `}`, con los valores de `apiKey`, `authDomain`,
   `projectId`, `storageBucket`, `messagingSenderId` y `appId`).
6. Presiona **Continuar en la consola** (no necesitas seguir las instrucciones de instalación que
   te muestra ahí — ya están resueltas en este proyecto).

---

## PASO 11 — Colocar la configuración en el proyecto

1. En tu computadora, dentro de la carpeta del proyecto, ve a `src/firebase/`.
2. Haz una copia del archivo `firebase-config.example.js` y renómbrala a `firebase-config.js`
   (en la misma carpeta).
3. Abre `firebase-config.js` con el Bloc de notas (o cualquier editor de texto).
4. Reemplaza los valores de ejemplo por los que copiaste en el PASO 10. Al final debe verse así
   (con tus valores reales, no estos):

   ```js
   export const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "seguridad-tpc-a1b2c.firebaseapp.com",
     projectId: "seguridad-tpc-a1b2c",
     storageBucket: "seguridad-tpc-a1b2c.appspot.com",
     messagingSenderId: "123456789",
     appId: "1:123456789:web:abcdef",
   };
   ```
5. Guarda el archivo.

**Importante:** no cambies el nombre `firebaseConfig`, ni la palabra `export`, ni las comillas.
Solo reemplaza lo que está entre comillas.

---

## PASO 12 — Subir los archivos a GitHub

No necesitas saber usar Git por línea de comandos. La forma más sencilla:

1. Ve a tu repositorio en GitHub (`https://github.com/TU-USUARIO/seguridad-tpc`).
2. Presiona **Add file** → **Upload files**.
3. En tu computadora, abre la carpeta del proyecto `seguridad-tpc`, selecciona **todo su
   contenido** (todos los archivos y carpetas: `index.html`, `manifest.json`,
   `service-worker.js`, `firestore.rules`, `firestore.indexes.json`, `README.md`, las carpetas
   `src/`, `icons/`, `docs/`, etc.) y arrástralo a la zona de GitHub que dice "Drag files here".
4. Espera a que termine de cargar (la barra de progreso debe llegar al 100% para cada archivo).
5. Abajo, en "Commit changes", escribe un mensaje corto como `Primera publicación` y presiona
   **Commit changes**.
6. **Qué debería aparecer:** la lista de archivos de tu repositorio ahora muestra todas las
   carpetas (`src`, `icons`, `docs`) y archivos del proyecto.

**Si aparece un error:** GitHub a veces no permite arrastrar carpetas completas desde ciertos
navegadores. Si eso pasa, sube primero los archivos sueltos de la raíz, y luego entra a "Add
file → Create new file" y escribe la ruta completa (por ejemplo `src/app.js`) para crear cada
archivo dentro de su carpeta, pegando el contenido — es más lento pero siempre funciona. Como
alternativa más rápida, se recomienda usar la app de escritorio gratuita **GitHub Desktop**
(`https://desktop.github.com`), que permite arrastrar toda la carpeta del proyecto de una vez.

---

## PASO 13 — Activar GitHub Pages

1. En tu repositorio de GitHub, presiona la pestaña **Settings**.
2. En el menú izquierdo, presiona **Pages**.
3. En "Build and deployment" → "Source", elige **Deploy from a branch**.
4. En "Branch", elige **main** (o `master`, según cómo se llame la tuya) y la carpeta **/ (root)**.
5. Presiona **Save**.
6. **Qué debería aparecer:** un mensaje "Your site is live at..." con una dirección como
   `https://TU-USUARIO.github.io/seguridad-tpc/`. Puede tardar 1-2 minutos en activarse la
   primera vez.

---

## PASO 14 — Abrir la página publicada

1. Espera 1-2 minutos después del PASO 13.
2. Abre en tu navegador la dirección que te dio GitHub Pages (por ejemplo
   `https://TU-USUARIO.github.io/seguridad-tpc/`).
3. **Qué debería aparecer:** la pantalla de inicio de sesión de SEGURIDAD TPC, con el marcador
   "LOGO TPC" y los campos de correo y contraseña. Todavía no puedes entrar porque no existe
   ningún usuario — eso es lo siguiente.

**Si aparece una pantalla en blanco:** abre las herramientas de desarrollador (F12) → pestaña
"Console" y busca un mensaje en rojo. Si dice algo sobre `firebase-config.js`, revisa el PASO 11.
Si no ves ningún error claro, espera un par de minutos más (GitHub Pages a veces tarda) y recarga
con Ctrl+Shift+R.

---

## PASO 15 — Crear el primer administrador

Este es el único usuario que se crea manualmente en Firebase (todos los siguientes se crean desde
dentro de la propia aplicación).

1. En Firebase Console → **Authentication** → pestaña **Users** → presiona **Add user**.
2. Escribe el correo y una contraseña (mínimo 6 caracteres) para el primer administrador.
   Presiona **Add user**.
3. En la lista de usuarios aparece la nueva cuenta. Presiona sobre ella y **copia su "User UID"**
   (una cadena larga de letras y números) — lo vas a necesitar en el siguiente paso.
4. Ve a **Firestore Database** → pestaña **Datos** (Data) → presiona **Iniciar colección**
   (Start collection).
5. **ID de la colección:** escribe `users` exactamente así, en minúscula. Presiona **Siguiente**.
6. **ID del documento:** pega el "User UID" que copiaste en el paso 3 (NO uses "ID automático").
7. Agrega estos campos, uno por uno, con el botón **Agregar campo**:

   | Campo | Tipo | Valor |
   |---|---|---|
   | `name` | string | El nombre completo del administrador |
   | `email` | string | El mismo correo que usaste en el paso 2 |
   | `role` | string | `admin` |
   | `lobby` | string | (déjalo vacío o escribe `null` como texto solo si el editor lo pide como string; si el editor de Firestore te permite el tipo "null", mejor úsalo) |
   | `active` | boolean | `true` |

8. Presiona **Guardar**.
9. **Qué debería aparecer:** un documento dentro de la colección `users` con esos 5 campos.
10. Vuelve a la aplicación publicada (PASO 14) e inicia sesión con ese correo y contraseña.
    **Qué debería aparecer:** la pantalla principal con tu nombre, "Administrador", y el botón
    "👨‍💼 Administración" visible.

**Si dice "no tiene un perfil activo":** revisa que el ID del documento en `users` sea EXACTAMENTE
igual al "User UID" (sin espacios), y que `active` sea `true` (booleano, no el texto "true").

---

## PASO 16 — Crear los guardas

Ahora que ya iniciaste sesión como administrador, todo lo demás se hace desde la aplicación:

1. En la pantalla principal, presiona **👨‍💼 Administración** → pestaña **Usuarios**.
2. Presiona **+ CREAR USUARIO**.
3. Completa nombre, correo, una contraseña temporal, rol **Guardia**, y el lobby (**A** o **B**).
4. Presiona **CREAR USUARIO**.
5. **Qué debería aparecer:** un mensaje de éxito y el nuevo guardia en la lista de Usuarios.
   Comunícale el correo y la contraseña temporal en persona (no por un medio inseguro).
6. Repite para cada guardia de tu lista del PASO 9.

---

## PASO 17 y PASO 18 — Configurar Lobby A y Lobby B

Los lobbies no requieren una pantalla de configuración separada: se asignan por usuario.

1. En **Administración → Usuarios**, para cada guardia elige su lobby (**A** o **B**) en el
   selector correspondiente y presiona **Guardar cambios**.
2. **Qué debería aparecer:** al iniciar sesión, ese guardia verá automáticamente "Lobby A" o
   "Lobby B" en su encabezado, sin tener que elegirlo cada vez.

---

## PASO 19 y PASO 20 — Configurar los 13 parqueos (12 y 13 como discapacidad)

1. Presiona **Administración → Parqueos**.
2. Si es la primera vez, verás un botón **INICIALIZAR SISTEMA** — presiónalo. Esto crea
   automáticamente los 13 espacios (con el 12 y el 13 ya marcados como discapacidad) y la
   configuración general.
3. **Qué debería aparecer:** una lista de "Parqueo 01" a "Parqueo 13", todos "LIBRE", con un
   selector de tipo junto a cada uno.
4. Revisa que el Parqueo 12 y el Parqueo 13 tengan el tipo **♿ Discapacidad** seleccionado. Si
   necesitas cambiar cuáles son de discapacidad en el futuro, hazlo aquí mismo: elige el tipo en
   el selector y presiona **Guardar**.
5. También en esta pantalla puedes ajustar el **Tiempo máximo permitido** (en minutos).

---

## PASO 21 — Crear objetos

1. Presiona **Administración → Objetos**.
2. Presiona **+ CREAR OBJETO**.
3. Completa nombre (ej. "Silla de ruedas"), categoría, identificador opcional, cantidad y
   descripción.
4. Presiona **CREAR OBJETO**.
5. **Qué debería aparecer:** el objeto en la lista, con "Disponibles: N / N".
6. Repite para cada objeto que el condominio preste (carretilla, linternas, herramientas, etc.).

---

## PASO 22 — Crear una tarjeta de prueba

1. Presiona **Administración → Tarjetas/Stickers**.
2. Presiona **+ REGISTRAR TARJETA / STICKER**.
3. Usa datos ficticios (ver PASO 23 sobre datos de prueba): tipo "Tarjeta de acceso", nombre
   "Prueba Prueba", apartamento "000", lobby A.
4. Presiona **REGISTRAR**.
5. **Qué debería aparecer:** la tarjeta en la lista con estado PENDIENTE.

---

## PASO 23 — Prueba de parqueo (con datos ficticios)

**Nunca uses datos reales de visitantes durante las pruebas.** Usa algo como: nombre "Juan
Pérez", cédula "0-0000-0000", placa "ABC123", apartamento "804".

1. Cierra sesión de administrador e inicia sesión con una cuenta de guardia (o usa la misma
   sesión de admin si le asignaste un lobby).
2. Presiona **🅿️ Parqueos** → elige un espacio 🟢 LIBRE → completa el formulario con los datos
   ficticios de arriba → **REGISTRAR ENTRADA**.
3. **Qué debería aparecer:** el parqueo pasa a 🔴 OCUPADO con un cronómetro corriendo.
4. Vuelve a entrar a ese mismo parqueo, revisa los datos, y presiona **REGISTRAR SALIDA** (con
   confirmación).
5. **Qué debería aparecer:** el parqueo vuelve a 🟢 LIBRE de inmediato.

Checklist más detallado (incluyendo pruebas con dos dispositivos a la vez) en `docs/PRUEBAS.md`.

---

## PASO 24 — Prueba de paquetes

1. Presiona **📦 Paquetes** → **+ NUEVO PAQUETE** → completa con datos ficticios → **REGISTRAR
   PAQUETE**.
2. **Qué debería aparecer:** el paquete en la lista, PENDIENTE.
3. Presiona **ENTREGADO** en esa tarjeta, confirma.
4. **Qué debería aparecer:** el paquete desaparece de la lista de pendientes.

---

## PASO 25 — Prueba de préstamos

1. Presiona **🧰 Objetos** → pestaña **Disponibles** → elige el objeto que creaste en el PASO 21
   → **PRESTAR** → completa con datos ficticios → **REGISTRAR PRÉSTAMO**.
2. **Qué debería aparecer:** la cantidad disponible del objeto baja en 1.
3. Ve a la pestaña **Prestados**, presiona **REGISTRAR DEVOLUCIÓN**, confirma.
4. **Qué debería aparecer:** la cantidad disponible vuelve a subir en 1.

---

## PASO 26 — Prueba de tarjetas

1. Presiona **💳 Tarjetas / Stickers**.
2. Busca la tarjeta de prueba que creaste en el PASO 22, presiona **ENTREGADO**, confirma.
3. **Qué debería aparecer:** desaparece de los pendientes del guardia y en Administración
   aparece como ENTREGADO, con quién y cuándo la entregó.

---

## PASO 27 — Comprobar permisos

1. Inicia sesión con una cuenta de **guardia**.
2. Confirma que el botón "👨‍💼 Administración" **no aparece** en su pantalla principal.
3. Confirma que en "Tarjetas/Stickers" el guardia solo ve el botón "ENTREGADO", sin poder editar
   nombre/apartamento/torre.
4. Para la prueba técnica más estricta (que confirma que la protección es real y no solo
   visual), sigue la sección "Seguridad" de `docs/PRUEBAS.md`.

---

## PASO 28 — Comprobar actualización en tiempo real

1. Abre la aplicación en dos navegadores o dispositivos distintos, con dos sesiones de guardia
   (una en Lobby A, otra en Lobby B, si tienes ambas cuentas creadas).
2. En uno, registra la entrada de un vehículo de prueba en cualquier parqueo.
3. **Qué debería aparecer:** en el otro dispositivo, sin recargar la página, ese mismo parqueo
   cambia a 🔴 OCUPADO en cuestión de segundos.

---

## PASO 29 — Comprobar seguridad

Sigue completa la sección **"Seguridad"** de `docs/PRUEBAS.md` antes de usar el sistema con datos
reales de residentes y visitantes. No omitas este paso.

---

## PASO 30 — Instalar la PWA (opcional)

1. Abre la dirección publicada de la app en el navegador de un teléfono (Chrome en Android o
   Safari en iPhone).
2. **Android (Chrome):** presiona el menú (⋮) → **Instalar aplicación** (o aparece un banner
   automático "Agregar SEGURIDAD TPC a la pantalla de inicio").
3. **iPhone (Safari):** presiona el botón de compartir (□↑) → **Agregar a pantalla de inicio**.
4. **Qué debería aparecer:** un ícono "SEGURIDAD TPC" en la pantalla de inicio del teléfono, que
   abre la app en pantalla completa (sin la barra de direcciones del navegador).

---

# Actualizaciones futuras

La aplicación no tiene paso de compilación: para publicar un cambio, edita el archivo
correspondiente y vuelve a subirlo a GitHub (Add file → Upload files, sobrescribiendo el archivo
existente, o edítalo directamente en GitHub con el lápiz ✏️ que aparece al abrir cualquier
archivo del repositorio). **Ningún cambio de estos borra datos de Firebase** — la interfaz y la
base de datos son sistemas completamente separados.

| Quiero cambiar... | Abre este archivo | Qué buscar / cambiar | Qué NO tocar |
|---|---|---|---|
| Colores | `src/styles/variables.css` | Los valores como `#2f6690` junto a cada `--color-...` | Los nombres de las variables (`--color-primary`, etc.) — otros archivos los usan por nombre |
| Logo | `icons/logo-placeholder.svg` (o agrega `icons/icon-192.png` e `icons/icon-512.png`) | Reemplaza el archivo por el logo oficial (mismo nombre, o actualiza las rutas en `index.html` y `manifest.json`) | El tamaño recomendado es cuadrado, mínimo 512×512 px |
| Nombre del sistema | `index.html` (`<title>`) y `manifest.json` (`name`, `short_name`) | El texto entre comillas | La estructura del JSON en `manifest.json` (comas, llaves) |
| Parqueos (tipo, discapacidad) | Dentro de la app: **Administración → Parqueos** | No requiere editar código | — |
| Tiempo máximo | Dentro de la app: **Administración → Parqueos** | No requiere editar código | — |
| Objetos | Dentro de la app: **Administración → Objetos** | No requiere editar código | — |
| Usuarios | Dentro de la app: **Administración → Usuarios** | No requiere editar código | — |
| Funciones nuevas | Depende de la función — pide ayuda técnica puntual | — | `firestore.rules` sin entender bien el cambio (puede abrir una brecha de seguridad) |

Después de subir cualquier cambio a GitHub, espera 1-2 minutos y recarga la página publicada con
Ctrl+Shift+R (fuerza que el navegador descargue la versión nueva en vez de usar una copia
guardada). Si cambiaste archivos que el Service Worker cachea (`index.html`, los `.css`),
incrementa también el número `CACHE_NAME` en `service-worker.js` (por ejemplo, de
`"seguridad-tpc-v1"` a `"seguridad-tpc-v2"`) para que los teléfonos con la app instalada como PWA
descarguen la versión nueva.

---

# Errores comunes (resumen rápido)

| Mensaje o síntoma | Qué significa | Qué hacer |
|---|---|---|
| Pantalla en blanco | Falta o está mal escrito `src/firebase/firebase-config.js` | Revisa el PASO 11 |
| "No tiene permisos para realizar esta acción" | Las reglas no están publicadas o el usuario no es del rol correcto | Revisa el PASO 8 y el rol del usuario en Firestore → `users` |
| "No tiene un perfil activo" al iniciar sesión | Existe la cuenta de Authentication pero no su documento en `users`, o `active` es `false` | Revisa el PASO 15 o actívalo desde Administración → Usuarios |
| "Este parqueo acaba de ser ocupado por otro usuario" | Dos guardias intentaron ocupar el mismo espacio a la vez — el sistema funcionó correctamente, solo uno tiene éxito | Elige otro espacio |
| "Falta un índice" (en la consola del navegador, F12) | Una consulta nueva necesita un índice que aún no existe | Abre el enlace que Firebase muestra en el mismo mensaje de error y presiona "Crear índice"; espera 1-2 minutos |
| Los cambios subidos a GitHub no se ven | Caché del navegador o GitHub Pages aún desplegando | Espera 1-2 minutos, Ctrl+Shift+R |
| "auth/too-many-requests" | Demasiados intentos de inicio de sesión seguidos | Espera unos minutos antes de reintentar |
