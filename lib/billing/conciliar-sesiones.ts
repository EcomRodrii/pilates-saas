// ─────────────────────────────────────────────────────────────────────────────
// Decidir qué sesiones de checkout ya cobradas se quedaron sin entregar.
//
// Puro y sin red: recibe lo que Stripe dice que se ha pagado y lo que la base
// de datos dice que se ha entregado, y devuelve la diferencia. Lo que hace la
// llamada de red y la escritura es `lib/inngest/conciliar-cobros.ts`.
// ─────────────────────────────────────────────────────────────────────────────

/** Lo mínimo que necesitamos de una sesión de Stripe para decidir. */
export interface SesionCobrada {
  id: string;
  status: string | null;
  paymentStatus: string | null;
  metadata: Record<string, string> | null | undefined;
}

export type Pendiente =
  | { sesionId: string; tipo: 'plan'; studioId: string; planId: string; socioId: string | null; origenLead: string | null }
  | { sesionId: string; tipo: 'recibo'; studioId: string; reciboId: string };

/**
 * ¿Esta sesión representa dinero que ENTRÓ de verdad?
 *
 * `status: 'complete'` sola no basta: una sesión puede completarse sin pago
 * (importe diferido, método pendiente de confirmar). Es la misma comprobación
 * que hace el webhook antes de tocar nada, y por el mismo motivo — dar por
 * cobrado lo que no lo está es peor que no entregarlo.
 */
export function estaPagada(s: SesionCobrada): boolean {
  return s.status === 'complete' && s.paymentStatus === 'paid';
}

/**
 * Qué hay que entregar de esta sesión, si es que hay algo.
 *
 * Devuelve null cuando la sesión no es nuestra (sin `studioId`), cuando no dice
 * qué se compró, o cuando el estudio que dice no es el que estamos conciliando.
 *
 * ⚠️ El `studioId` de la metadata NO se usa como autoridad: quien llama ya sabe
 * de qué cuenta conectada ha sacado la sesión, y pasa ese estudio en
 * `studioEsperado`. La metadata solo puede confirmarlo. Mismo criterio que
 * `tenantAutorizado` en el webhook: la metadata la elige quien crea la sesión.
 */
export function queEntregar(s: SesionCobrada, studioEsperado: string): Pendiente | null {
  if (!estaPagada(s)) return null;
  const md = s.metadata ?? {};
  if (md.studioId && md.studioId !== studioEsperado) return null;

  // Los mandatos SEPA (mode 'setup') no llevan ni reciboId ni planId, así que
  // caen solos por aquí: no hay nada que entregar, solo un método guardado.
  if (md.reciboId) {
    return { sesionId: s.id, tipo: 'recibo', studioId: studioEsperado, reciboId: md.reciboId };
  }
  if (md.planId) {
    return {
      sesionId: s.id, tipo: 'plan', studioId: studioEsperado,
      planId: md.planId, socioId: md.socioId ?? null, origenLead: md.origenLead ?? null,
    };
  }
  return null;
}

/**
 * De todo lo cobrado, lo que todavía no se ha entregado.
 *
 * `recibosCobrados` son los ids de recibo que ya constan COBRADOS, y
 * `sesionesEntregadas` los ids de sesión de Stripe de los que ya salió un
 * recibo (las compras de plan crean `rec-web-<sesión>`, determinista). Con esas
 * dos listas se filtra sin volver a preguntar a la base de datos por cada una.
 */
export function pendientesDeEntregar(
  sesiones: SesionCobrada[],
  studioEsperado: string,
  yaHecho: { recibosCobrados: Set<string>; sesionesEntregadas: Set<string> },
): Pendiente[] {
  const salida: Pendiente[] = [];
  for (const s of sesiones) {
    const p = queEntregar(s, studioEsperado);
    if (!p) continue;
    if (p.tipo === 'recibo' && yaHecho.recibosCobrados.has(p.reciboId)) continue;
    if (p.tipo === 'plan' && yaHecho.sesionesEntregadas.has(p.sesionId)) continue;
    salida.push(p);
  }
  return salida;
}
