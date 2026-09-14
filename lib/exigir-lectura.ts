// Una lectura que falla en un barrido NO puede pasar por «no había nada».
//
// `fetchAllRows` devuelve `{ data, error }` y varios crons desestructuraban
// solo `data`: con un 504 del pooler, `data` llega vacío, el barrido sale por
// `if (!filas.length) return { publicados: 0 }` y la ruta responde **200 con
// cero trabajo hecho**. No hay error, no hay Sentry, no hay reintento: el aviso
// de «tu clase es dentro de una hora» sencillamente no sale y nadie se entera.
//
// `lib/notificaciones/bonos-inactivas-cron.ts` ya lo hacía bien y lo dejó
// escrito («los errores se PROPAGAN: las rutas de cron los convierten en 500 +
// Sentry»). Sus gemelos —recordatorios de clase y expiración de reservas
// pendientes— no. Esto es esa función, en un sitio del que puedan tirar los
// tres, para que la próxima lectura que se añada no vuelva a elegir.
//
// Sin imports de `@/...` a propósito: así se puede probar con `node --test`
// (mismo motivo que `lib/reintento-transitorio.ts`).

/** Convierte el error de una lectura paginada en una excepción con contexto. */
export function exigirLectura(error: { message: string } | null | undefined, que: string): void {
  if (error) throw new Error(`${que}: ${error.message}`);
}
