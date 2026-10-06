// El caso de «sin nada que la cubra» de UNA clase, montado con los datos que la
// app ya tiene (P01). La decisión está en `comoVieneSinBono` (como-se-paga.ts);
// aquí solo se juntan las piezas para que la ficha, la hoja y la tienda la
// calculen igual. Puro, sin `@/`.

import { comoVieneSinBono, type ComoVieneSinBono } from './como-se-paga.ts';
import { desdeImporte, opcionesDeClase, type OpcionesDeClase } from '../reservar/opciones-de-clase.ts';
import { importeDeClaseSuelta, planDeClaseSuelta } from '../reservas/clase-suelta.ts';
import type { PlanTarifa } from '../types.ts';
import type { Clase } from './tipos.ts';

export interface SinBonoDeClase {
  caso: ComoVieneSinBono;
  opciones: OpcionesDeClase;
}

/**
 * `null` si no aplica: la clase no trae el ajuste de «exigir plan» (payload
 * viejo) — entonces se reserva como siempre y decide el servidor.
 */
export function sinBonoDeClase(
  clase: Pick<Clase, 'tipoClaseId' | 'precioPuntual' | 'exigePlan'>,
  planes: readonly PlanTarifa[] | null | undefined,
  pagosOnline: boolean,
): SinBonoDeClase | null {
  if (clase.exigePlan == null) return null;
  const lista = planes ?? [];
  const opciones = opcionesDeClase({ planes: lista, tipoClaseId: clase.tipoClaseId, precioPuntualSesion: clase.precioPuntual });
  const caso = comoVieneSinBono({
    exigePlan: clase.exigePlan,
    pagosOnline,
    desde: desdeImporte(opciones.opciones),
    precioEspecial: opciones.precioEspecial,
    importeEnEstudio: importeDeClaseSuelta(clase.precioPuntual, planDeClaseSuelta(lista, clase.tipoClaseId)),
  });
  return { caso, opciones };
}
