# Manual de uso — Administrador

## Iniciar sesión
Abre la dirección de la aplicación, escribe tu correo y contraseña, presiona **INICIAR SESIÓN**.
Verás tu nombre, "Administrador", tu lobby (si tienes uno asignado) y el estado de conexión en la
parte superior.

## Crear usuarios
**Administración → Usuarios → + CREAR USUARIO.** Completa nombre, correo, una contraseña
temporal (mínimo 6 caracteres), rol y lobby. Entrégale el correo y la contraseña a la persona en
privado. Puede cambiarla luego desde la pantalla de inicio de sesión (función "olvidé mi
contraseña" — si no está visible, contáctame para agregarla en una futura actualización).

Los roles disponibles son:
- **Administrador**: acceso completo, incluyendo Usuarios y configuración.
- **Guardia**: solo las pantallas operativas (Parqueos, Paquetes, Objetos, Tarjetas/Stickers,
  Actividad) del lobby que se le asigne.
- **Solo lectura**: pensado para junta directiva u otras personas que solo necesitan ver el Panel
  y los Reportes, sin poder operar nada (ni siquiera puede abrir Parqueos, Paquetes, etc.). No
  necesita lobby asignado.

## Asignar o cambiar el lobby de un guardia
**Administración → Usuarios**, elige el lobby en el selector junto al usuario, presiona **Guardar
cambios**. El guardia lo verá reflejado automáticamente la próxima vez que use la app, sin tener
que elegirlo.

## Desactivar un usuario
**Administración → Usuarios → Desactivar** (junto al usuario). Un usuario desactivado no puede
iniciar sesión, pero su historial de acciones pasadas se conserva íntegro. Para reactivarlo,
presiona **Activar**.

## Configurar parqueos
**Administración → Parqueos.** Cambia el tipo de cada espacio (Visitante / ♿ Discapacidad / Fuera
de servicio) con el selector y presiona **Guardar**. El **Tiempo máximo permitido** se ajusta en
la parte superior de la misma pantalla.

## Marcar parqueos de discapacidad
Es el mismo procedimiento que "Configurar parqueos": elige **♿ Discapacidad** en el tipo del
espacio correspondiente.

## Crear, desactivar y eliminar objetos
**Administración → Objetos → + CREAR OBJETO.** Además del nombre y la cantidad, tenés que elegir a
qué **Lobby** pertenece: cada objeto vive en el inventario de un solo lobby, y solo el guardia de
ese lobby puede prestarlo (vos, como administrador, podés prestar cualquiera). Para ajustar la
cantidad total o cambiar el lobby de un objeto ya creado, cambia el valor correspondiente y
presiona **Guardar cambios**. Para retirar temporalmente un objeto sin perder su historial de
préstamos, usa **Desactivar**; para quitarlo del todo del catálogo, usa **Eliminar** (los
préstamos ya hechos con ese objeto conservan su nombre en el historial, así que no se pierde
trazabilidad).

## Crear tarjetas y stickers
**Administración → Tarjetas/Stickers → + REGISTRAR TARJETA / STICKER.** Completa tipo,
destinatario, apartamento, torre y el lobby donde quedará esperando. El guardia de ese lobby solo
podrá marcarla como "Entregado" — no podrá cambiar ninguno de estos datos.

## Consultar historial y reportes
**Administración → Reportes e historial.** Elige la pestaña (Parqueos, Paquetes, Préstamos,
Tarjetas/Stickers, Actividad por guardia) y presiona **⬇ Exportar CSV** para descargar un archivo
que se puede abrir en Excel o Google Sheets.

## Revisar auditoría
La pestaña **Panel** del área de Administración muestra la actividad reciente de todo el sistema
(quién hizo qué y cuándo). Es de solo lectura y no puede editarse ni borrarse — es el registro
permanente de auditoría.

## Corregir errores
**Administración → Correcciones.**
- Los reportes de error que envían los guardias aparecen en la parte superior; presiona **Marcar
  como resuelto** para cerrarlos, con una nota de qué se corrigió.
- Para corregir un registro de parqueo específico (por ejemplo, datos mal escritos, o una salida
  registrada por error para el vehículo equivocado), búscalo por placa en el buscador de la misma
  pantalla:
  - **Corregir datos** edita nombre, cédula, placa o número de apartamento, dejando registrada
    la corrección.
  - **Reabrir (salida incorrecta)** revierte una salida que se registró por error y vuelve a
    marcar el parqueo como ocupado con los datos originales — solo funciona si ese parqueo está
    libre en este momento (si otra persona ya lo ocupó, primero hay que liberar esa nueva
    ocupación desde Administración → Parqueos → "Liberar (corrección)").

## Generar reportes
Ver "Consultar historial y reportes" arriba. La pestaña **Actividad por guardia** resume cuántas
entradas de parqueo registró cada guardia, útil para revisar carga de trabajo por turno.

## Actualizar la aplicación
Ver `docs/MANUAL_PUBLICACION.md`, sección "Actualizaciones futuras", para instrucciones exactas
sobre cómo cambiar colores, logo, nombre y cómo publicar los cambios sin perder datos.
