# Manual de uso — Administrador

## Iniciar sesión
Abre la dirección de la aplicación, escribe tu correo y contraseña, presiona **INICIAR SESIÓN**.
Verás tu nombre, "Administrador", tu lobby (si tienes uno asignado) y el estado de conexión en la
parte superior.

## Crear usuarios
**Administración → Usuarios → + CREAR USUARIO.** Completa nombre, correo, una contraseña
temporal (mínimo 6 caracteres), rol (Administrador o Guardia) y lobby. Entrégale el correo y la
contraseña a la persona en privado. Puede cambiarla luego desde la pantalla de inicio de sesión
(función "olvidé mi contraseña" — si no está visible, contáctame para agregarla en una futura
actualización).

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

## Crear y desactivar objetos
**Administración → Objetos → + CREAR OBJETO.** Para ajustar la cantidad total disponible, cambia
el número junto al objeto y presiona **Guardar cantidad**. Para retirar temporalmente un objeto
sin perder su historial de préstamos, usa **Desactivar** (no existe un botón para eliminarlo
permanentemente — es intencional, para conservar la trazabilidad).

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
