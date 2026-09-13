// Restaurar una copia de seguridad desde el panel: DESACTIVADO temporalmente.
//
// `restaurar_backup` borra y vuelve a insertar todas las tablas del estudio con
// el contenido de la copia. Eso incluye registros que no se pueden revertir sin
// consecuencias: facturas ya encadenadas y remitidas (Veri*Factu) y fichas de
// socias que se suprimieron después de la copia. Además, al borrar `socios` se
// arrastran en cascada datos que la copia no guarda.
//
// Hasta que exista la versión que conserva lo fiscal y respeta las supresiones,
// la ruta responde 423 y el panel no ofrece el botón. Crear copias sigue igual.
// Si un estudio necesita recuperar datos, se hace a mano con soporte.
//
// Esa versión ya está escrita (migr 20260913170200_restaurar_backup_conserva_
// fiscal_y_supresiones, modos en lib/engines/backup-engine.ts), pero NO se ha
// ejecutado nunca contra datos reales. Antes de poner esto a `true`, en una RAMA
// de Supabase con una copia real de R2 y dentro de BEGIN … ROLLBACK:
//   1. Estudio con facturas encadenadas emitidas DESPUÉS de la copia: tras
//      restaurar, count(facturas) y count(recibos) no bajan y los hashes de
//      Veri*Factu de las posteriores siguen intactos.
//   2. Socia suprimida DESPUÉS de la copia: sigue anonimizada (nombre 'Socia',
//      email borrado+…@anon.invalid) y sin notas, créditos ni logs con nombre.
//   3. Socia con ficha de salud, documentos y conversaciones: count de
//      condiciones_salud, documentos_socio, mensajes no baja (ya no hay DELETE
//      en socios que los arrastre).
//   4. Estudio con plazas_fijas/pagos_historicos/recuperaciones (FK NO ACTION):
//      la restauración TERMINA (la v1 fallaba entera).
//   5. Suscripción cancelada después de la copia: sigue CANCELADA (no vuelve a
//      renovarse ni a cobrar). Instructora dada de baja después: sigue inactiva.
//   6. Una copia anterior a añadir una tabla a BACKUP_TABLES: esa tabla no se
//      vacía (modo 'ausente').
//   7. has_function_privilege de anon/authenticated = false, service_role = true.
// Y además: el diálogo del panel tiene que dejar de decir «sobrescribirá todos
// los datos» y enumerar lo que NO se restaura (lo fiscal, y las tablas en modo
// insertar_faltantes no revierten cambios, solo recuperan lo borrado).

// Tipado como `boolean` (no el literal `false`) para que el código que se
// reactivará siga compilando y comprobándose mientras tanto.
export const RESTAURACION_DISPONIBLE: boolean = false;

export const MENSAJE_RESTAURACION_NO_DISPONIBLE =
  'La restauración de copias está desactivada temporalmente mientras la mejoramos. '
  + 'Tus copias se siguen creando cada día. Si necesitas recuperar datos, escríbenos a soporte y lo hacemos contigo.';
