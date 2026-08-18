# Modelo de datos — Firestore

Este documento describe cada colección de Cloud Firestore que usa SEGURIDAD TPC. No necesitas
entender este archivo para usar la aplicación — es referencia técnica para quien mantenga el
código en el futuro (tú mismo, con la ayuda de esta guía, o un programador si algún día lo
contratas).

## Principios de diseño

- **Pocas lecturas, pocas escrituras.** El cronómetro de los parqueos NO escribe en Firestore
  cada segundo — solo se guarda la hora de entrada una vez, y el navegador calcula el tiempo
  transcurrido localmente.
- **Un solo listener en tiempo real "caro"**: la pantalla de Parqueos escucha la colección
  `parking_spaces` (solo 13 documentos). Es la única pantalla que de verdad necesita
  coordinación instantánea entre Lobby A y Lobby B. El resto de pantallas (paquetes, objetos,
  tarjetas, historial) consultan Firestore **bajo demanda** (cuando el guardia abre la pantalla
  o presiona "Actualizar"), no con un listener permanente.
- **Nunca se borra historial real.** Las correcciones se hacen con `update`, dejando rastro en
  `audit_logs`. Dos excepciones puntuales, ambas en `firestore.rules`:
  - Cualquier documento con `isDemo: true` (en `parking_sessions`, `packages`, `object_loans` y
    `access_items`) SÍ puede borrarlo un administrador — es lo que usa "Limpiar demostración" en
    Administración para no dejar basura de una presentación mezclada con datos reales. Un
    documento real (`isDemo` ausente o `false`) sigue sin poder borrarse nunca.
  - `objects` (el catálogo de objetos en préstamo) SÍ permite `delete` general para cualquier
    administrador, no solo demo — es una capacidad explícita para poder quitar objetos de la
    lista. Los préstamos ya hechos (`object_loans`) guardan `objectName` por su cuenta, así que el
    historial de préstamos se sigue leyendo bien aunque el objeto ya no exista.
- **El rol y el lobby del usuario viven en un documento `users/{uid}`**, no en "custom claims" de
  Firebase (eso requeriría Cloud Functions, que ya no están disponibles en el plan gratuito
  Spark). Las reglas de seguridad leen ese documento para decidir qué puede hacer cada persona.

## Colecciones

### `users/{uid}`
Perfil de cada persona que puede iniciar sesión. El ID del documento es el mismo UID que genera
Firebase Authentication.

| Campo | Tipo | Descripción |
|---|---|---|
| `name` | string | Nombre completo |
| `email` | string | Correo (igual al de Authentication) |
| `role` | string | `"admin"` o `"guard"` |
| `lobby` | string | `"A"`, `"B"` o `null` (para admins que no operan un lobby) |
| `active` | boolean | Si es `false`, la persona no puede usar el sistema aunque tenga login válido |
| `createdAt` / `createdBy` | timestamp / string | Auditoría de creación |
| `updatedAt` / `updatedBy` | timestamp / string | Auditoría de última edición |

### `settings/general` (documento único)
Configuración global editable solo por administración.

| Campo | Tipo | Descripción |
|---|---|---|
| `orgName` | string | "TORRES PASEO COLÓN" |
| `systemName` | string | "SEGURIDAD TPC" |
| `maxParkingMinutes` | number | Minutos permitidos antes de marcar un vehículo como excedido |
| `logoUrl` | string | Vacío hasta que se coloque el logo oficial (ver `icons/`) |
| `initialized` | boolean | Se pone en `true` la primera vez que el administrador ejecuta "Inicializar sistema" |

### `parking_spaces/{numero}` (documentos `01` … `13`)
Estado **actual** de cada espacio. Es lo único que la pantalla de Parqueos escucha en tiempo real.

| Campo | Tipo | Descripción |
|---|---|---|
| `number` | string | "01".."13" |
| `type` | string | `"visitor"`, `"disability"` o `"disabled"` (fuera de servicio) |
| `status` | string | `"free"` u `"occupied"` |
| `sessionId` | string\|null | ID del documento activo en `parking_sessions` mientras está ocupado |
| `visitorName`, `visitorId`, `plate`, `destinationType`, `destinationNumber` | string | Copia de los datos de la sesión activa, para no tener que leer dos colecciones en la pantalla principal |
| `entryAt` | timestamp\|null | Hora de entrada (el cronómetro se calcula en el navegador a partir de este valor) |
| `entryGuardName`, `entryLobby` | string | Quién registró la entrada |
| `maxMinutesAtEntry` | number\|null | Copia del límite vigente al momento de entrar, para saber en la propia pantalla si el vehículo está excedido sin tener que leer `settings` de nuevo |
| `updatedAt` | timestamp | Última modificación |

> Los campos `type` (y por lo tanto "discapacidad" o "deshabilitado") **solo** los puede cambiar
> un administrador. Los campos operativos (ocupar/liberar) los cambia el guardia. Esto se aplica
> con reglas de seguridad, no solo ocultando botones.

### `parking_sessions/{id}`
Historial permanente de cada entrada/salida. Nunca se borra.

| Campo | Tipo |
|---|---|
| `spaceNumber` | string |
| `status` | `"open"` \| `"closed"` |
| `visitorName`, `visitorId`, `plate` | string |
| `destinationType` | `"apartment"` \| `"office"` |
| `destinationNumber` | string |
| `entryAt` | timestamp |
| `entryGuardUid`, `entryGuardName`, `entryLobby` | string |
| `exitAt` | timestamp\|null |
| `exitGuardUid`, `exitGuardName`, `exitLobby` | string\|null |
| `durationMinutes` | number\|null |
| `maxMinutesAtEntry` | number (copia del límite vigente al momento de entrar, para que reportes históricos no cambien si el límite se ajusta después) |
| `corrected` | boolean |
| `correctionNote` | string (motivo, si un admin corrigió el registro) |

**Índices compuestos necesarios:** `status ASC, entryAt DESC` y `spaceNumber ASC, entryAt DESC`
(ya incluidos en `firestore.indexes.json`).

### `packages/{id}`
| Campo | Tipo |
|---|---|
| `apartment` | string |
| `recipientName` | string |
| `courier` | string |
| `trackingNumber` | string (opcional) |
| `notes` | string (opcional) |
| `status` | `"pending"` \| `"delivered"` |
| `createdAt`, `createdByUid`, `createdByName`, `lobby` | — |
| `deliveredAt`, `deliveredByUid`, `deliveredByName` | — |

### `objects/{id}` (catálogo de objetos en préstamo)
| Campo | Tipo |
|---|---|
| `name`, `category`, `identifier`, `description` | string |
| `totalQuantity`, `availableQuantity` | number |
| `active` | boolean (para dejar de ofrecerlo sin borrarlo; ver "Eliminar" para borrarlo del todo) |
| `createdAt/By`, `updatedAt/By` | — |

Administración puede tanto **desactivar** (`active: false`, se mantiene en el catálogo pero deja
de ofrecerse) como **eliminar** por completo (botón "Eliminar" en Administración → Objetos —
único borrado real permitido fuera de la demostración, ver "Principios de diseño").

### `object_loans/{id}`
| Campo | Tipo |
|---|---|
| `objectId`, `objectName` | string |
| `borrowerType` | `"resident"` \| `"concierge"` \| `"admin"` \| `"other"` |
| `borrowerName`, `apartment` | string |
| `status` | `"loaned"` \| `"returned"` |
| `loanedAt`, `loanedByUid`, `loanedByName`, `lobby` | — |
| `returnedAt`, `returnedByUid`, `returnedByName`, `returnObservations`, `returnCondition` | — |

### `access_items/{id}` (tarjetas y stickers)
| Campo | Tipo |
|---|---|
| `type` | `"card"` \| `"sticker"` \| `"other"` |
| `recipientName`, `apartment`, `tower`, `dropLobby` | string |
| `notes` | string |
| `status` | `"pending"` \| `"delivered"` |
| `createdAt`, `createdByUid`, `createdByName` (siempre admin) | — |
| `deliveredAt`, `deliveredByUid`, `deliveredByName`, `deliveredLobby` | — |

### `audit_logs/{id}` (inmutable — nadie puede editar ni borrar)
| Campo | Tipo |
|---|---|
| `userUid`, `userName`, `userRole` | string |
| `action` | string, ej. `"parking.entry"`, `"user.role_change"`, `"parking_session.correction"` |
| `targetCollection`, `targetId` | string |
| `details` | mapa libre (valores antes/después en correcciones) |
| `createdAt` | timestamp |

### `error_reports/{id}`
| Campo | Tipo |
|---|---|
| `reportedByUid`, `reportedByName`, `lobby` | string |
| `relatedCollection`, `relatedId` | string (opcional) |
| `description` | string |
| `status` | `"open"` \| `"resolved"` |
| `resolvedByUid`, `resolvedByName`, `resolvedAt`, `resolutionNotes` | — |

## Qué consume cuota de Firebase (plan Spark)

| Operación | Consume |
|---|---|
| Abrir la pantalla de Parqueos | 1 listener + 13 lecturas iniciales, luego 1 lectura por cada cambio que ocurra en cualquiera de los 13 espacios (en cualquier lobby) |
| Registrar entrada/salida | 2 escrituras (actualiza `parking_spaces` + crea/actualiza `parking_sessions`) + 1 escritura de auditoría |
| Abrir pantalla de Paquetes/Objetos/Tarjetas | 1 consulta puntual (no listener) cada vez que se abre o se presiona "Actualizar" |
| Cada verificación de permisos en las reglas de seguridad | 1 lectura del documento `users/{uid}` del usuario que hace la solicitud |

El plan Spark gratuito incluye, por día: 50,000 lecturas, 20,000 escrituras, 20,000 eliminaciones
y 1 GB de almacenamiento. Con 2 lobbies y un puñado de guardias, un condominio normal se queda
muy por debajo de esos límites. Aun así, **el plan gratuito no es garantía de uso ilimitado**: si
en el futuro se agregan muchos más listeners en tiempo real o se registran miles de operaciones
diarias, seria necesario revisar el consumo en la consola de Firebase (`Uso y facturación`).
