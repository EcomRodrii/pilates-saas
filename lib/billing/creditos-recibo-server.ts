import type { SupabaseClient } from '@supabase/supabase-js';
import { evaluarFeature } from './billing-rules.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Los créditos de «Renovar plan» siguen a su recibo.
//
// Mismo patrón que «la penalización sigue a su recibo» (`seguirPenalizacionAlRecibo`):
// quien cambia el estado de un recibo llama aquí, y aquí no se decide nada. La
// base (`sincronizar_creditos_renovacion`, migr 20260917010429) mira el estado
// REAL del recibo y deja los créditos como tienen que estar:
//   · cobrado y es una renovación (marcada, o la recompra del mismo plan) → los
//     otorga, una sola vez;
//   · el dinero ha vuelto (devolución total, contracargo, SEPA devuelto,
//     «marcar devuelto», venta del TPV devuelta) → los revierte, y lo que ya se
//     gastó queda por compensar.
// Llamarla de más no hace nada, así que cada camino la llama sin preguntar.
//
// Quién la llama: `aplicarRenovacionServidor` (los tres confirmadores de cobro
// de servidor), `entregarPlanComprado` (tienda web), `entregarVentaPOS` (TPV),
// la devolución del TPV, `procesar-reembolso` (reembolso total y contracargo),
// el webhook cuando un reembolso falla y el recibo vuelve a COBRADO,
// `marcarReciboDevuelto`, `registrarFalloCobro` (SEPA devuelto) y
// `POST /api/cobros/creditos-recibos` (los cobros a mano del panel).
//
// Best-effort: nunca lanza. Unos créditos no pueden tumbar un cobro ni una
// devolución; si falla, queda el aviso.
//
// Sin `server-only` ni alias `@/` a propósito: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

export type AccionCreditosRecibo = 'OTORGADO' | 'REVERTIDO' | 'NADA';

export interface ResultadoCreditosRecibo {
  accion: AccionCreditosRecibo;
  socioId: string | null;
  /** Créditos otorgados o revertidos (magnitud). */
  creditos: number;
  /** Saldo de la socia tras el cambio; null si no hubo cambio que leer. */
  saldo: number | null;
  /**
   * Créditos de COMPRA (venta del TPV) retirados en esta llamada porque el
   * dinero de la venta ha vuelto. 0 casi siempre, y 0 al repetirla.
   */
  creditosCompraRetirados: number;
}

export interface DependenciasCreditosRecibo {
  /** ¿El plan del estudio incluye gamificación? Solo frena OTORGAR, nunca revertir. */
  puedeOtorgar: (admin: SupabaseClient, studioId: string) => Promise<boolean>;
  avisarFallo: (e: unknown, extra: { reciboId: string; studioId: string }) => void;
}

const DEPENDENCIAS: DependenciasCreditosRecibo = {
  // Mismo gate que `otorgarCreditosServidor`: falla abierto sin BILLING_ENFORCED.
  puedeOtorgar: async (admin, studioId) => !(await evaluarFeature(admin, studioId, 'gamificacion')),
  // Sentry en diferido: este módulo lo importan sin él a propósito ficheros que
  // se prueban con `node --test` (`entregar-plan-comprado.ts`), donde el SDK no
  // se inicializa.
  avisarFallo: (e, extra) => {
    void import('@sentry/nextjs').then(Sentry => {
      Sentry.captureException(e instanceof Error ? e : new Error('No se pudieron sincronizar los créditos del recibo'), {
        level: 'warning', tags: { area: 'gamificacion', tipo: 'creditos-recibo' }, extra,
      });
    }).catch(() => console.error('[seguirCreditosAlRecibo] sin sincronizar', extra.reciboId, e));
  },
};

export async function seguirCreditosAlRecibo(
  admin: SupabaseClient,
  p: {
    studioId: string; reciboId: string;
    /** Ya evaluado por quien llama (varios recibos del mismo estudio): no se vuelve a leer. */
    puedeOtorgar?: boolean;
  },
  deps: DependenciasCreditosRecibo = DEPENDENCIAS,
): Promise<ResultadoCreditosRecibo | null> {
  // Los créditos de COMPRA (por importe, venta del TPV) cuelgan del mismo hecho
  // —«el dinero de este recibo ha vuelto»— y se retiran por la misma puerta:
  // un efecto más, no un camino aparte. La base mira el ESTADO de la venta y es
  // idempotente por venta (`sincronizar_creditos_compra`), así que repetir la
  // llamada no quita nada dos veces. Se ejecuta aunque la renovación falle, y
  // un fallo de uno no tumba al otro.
  const creditosCompraRetirados = await sincronizarCompra(admin, p, deps);
  try {
    // Si no se puede saber si el plan incluye gamificación, no se otorga — pero
    // se sigue llamando: una devolución tiene que poder retirarlos igual.
    const puedeOtorgar = p.puedeOtorgar ?? await deps.puedeOtorgar(admin, p.studioId).catch(() => false);
    const { data, error } = await admin.rpc('sincronizar_creditos_renovacion', {
      p_studio_id: p.studioId, p_recibo_id: p.reciboId, p_puede_otorgar: puedeOtorgar,
    });
    if (error) throw new Error(error.message);
    const fila = (Array.isArray(data) ? data[0] : data) as
      { resultado?: string; socia?: string | null; creditos_movidos?: number; saldo_final?: number | null } | null;
    const accion: AccionCreditosRecibo =
      fila?.resultado === 'OTORGADO' || fila?.resultado === 'REVERTIDO' ? fila.resultado : 'NADA';
    return {
      accion,
      socioId: fila?.socia ?? null,
      creditos: Number(fila?.creditos_movidos ?? 0),
      saldo: fila?.saldo_final == null ? null : Number(fila.saldo_final),
      creditosCompraRetirados,
    };
  } catch (e) {
    try {
      deps.avisarFallo(e, { reciboId: p.reciboId, studioId: p.studioId });
    } catch {
      console.error('[seguirCreditosAlRecibo] sin sincronizar', p.reciboId, e);
    }
    return null;
  }
}

async function sincronizarCompra(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string },
  deps: DependenciasCreditosRecibo,
): Promise<number> {
  try {
    const { data, error } = await admin.rpc('sincronizar_creditos_compra', {
      p_studio_id: p.studioId, p_recibo_id: p.reciboId,
    });
    if (error) throw new Error(error.message);
    const filas = (Array.isArray(data) ? data : data ? [data] : []) as Array<{ r_retirados?: number }>;
    // Negativo = la base RESTITUYÓ créditos (el reembolso falló): no cuenta como retirado.
    return filas.reduce((n, f) => n + Math.max(0, Number(f?.r_retirados ?? 0)), 0);
  } catch (e) {
    try {
      deps.avisarFallo(e, { reciboId: p.reciboId, studioId: p.studioId });
    } catch {
      console.error('[seguirCreditosAlRecibo] compra sin sincronizar', p.reciboId, e);
    }
    return 0;
  }
}
