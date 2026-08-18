# Checklist de pruebas antes de usar el sistema en producción

Usa **datos ficticios** para todas estas pruebas (ver `docs/MANUAL_PUBLICACION.md`, PASO 23-26).
Nunca pruebes con nombres, cédulas o placas reales de visitantes. Marca cada casilla a medida que
la pruebes. Si algo falla, anota el paso exacto y revisa la sección "Errores comunes" del manual
antes de escribirle a soporte.

## Login / sesión
- [ ] Iniciar sesión con correo y contraseña correctos entra a la pantalla principal.
- [ ] Iniciar sesión con contraseña incorrecta muestra "Contraseña incorrecta" (no un error técnico).
- [ ] Iniciar sesión con un correo que no existe muestra un mensaje claro.
- [ ] Cerrar sesión regresa a la pantalla de login.
- [ ] Un usuario desactivado por administración no puede entrar (mensaje "no tiene un perfil activo").
- [ ] Al volver a abrir la app en el mismo dispositivo, la sesión sigue iniciada (no pide login otra vez).

## Parqueos
- [ ] Los 13 espacios se muestran correctamente numerados 01–13.
- [ ] Un parqueo libre muestra 🟢 LIBRE y permite registrar entrada.
- [ ] Registrar una entrada completa (nombre, cédula, placa, destino) marca el parqueo como 🔴 OCUPADO.
- [ ] El cronómetro del parqueo ocupado avanza cada segundo sin recargar la página.
- [ ] Un parqueo marcado como discapacidad muestra el ícono ♿ y el badge correspondiente.
- [ ] Un parqueo "fuera de servicio" no se puede seleccionar.
- [ ] Registrar salida pide confirmación antes de guardar.
- [ ] Después de la salida, el parqueo vuelve a 🟢 LIBRE inmediatamente.
- [ ] Bajando el límite de minutos en Administración y esperando (o editando manualmente una
      entrada antigua para pruebas), el parqueo muestra el aviso de excedido.
- [ ] Solo el guardia de **Lobby B** (o un administrador) puede tocar un parqueo 🟢 LIBRE para
      registrar una entrada; el guardia de Lobby A que toca un espacio libre ve un aviso de que
      no puede registrar ahí, y al tocar uno 🔴 OCUPADO solo ve información + botones de
      WhatsApp/QR, sin poder registrar la salida.
- [ ] Registrar una entrada desde Lobby B se ve reflejada de inmediato (sin recargar) en una
      sesión abierta en Lobby A.
- [ ] **Concurrencia (riesgo aceptado, ago-2026)**: si el guardia de Lobby B y un administrador
      intentan registrar entrada en el mismo parqueo casi al mismo tiempo estando ambos en línea,
      ya no hay una garantía atómica del servidor que lo evite (se quitó para poder registrar
      parqueos sin conexión) — es un caso raro, pero si ocurre, el último en escribir "gana" y
      puede quedar un registro huérfano; usar "Correcciones" para arreglarlo a mano.

## Paquetes
- [ ] Crear un paquete nuevo lo deja en estado PENDIENTE.
- [ ] El paquete aparece en la lista de pendientes.
- [ ] Marcar "ENTREGADO" pide confirmación y luego el paquete desaparece de la lista de pendientes.
- [ ] No es posible entregar el mismo paquete dos veces (probar recargando la lista después de entregarlo).

## Objetos y préstamos
- [ ] Un objeto creado por administración (con un Lobby asignado) aparece en "Disponibles" SOLO
      para el guardia de ese mismo lobby; un guardia del otro lobby no lo ve. Un administrador ve
      los de ambos lobbies.
- [ ] Prestar un objeto reduce en 1 la cantidad disponible.
- [ ] El objeto prestado aparece en la pestaña "Prestados" (visible para cualquier guardia, sin
      importar el lobby).
- [ ] Registrar la devolución aumenta en 1 la cantidad disponible y lo saca de "Prestados".
- [ ] Un objeto con 0 unidades disponibles no permite un nuevo préstamo.
- [ ] Desactivar un objeto desde Administración lo oculta de la lista de disponibles del guardia
      (pero no borra su historial de préstamos).
- [ ] Cambiar el Lobby de un objeto desde Administración → Objetos hace que deje de verlo el
      guardia del lobby anterior y empiece a verlo el del lobby nuevo.

## Objetos encontrados / perdidos
- [ ] Registrar un objeto encontrado (descripción, área, estado) lo deja PENDIENTE y visible para
      cualquier guardia, sin importar el lobby.
- [ ] Al entregarlo, el formulario exige el nombre de quien lo retira antes de dejar confirmar.
- [ ] Después de entregarlo, desaparece de la lista de pendientes; el reporte "Objetos encontrados"
      en Administración → Reportes muestra el nombre y apartamento de quien lo retiró (la
      bitácora).

## Tarjetas / Stickers
- [ ] Administración puede crear una tarjeta/sticker de prueba, queda PENDIENTE.
- [ ] El guardia ve el pendiente con todos sus datos, pero no puede editarlos.
- [ ] El guardia puede marcarlo como ENTREGADO (con confirmación).
- [ ] Aparece en el historial de Administración con quién y cuándo lo entregó.

## Administración
- [ ] El panel muestra correctamente parqueos ocupados/libres, paquetes y objetos pendientes.
- [ ] Se puede crear un usuario nuevo (guardia) y ese usuario puede iniciar sesión de inmediato.
- [ ] Se puede cambiar el lobby y el rol de un usuario existente.
- [ ] Se puede desactivar un usuario y verificar que ya no puede iniciar sesión.
- [ ] Los reportes muestran datos y el botón "Exportar CSV" descarga un archivo abrible en Excel.
- [ ] La pestaña de Auditoría (dentro del panel, sección "Panel"/actividad reciente) refleja las
      acciones recién realizadas.
- [ ] Un reporte de error enviado por un guardia aparece en "Correcciones" y se puede marcar como resuelto.

## Conectividad
- [ ] Al desconectar el Wi-Fi/datos del dispositivo, el indicador cambia a 🔴 SIN CONEXIÓN y
      aparece la franja roja superior.
- [ ] Al reconectar, el indicador vuelve a 🟢 CONECTADO sin necesidad de recargar la página.
- [ ] Con el dispositivo sin conexión, registrar un paquete/tarjeta/objeto/entrada de parqueo
      (Lobby B) muestra el mensaje de éxito igual que en línea. Al reconectar, el registro aparece
      en la base de datos (revisar en Firebase Console → Firestore, o que otro dispositivo ya
      conectado lo vea aparecer).

## Seguridad (importante — probar antes de usar el sistema con datos reales)
Estas pruebas confirman que la protección real está en Firebase y no solo en la interfaz.

- [ ] Iniciar sesión como **guardia** y, desde las herramientas de desarrollador del navegador
      (F12 → pestaña "Consola"), intentar escribir directamente en Firestore para cambiar su
      propio rol a `admin` — debe fallar con "Missing or insufficient permissions".
- [ ] Como guardia, intentar modificar el `type` de un `parking_spaces` (por ejemplo marcarlo
      como discapacidad) — debe fallar.
- [ ] Como guardia, intentar crear un documento en `access_items` (tarjeta/sticker) — debe fallar
      (solo administración puede crearlos).
- [ ] Como guardia, intentar leer la colección `audit_logs` — debe fallar (solo administración
      puede leerla).
- [ ] Como guardia, intentar borrar un documento de `parking_sessions` — debe fallar siempre
      (nadie puede borrar historial, ni admin ni guardia).
- [ ] Como guardia de **Lobby A**, intentar registrar una entrada de parqueo (crear un documento
      en `parking_sessions`) — debe fallar (solo Lobby B o admin).
- [ ] Como guardia de **Lobby A**, intentar prestar (crear `object_loans`) un objeto que pertenece
      a Lobby B — debe fallar.
- [ ] Confirmar en Firebase Console que las reglas publicadas coinciden exactamente con el
      archivo `firestore.rules` de este repositorio.

> Cómo hacer estas pruebas sin saber programación: inicia sesión como guardia, presiona F12,
> ve a la pestaña "Console", y pide ayuda puntual (a esta misma conversación de Claude, o a
> cualquier persona con conocimientos técnicos) para pegar el pequeño comando de prueba. El
> resultado esperado siempre es un error de permisos — si en cambio la operación tiene éxito,
> hay un problema en `firestore.rules` que debe corregirse antes de usar el sistema con datos
> reales.

## PWA
- [ ] En un teléfono, el navegador ofrece "Instalar aplicación" / "Agregar a pantalla de inicio".
- [ ] La app instalada abre en pantalla completa, sin la barra de direcciones del navegador.
- [ ] La app instalada muestra el nombre "SEGURIDAD TPC".
