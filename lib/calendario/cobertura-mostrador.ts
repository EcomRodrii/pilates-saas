// ─────────────────────────────────────────────────────────────────────────────
// Lo que el mostrador ve de cada clienta al apuntarla a una clase: si viene con
// su cuota o su bono, o si hay que cobrarle la clase suelta (maqueta aprobada
// del rediseño del Calendario, 1-oct-2026: «Bono 10 clases · le quedan 3»).
//
// La decisión NO es nueva: es `coberturaDeClase` (lib/reservar/cobertura.ts),
// la misma que ve la alumna al reservar y que elige el bono que va a gastar el
// servidor. Aquí solo cambia la persona: la alumna lee «te quedan», el
// mostrador lee «le quedan».
//
// Import relativo con extensión `.ts`: lo prueba `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

import type { Cobertura } from '../reservar/cobertura.ts';

export interface LineaCobertura {
  texto: string;
  /** Hay que cobrarle la clase (o regalársela): sin bono ni cuota que valga. */
  sinCobertura: boolean;
}

export function lineaCoberturaMostrador(c: Cobertura): LineaCobertura {
  switch (c.estado) {
    case 'MENSUAL':
      return { texto: `Con su ${c.planNombre}`, sinCobertura: false };
    case 'BONO':
      // El saldo TOTAL de los bonos que cubren la clase, no el del bono de turno.
      return {
        texto: `${c.planNombre} · ${c.sesionesRestantes === 1 ? 'le queda 1' : `le quedan ${c.sesionesRestantes}`}`,
        sinCobertura: false,
      };
    case 'NO_CUBRE_ESTA_CLASE':
      return { texto: 'Su bono o su cuota no cubren esta clase', sinCobertura: true };
    case 'SIN_PLAN':
    case 'ANONIMA':
      return { texto: 'No tiene bono ni cuota que valga para esta clase', sinCobertura: true };
  }
}
