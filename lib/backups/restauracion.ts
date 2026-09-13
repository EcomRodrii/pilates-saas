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

// Tipado como `boolean` (no el literal `false`) para que el código que se
// reactivará siga compilando y comprobándose mientras tanto.
export const RESTAURACION_DISPONIBLE: boolean = false;

export const MENSAJE_RESTAURACION_NO_DISPONIBLE =
  'La restauración de copias está desactivada temporalmente mientras la mejoramos. '
  + 'Tus copias se siguen creando cada día. Si necesitas recuperar datos, escríbenos a soporte y lo hacemos contigo.';
