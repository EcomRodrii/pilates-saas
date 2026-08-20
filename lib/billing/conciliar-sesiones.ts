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

// ── Modo B: PaymentIntent directo del checkout embebido ─────────────────────
//
// El widget (Fase 3, docs/checkout-embebido-diseno.md §5) cobra planes con un
// PaymentIntent DIRECTO, sin Checkout Session: `checkout.sessions.list` no los
// ve. Sin esta vía, el conciliador era ciego a ese camino — y como el webhook
// responde 200 antes de procesar (after()), un fallo suyo al entregar dejaba
// dinero cobrado sin bono y sin NINGUNA red que lo recogiera (D-1, auditoría
// 20-ago).

/** Lo mínimo que necesitamos de un PaymentIntent para decidir. */
export interface CobroPI {
  id: string;
  status: string | null;
  metadata: Record<string, string> | null | undefined;
}

/**
 * Qué hay que entregar de este PaymentIntent, si es que hay algo.
 *
 * Solo clasifica compras de PLAN del checkout embebido (`origen:
 * 'plan_web_embebido'`, escrito incondicionalmente al crear el PI). Todo lo
 * demás queda fuera a propósito: el PI de una compra Modo A se sella con
 * `origen: 'plan_web'` DESPUÉS de entregar y ya lo vigila el listado de
 * sesiones; POS (`pos_*`) y SEPA (`sepa_recibo`) tienen sus propios caminos.
 *
 * ⚠️ `metadata.reciboId` se IGNORA para clasificar: un PI Modo B ya entregado
 * lleva `reciboId` sellado por el webhook, y reclasificarlo como tipo
 * 'recibo' lo sacaría del dedupe correcto — el de tipo 'recibo' filtra por
 * estado COBRADO, así que un `rec-web-…` que pasara a DEVUELTO volvería a
 * salir como pendiente y `entregar()` re-ejecutaría la renovación sobre un
 * recibo ya devuelto. Como tipo 'plan', el dedupe es por EXISTENCIA del
 * `rec-web-…` (sin filtro de estado) y un DEVUELTO sigue dedupeando.
 *
 * Mismo criterio de tenant que `queEntregar`: la metadata solo CONFIRMA el
 * estudio; la autoridad es la cuenta Connect de la que se listó el PI.
 */
export function queEntregarPI(pi: CobroPI, studioEsperado: string): Pendiente | null {
  if (pi.status !== 'succeeded') return null;
  const md = pi.metadata ?? {};
  if (md.origen !== 'plan_web_embebido') return null;
  if (md.studioId && md.studioId !== studioEsperado) return null;
  if (!md.planId) return null;
  return {
    sesionId: pi.id, tipo: 'plan', studioId: studioEsperado,
    planId: md.planId, socioId: md.socioId ?? null, origenLead: md.origenLead ?? null,
  };
}

/**
 * De todos los PaymentIntents cobrados, lo que todavía no se ha entregado.
 * `yaEntregados` son los ids de PI cuyo `rec-web-…` ya existe — en CUALQUIER
 * estado, ver el aviso de `queEntregarPI`.
 */
export function pendientesDeEntregarPI(
  pis: CobroPI[],
  studioEsperado: string,
  yaEntregados: Set<string>,
): Pendiente[] {
  const salida: Pendiente[] = [];
  for (const pi of pis) {
    const p = queEntregarPI(pi, studioEsperado);
    if (!p) continue;
    if (yaEntregados.has(p.sesionId)) continue;
    salida.push(p);
  }
  return salida;
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
