// Las clases que se repiten, como las ve la alumna: qué tiene ya ella de cada una y qué le falta para hacerla su clase fija.
// Puro y sin `@/` (lo leen la pantalla y los tests del runner de Node).
//
// ⚠️ Nada de aquí DECIDE. Si tiene o no cuota que la cubra es lo que se le enseña antes de pulsar; el servidor lo vuelve a
// comprobar todo al pedir y otra vez al aprobar.

import { DIAS_AVISO_CLASE_FIJA_TERMINA, type FranjaSuelta } from '../clases-fijas-reglas.ts';
import { plazaFijaEnFranja, tieneCuotaQueCubre, type CuotaMin, type PeticionPlazaFijaMin, type PlanCuotaMin, type PlazaFijaEnClase } from './plaza-fija.ts';

export { DIAS_AVISO_CLASE_FIJA_TERMINA };

export interface SociaMin {
  suscripciones: CuotaMin[];
  plazasFijas: { diaSemana: number; horaInicio: string; salaId: string; tipoClaseId: string | null; estado: string; vigenciaHasta: string | null }[];
  peticionesPlazaFija?: PeticionPlazaFijaMin[];
}

export interface ClaseSueltaVista extends FranjaSuelta {
  estado: PlazaFijaEnClase;
}

/**
 * Las clases que se repiten, con lo que ella ya tiene o ha pedido de cada una. Mismo criterio que la ficha de una clase: sin
 * sesión de alumna, se le ofrece pedirla (no se la riñe por su cuota).
 */
export function proyectarClasesSueltas(
  sueltas: FranjaSuelta[], socia: SociaMin | null, planes: PlanCuotaMin[], hoy: string,
): ClaseSueltaVista[] {
  return sueltas.map((f) => ({
    ...f,
    estado: plazaFijaEnFranja(
      f, socia?.plazasFijas ?? [], socia?.peticionesPlazaFija ?? [],
      socia ? tieneCuotaQueCubre(socia.suscripciones, planes, hoy, f.tipoClaseId) : true,
      hoy,
    ),
  }));
}
