// El precio de una clase suelta, de la MISMA fuente que cobra el checkout.
//
// ⚠️ Sin imports ni `@/` a propósito: el runner es
// `node --test --experimental-strip-types` y no resuelve ese alias — un test
// que lo use no falla, simplemente NO SE EJECUTA.
//
// EL BUG QUE ARREGLA. El mapeo hacía `precioSuelto: s.precioPuntual ?? 0`.
// `sesiones.precio_puntual` es un OVERRIDE por sesión y está a NULL en las 54
// sesiones del estudio de prueba —lo normal—, así que la app enseñaba «0 €» a
// una alumna sin bono. No es que la clase sea gratis: es que ahí no estaba el
// precio.
//
// DÓNDE SÍ ESTÁ. `app/api/public/checkout-embebido/route.ts` calcula el importe
// con `Number(plan.precio)` leyendo `planes_tarifa` EN SERVIDOR, exigiendo
// `plan.activo`, y sin aceptar nunca un importe del cliente. El precio de una
// clase suelta es, por tanto, el del plan `tipo: 'PUNTUAL'` activo del estudio.
// Esta función lee ESE mismo dato — no crea un segundo sistema de precios.

/** Lo que hace falta de un plan para decidir el precio de una clase suelta. */
export interface PlanPrecio {
  tipo?: string | null;
  precio?: number | null;
  activo?: boolean | null;
  sesiones?: number | null;
}

/**
 * Precio de una clase suelta en este estudio, o `null` si no hay ninguno.
 *
 * `null` NO es cero: significa «este estudio no vende clases sueltas», y quien
 * lo pinte debe decir eso, no «0 €». Confundir las dos cosas es exactamente el
 * bug que se está arreglando.
 *
 * Solo planes ACTIVOS, igual que el checkout: enseñar el precio de un plan
 * desactivado llevaría a un cobro que la ruta rechaza.
 *
 * Si hubiera varios PUNTUAL activos —posible, el panel no lo impide— se toma el
 * más BARATO: entre dos precios verdaderos, cobrar de más es peor que cobrar de
 * menos, y es el que la alumna esperaría de un escaparate.
 */
export function precioClaseSuelta(planes: readonly PlanPrecio[] | null | undefined): number | null {
  if (!planes || planes.length === 0) return null;
  const candidatos = planes
    .filter((p) => p.tipo === 'PUNTUAL')
    .filter((p) => p.activo !== false)
    .map((p) => Number(p.precio))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (candidatos.length === 0) return null;
  return Math.min(...candidatos);
}

/**
 * El precio que se le enseña por ESTA sesión.
 *
 * Orden: el override de la sesión manda sobre la tarifa del estudio — para eso
 * existe `sesiones.precio_puntual`, para un taller o una clase especial con
 * precio propio. Un override de 0 es un 0 DELIBERADO (una clase gratuita) y se
 * respeta; lo que no se respeta es el `?? 0` de antes, que convertía «no hay
 * dato» en «no cuesta nada».
 */
export function precioDeSesion(
  precioPuntualSesion: number | null | undefined,
  planes: readonly PlanPrecio[] | null | undefined,
): number | null {
  if (typeof precioPuntualSesion === 'number' && Number.isFinite(precioPuntualSesion)) {
    return precioPuntualSesion;
  }
  return precioClaseSuelta(planes);
}
