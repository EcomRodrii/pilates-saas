// ─────────────────────────────────────────────────────────────────────────────
// ¿Se puede deshacer lo que entregó un cobro que se ha devuelto? ¿Y qué queda?
//
// PURO a propósito, y lo consumen los DOS lados: la card lo usa para pintar la
// vista previa, y el endpoint lo recalcula antes de escribir. Si el resultado no
// coincide con lo que se le enseñó a la propietaria, el endpoint devuelve 409
// con los números nuevos en vez de aplicar algo que ella no llegó a ver.
//
// La decisión NUNCA es automática (ver el plan): el doble cargo es una de las
// causas más frecuentes de reembolso, y revertir en automático le quitaría a la
// socia las sesiones que sí pagó, justo cuando el estudio se está disculpando.
// Esto solo calcula y avisa; el botón lo pulsa una persona.
// ─────────────────────────────────────────────────────────────────────────────

export type MotivoSinReversion =
  | 'SIN_INSTRUMENTAR'   // cobro anterior al snapshot: no se sabe qué entregó
  | 'SIN_ENTREGA'        // se evaluó y no cambió nada, o no cuelga de ninguna suscripción
  | 'ESTADO_CAMBIADO';   // la suscripción se ha movido desde la entrega

export interface Snapshot {
  tipo: 'BONO' | 'MENSUAL' | 'ALTA_WEB' | 'NINGUNA' | null;
  aplicada: boolean | null;
  sesionesAntes: number | null;
  sesionesDespues: number | null;
  fechaFinAntes: string | null;
  fechaFinDespues: string | null;
  estadoAntes: string | null;
}

export interface SuscripcionActual {
  sesionesRestantes: number | null;
  fechaFin: string | null;
  estado: string | null;
}

/** Lo que se escribiría si se pulsa el botón. Solo los campos que cambian. */
export interface ObjetivoReversion {
  sesionesRestantes?: number;
  fechaFin?: string | null;
  estado?: string;
}

export interface Reversion {
  posible: boolean;
  motivo?: MotivoSinReversion;
  objetivo: ObjetivoReversion | null;
  /**
   * Sesiones consumidas entre la entrega y ahora. **Inferido**
   * (`despues - actual`), porque `consumir_sesion_bono` no deja rastro: no hay
   * ledger de movimientos. Se etiqueta como inferido allá donde se enseñe.
   */
  consumidasDesde: number | null;
  /** Lo que la propietaria tiene que saber ANTES de pulsar. */
  avisos: string[];
}

const NO = (motivo: MotivoSinReversion, consumidasDesde: number | null = null): Reversion =>
  ({ posible: false, motivo, objetivo: null, consumidasDesde, avisos: [] });

/**
 * ⚠️ El orden de las guardas importa, y cada una responde a algo distinto:
 *
 *  1. `aplicada === null` → el cobro es anterior al snapshot. No se sabe qué
 *     entregó, así que no se puede prometer deshacerlo.
 *  2. `aplicada === false` → se evaluó y no cambió nada (el bono aún tenía
 *     saldo). Ofrecer revertir sería ofrecer quitar sesiones que este cobro
 *     nunca puso.
 *  3. La suscripción se ha movido desde la entrega → una congelación (migr
 *     0079), otra renovación o un ajuste a mano. Ya no se puede restaurar con
 *     certeza: se enseñan los números y se deja decidir a mano.
 *
 * Y una regla transversal: si la suscripción está PAUSADA **no se toca
 * `estado`**. Descongelar en silencio es un bug que este repo ya cometió una vez
 * (ver `stripe-cobros.ts`), y una reversión no puede reactivar un plan que
 * alguien congeló a propósito.
 */
export function calcularReversion(p: {
  snapshot: Snapshot;
  actual: SuscripcionActual | null;
}): Reversion {
  const { snapshot: s, actual } = p;

  if (s.aplicada === null || s.aplicada === undefined) return NO('SIN_INSTRUMENTAR');
  if (s.aplicada === false || s.tipo === 'NINGUNA' || s.tipo === null) return NO('SIN_ENTREGA');
  if (!actual) return NO('SIN_ENTREGA');

  const pausada = actual.estado === 'PAUSADA';
  const avisos: string[] = [];
  if (pausada) {
    avisos.push('La suscripción está congelada: no se le va a cambiar el estado, solo el saldo.');
  }

  if (s.tipo === 'BONO') {
    // La rama de bono NO toca `fecha_fin`, así que solo se compara el saldo.
    if (actual.sesionesRestantes === null || s.sesionesDespues === null) return NO('SIN_ENTREGA');
    const delta = s.sesionesDespues - (s.sesionesAntes ?? 0);
    const consumidas = s.sesionesDespues - actual.sesionesRestantes;
    // Que haya consumido no impide revertir: lo que hay que saber es CUÁNTAS.
    // Que el saldo esté POR ENCIMA de lo que dejó la entrega sí es interferencia
    // (alguien recargó por otro lado).
    if (consumidas < 0) return NO('ESTADO_CAMBIADO', consumidas);

    if (consumidas > 0) {
      avisos.push(
        `Ha usado ${consumidas} ${consumidas === 1 ? 'sesión' : 'sesiones'} desde el cobro. ` +
        'Si le devuelves todo, esas clases quedan sin pagar.',
      );
    }
    const objetivo: ObjetivoReversion = {
      // El delta, no "= antes": es lo que sigue siendo correcto aunque haya
      // consumido por el medio.
      sesionesRestantes: Math.max(0, actual.sesionesRestantes - delta),
    };
    if (!pausada && s.estadoAntes) objetivo.estado = s.estadoAntes;
    return { posible: true, objetivo, consumidasDesde: consumidas, avisos };
  }

  if (s.tipo === 'MENSUAL') {
    // Aquí la interferencia se detecta por la fecha: si hoy no es la que dejó la
    // entrega, la movió otra cosa y restar un mes sería adivinar.
    if (actual.fechaFin !== s.fechaFinDespues) return NO('ESTADO_CAMBIADO');
    const objetivo: ObjetivoReversion = { fechaFin: s.fechaFinAntes };
    if (!pausada && s.estadoAntes) objetivo.estado = s.estadoAntes;
    if (s.fechaFinAntes && s.fechaFinAntes < hoyISO()) {
      avisos.push('Se quedará sin plan activo: la fecha anterior ya ha pasado.');
    }
    if (!s.fechaFinAntes) {
      avisos.push('Antes de este cobro no tenía fecha de fin; se le quitará la que puso el cobro.');
    }
    return { posible: true, objetivo, consumidasDesde: null, avisos };
  }

  // ALTA_WEB: la suscripción nació con esta compra, así que "antes" es la nada.
  // No se borra nada — ni la suscripción (el recibo la referencia) ni la ficha
  // de socia (su FK en cascada se llevaría el propio recibo por delante).
  if (s.tipo === 'ALTA_WEB') {
    if (actual.sesionesRestantes !== null && s.sesionesDespues !== null
        && actual.sesionesRestantes > s.sesionesDespues) {
      return NO('ESTADO_CAMBIADO');
    }
    const consumidas = s.sesionesDespues !== null && actual.sesionesRestantes !== null
      ? s.sesionesDespues - actual.sesionesRestantes
      : null;
    if (consumidas && consumidas > 0) {
      avisos.push(
        `Ha usado ${consumidas} ${consumidas === 1 ? 'sesión' : 'sesiones'} desde la compra. ` +
        'Si le devuelves todo, esas clases quedan sin pagar.',
      );
    }
    avisos.push('La ficha de la clienta NO se borra: archívala a mano si hace falta.');
    const objetivo: ObjetivoReversion = { sesionesRestantes: 0 };
    if (!pausada) objetivo.estado = 'CANCELADA';
    return { posible: true, objetivo, consumidasDesde: consumidas, avisos };
  }

  return NO('SIN_ENTREGA');
}

function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Huella de lo que se le enseñó a la propietaria. El endpoint recalcula y
 * compara: si no coincide, algo cambió entre que se pintó la card y que se pulsó
 * el botón, y se responde 409 con los números nuevos en vez de escribir.
 */
export function huellaDe(r: Reversion): string {
  if (!r.posible || !r.objetivo) return `no:${r.motivo ?? ''}`;
  const o = r.objetivo;
  return `si:${o.sesionesRestantes ?? ''}:${o.fechaFin ?? ''}:${o.estado ?? ''}`;
}
