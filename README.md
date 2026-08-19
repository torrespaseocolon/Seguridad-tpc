# SEGURIDAD TPC — Torres Paseo Colón

Sistema interno de seguridad para el personal de Lobby A y Lobby B de Torres Paseo Colón:
control de parqueos de visita, paquetería, préstamo de objetos, tarjetas/stickers, historial
y auditoría. **No reemplaza HAC** — es una herramienta complementaria para las operaciones de
seguridad del condominio.

> ¿No sabes programar? No necesitas leer este archivo para instalar el sistema. Sigue en su
> lugar la guía [`docs/MANUAL_PUBLICACION.md`](docs/MANUAL_PUBLICACION.md), que explica todo
> paso a paso, con clics exactos, desde cero. Este README es la referencia técnica del proyecto.

## Qué hace el sistema

- 🅿️ **Parqueos**: 13 espacios de visita con entrada/salida, cronómetro, límite de tiempo
  configurable, espacios de discapacidad y coordinación en tiempo real entre Lobby A y Lobby B.
- 📦 **Paquetes**: registro y entrega con historial.
- 🧰 **Objetos**: catálogo administrado por administración (separado por lobby); préstamo y
  devolución por guardias.
- 🔍 **Objetos encontrados / perdidos**: cualquier guardia registra lo que encuentra (dónde y en
  qué estado); al entregarlo queda una bitácora con nombre y apartamento de quien lo retiró.
- 💳 **Tarjetas / Stickers**: administración los registra como pendientes; los guardias solo
  marcan la entrega, sin poder alterar los datos.
- 📋 **Actividad**: reportes de error y vista rápida de actividad reciente.
- 👨‍💼 **Administración**: panel con indicadores, usuarios, configuración de parqueos y objetos,
  reportes con exportación a CSV, auditoría y corrección controlada de errores.

## Tecnología

HTML, CSS y JavaScript "puro" (módulos ES nativos del navegador) — **sin React, sin Vue, sin
paso de compilación**. El SDK de Firebase se carga directamente desde el CDN de Google. Esto
significa que el proyecto se publica tal cual en GitHub Pages: no hace falta `npm install` ni
`npm run build` para nada, ni ahora ni al actualizarlo en el futuro.

Backend: **Firebase** (plan gratuito **Spark**) — Authentication (correo/contraseña) + Cloud
Firestore. No se usa Realtime Database (Firestore es suficiente y más barato para este caso) ni
Cloud Functions (dejaron de estar disponibles en el plan gratuito; ver más abajo cómo se resolvió
la creación de usuarios sin ellas).

## Estructura del proyecto

```
seguridad-tpc/
├── index.html                    Punto de entrada de toda la aplicación
├── manifest.json                 Configuración de la PWA (instalable)
├── service-worker.js             Caché para que la app abra sin conexión
├── firestore.rules               Reglas de seguridad (la protección REAL de los datos)
├── firestore.indexes.json        Índices compuestos que necesitan las consultas
├── src/
│   ├── firebase/
│   │   ├── firebase-config.example.js   Plantilla (sin claves reales)
│   │   ├── firebase-config.js           TU configuración real (la creas tú, no está en el repo aún)
│   │   └── firebase-init.js             Inicializa Firebase
│   ├── styles/
│   │   ├── variables.css        Paleta de colores, tipografía, espaciado (editar aquí para "skin")
│   │   └── main.css             Componentes reutilizables (botones, tarjetas, modales, etc.)
│   ├── utils/                   Funciones auxiliares (tiempo, DOM, errores, CSV, conexión)
│   ├── services/                Toda la lógica que habla con Firebase, separada por tema
│   ├── pages/                   Una pantalla por archivo (parqueos, paquetes, objetos...)
│   │   └── admin/                Pestañas del panel de Administración
│   ├── app.js                    Arranque de la aplicación (sesión, header, conexión)
│   └── router.js                 Navegación entre pantallas
├── icons/                        Ícono de la app (marcador temporal hasta tener el logo real)
└── docs/
    ├── MODELO_DE_DATOS.md         Referencia técnica de las colecciones de Firestore
    ├── MANUAL_PUBLICACION.md      Guía paso a paso para publicar el sistema desde cero
    ├── MANUAL_ADMINISTRADOR.md    Manual de uso para administración
    ├── MANUAL_GUARDIA.md          Manual de uso para guardias
    └── PRUEBAS.md                 Checklist de pruebas antes de usar el sistema en producción
```

## Instalación / desarrollo local

No requiere Node.js ni ningún gestor de paquetes. Solo necesitas un servidor local muy simple
porque los navegadores no permiten `import` de módulos ES desde un archivo abierto directamente
con doble clic (protocolo `file://`). Opciones:

- **Con Python** (viene instalado en muchos sistemas): `python -m http.server 8080` dentro de la
  carpeta del proyecto, y abre `http://localhost:8080`.
- **Con la extensión "Live Server" de VS Code**: clic derecho sobre `index.html` → "Open with
  Live Server".
- Cualquier otro servidor estático sirve igual de bien.

Antes de que la aplicación funcione necesitas configurar Firebase (ver
[`docs/MANUAL_PUBLICACION.md`](docs/MANUAL_PUBLICACION.md)) y copiar
`src/firebase/firebase-config.example.js` a `src/firebase/firebase-config.js` con tus valores
reales.

## Configuración de Firebase (resumen técnico)

La guía completa con clics exactos está en `docs/MANUAL_PUBLICACION.md`. Resumen para quien ya
conoce Firebase:

1. Crear proyecto en [console.firebase.google.com](https://console.firebase.google.com), plan
   Spark (gratuito).
2. Authentication → método "Correo electrónico/contraseña" habilitado. Sin registro público:
   las cuentas las crea un administrador desde el panel de Administración de esta app.
3. Firestore → crear base de datos en modo producción, región cercana (ej. `us-central` o la
   más cercana disponible a Costa Rica).
4. Publicar `firestore.rules` (Firestore → Reglas → pegar el contenido de `firestore.rules` de
   este repo → Publicar).
5. Crear los índices de `firestore.indexes.json` (Firestore los pedirá automáticamente la
   primera vez que una consulta los necesite, con un enlace directo para crearlos en un clic; o
   se pueden crear a mano en Firestore → Índices).
6. Copiar la configuración web (Configuración del proyecto → tus apps → SDK) a
   `src/firebase/firebase-config.js`.
7. Crear el primer usuario administrador **manualmente** en la consola (Authentication → Add
   user, y luego un documento en Firestore → colección `users` con ID = el UID de ese usuario,
   `role: "admin"`, `active: true`). A partir de ahí, ese administrador crea a todos los demás
   usuarios desde la propia aplicación (botón "Crear usuario" en Administración → Usuarios).

### ¿Por qué el primer administrador se crea a mano y no desde la app?

Porque la regla de seguridad que protege la colección `users` exige que quien **crea** un nuevo
usuario ya sea administrador. Si existiera una excepción para "el primer usuario", cualquier
persona podría aprovecharla para auto-nombrarse administrador. Crear ese primer registro a mano,
una sola vez, en la consola de Firebase (que solo tú puedes abrir) cierra esa puerta.

### Datos públicos vs. datos que deben protegerse

- `src/firebase/firebase-config.js` (apiKey, authDomain, etc.) **no es secreto** — así lo diseñó
  Firebase; viaja al navegador de cualquier visitante igual que el resto del código. Sí se sube
  a GitHub.
- Lo que sí protege los datos son **`firestore.rules`** (qué puede leer/escribir cada rol) y
  Firebase Authentication (quién puede iniciar sesión). Nunca se guardan contraseñas ni claves
  privadas de cuentas de servicio en este repositorio.

## Cómo funcionan los permisos (resumen)

Cada usuario tiene un documento `users/{uid}` con su `role` (`admin`, `guard` o `viewer` — solo
lectura, ve el Panel y Reportes de Administración sin poder operar nada) y su `lobby`. Las
reglas de `firestore.rules` leen ese documento en cada operación y deciden qué se permite. La
interfaz también oculta botones según el rol, pero **eso es solo comodidad visual**: la barrera
real está en las reglas, que se aplican en el servidor de Firebase sin importar qué haga alguien
desde las herramientas de desarrollador del navegador. Detalle completo, colección por colección,
en `firestore.rules` (está fuertemente comentado) y en `docs/MODELO_DE_DATOS.md`.

Caso especial: registrar entradas y salidas de **Parqueos** está restringido al guardia con
`lobby == 'B'` (o a un administrador) — es donde físicamente está la entrada real de los parqueos
de visita (ago-2026). El guardia de Lobby A queda en modo consulta en esa pantalla (ver estado,
avisar por WhatsApp, mostrar el QR), pero no puede registrar nada ahí.

## Consumo de Firebase (plan Spark)

Ver la tabla completa en `docs/MODELO_DE_DATOS.md`. Resumen de las decisiones de diseño para
mantenerse dentro del plan gratuito:

- El cronómetro de parqueos **nunca** escribe en Firestore cada segundo — se calcula en el
  navegador a partir de una sola hora de entrada guardada.
- Solo la pantalla de Parqueos usa un listener en tiempo real (13 documentos). Todas las demás
  pantallas consultan bajo demanda.
- Los contadores del panel de Administración usan `getCountFromServer`, que cuesta 1 lectura sin
  importar cuántos documentos existan, en vez de descargarlos todos para contarlos.
- El plan Spark incluye, por día: 50,000 lecturas, 20,000 escrituras, 20,000 eliminaciones y 1 GB
  de almacenamiento. **Esto no es una garantía de uso ilimitado**: si el condominio crece mucho o
  se agregan más pantallas en tiempo real en el futuro, hay que revisar el consumo real en
  Firebase Console → Uso y facturación.

## Estrategia offline

- Un Service Worker guarda en caché **solo los archivos propios de la app** (HTML/CSS/JS), para
  que la aplicación abra y muestre su interfaz aunque el dispositivo pierda la señal por un
  momento. **Nunca** cachea respuestas de Firebase.
- Firestore mantiene su propia caché local (`persistentLocalCache`, con `persistentMultipleTabManager`
  para que varias pestañas del mismo dispositivo — por ejemplo la app principal y una consulta
  abierta desde un QR — puedan compartir esa caché sin pisarse), lo que activa también su cola de
  escritura offline: cualquier `addDoc`/`updateDoc`/`setDoc`/`deleteDoc` hecho sin conexión queda
  guardado en el dispositivo de inmediato y se sincroniza solo en cuanto vuelve la señal.
- **Gotcha importante (ago-2026) — por qué existe `src/utils/offline-write.js`**: que el dato quede
  guardado localmente no significa que la *promesa* que devuelven `addDoc`/`updateDoc`/`setDoc`
  se resuelva rápido. Es comportamiento documentado del SDK: esa promesa solo se resuelve cuando el
  **servidor** confirma la escritura — sin conexión, esa confirmación nunca llega, así que un
  simple `await updateDoc(...)` se queda esperando indefinidamente aunque el dato ya esté a salvo
  en el dispositivo. Por eso todas las funciones de escritura de guardia (Parqueos, Paquetes,
  Objetos, Tarjetas, Objetos encontrados, y `logAudit`) usan `settle()` de
  `src/utils/offline-write.js`: corre la escritura real en paralelo con un límite de tiempo corto
  (3 segundos) y sigue adelante apenas pasa ese límite, sin esperar la confirmación del servidor —
  la escritura sigue su curso en segundo plano igual. Si escribís una función de escritura nueva,
  envolvé la llamada con `settle(...)` para que se beneficie de esto también.
- **Lo que sí tiene un límite técnico real** (no lo resuelve `settle()`): las consultas agregadas
  (`getCountFromServer`) y las transacciones (`runTransaction`) de Firestore **no pueden
  ejecutarse sin conexión** — ambas necesitan ida y vuelta al servidor, y no hay forma de que
  devuelvan un resultado "local" mientras tanto. Por eso Parqueos y Objetos (préstamo/devolución)
  dejaron de usarlas (ver más abajo).
- **Decisión histórica (ago-2026, ya superada) y su reemplazo actual**: originalmente no se
  habilitó offline para Parqueos porque, si Lobby A y Lobby B pudieran registrar entradas sin
  conexión, dos guardias podrían ocupar el mismo espacio sin que el sistema lo note hasta
  sincronizar. Esa razón dejó de aplicar cuando se restringió el registro de parqueos a un solo
  guardia (Lobby B) — ver "Cómo funcionan los permisos". De la misma forma, Objetos ahora separa
  su inventario por lobby (`objects.lobby`), así que un objeto solo lo toca el guardia de su
  propio lobby. En ambos casos se reemplazaron `getCountFromServer`/`runTransaction` por lecturas y
  escrituras simples (si funcionan offline), aceptando un riesgo pequeño y ya documentado en el
  código: si dos sesiones (por ejemplo el guardia y un administrador) tocaran el mismo recurso en
  el mismo instante estando ambos en línea, ya no hay una garantía atómica del servidor que lo
  impida — un caso raro en la operación real del condominio.

## Publicación en GitHub Pages

Ver `docs/MANUAL_PUBLICACION.md`, PASO 12-14. En resumen: como este proyecto no tiene paso de
compilación, "publicar" es simplemente subir la carpeta a un repositorio de GitHub y activar
GitHub Pages apuntando a la rama principal — no hay build ni carpeta `dist`.

## Actualizaciones futuras

Ver la sección "Actualizaciones futuras" de `docs/MANUAL_PUBLICACION.md` para instrucciones
exactas (qué archivo abrir, qué cambiar, qué no tocar) para: colores, logo, nombre del sistema,
parqueos, objetos, usuarios y funciones nuevas. Ninguna actualización de la interfaz borra datos
de Firebase — son sistemas independientes.

## Solución de problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| Pantalla en blanco al abrir | Falta `src/firebase/firebase-config.js` o tiene un error de sintaxis | Revisa que el archivo exista y compáralo con `firebase-config.example.js` |
| "No tiene permisos para realizar esta acción" | Las reglas de Firestore no se publicaron, o el usuario no tiene un documento en `users/` | Revisa Firestore → Reglas, y que exista `users/{uid}` con `active: true` |
| El login dice "no tiene un perfil activo" | Existe la cuenta de Authentication pero no su documento en `users/`, o `active` es `false` | Crea/activa el documento del usuario en Firestore o desde Administración → Usuarios |
| Los cambios que subo a GitHub no se ven publicados | GitHub Pages tarda uno o dos minutos, o el navegador muestra una copia en caché | Espera un minuto y recarga forzando la caché (Ctrl+Shift+R) |
| "Falta un índice" en la consola del navegador | Una consulta nueva necesita un índice compuesto que aún no existe | Firebase muestra un enlace directo en el error; ábrelo y pulsa "Crear índice" |

Más detalle y más errores comunes en `docs/MANUAL_PUBLICACION.md`, sección final.
