// ─────────────────────────────────────────────────────────────────────────────
// Qué plan puede renovar la alumna ELLA MISMA («Renovar mi plan», y pagar online
// el recibo de renovación). Puro y sin alias `@/`, para fijarlo con `node --test`.
//
// Renovar no es solo cobrar: al cobrarse, la renovación deja la suscripción
// ACTIVA (`aplicarRenovacionServidor`). Así que renovar una cuota en PAUSADA la
// descongelaba sin que el estudio lo decidiera, y la cobraba (decisión del
// fundador, 5-oct-2026: la alumna no la renueva; habla con su estudio). El estudio
// ya trata así la pausa al cobrar (`puedeIntentarCobro`: CUOTA_PAUSADA).
//
// Estados de `suscripciones` (CHECK `suscripciones_estado_check`):
//  · ACTIVA    → sí: la cuota vencida o el bono agotado de siempre.
//  · EXPIRADA  → sí: un bono o una cuota que ya terminó (la renovación la reactiva,
//                como hasta ahora).
//  · CANCELADA → lo decide el estudio (`renovar_sola_cuota_cancelada`, por defecto sí).
//  · PAUSADA   → NO: está congelada; reanudarla es cosa del estudio.
//  · otro      → no (falla cerrado): un estado nuevo no se renueva solo por la app.
// ─────────────────────────────────────────────────────────────────────────────

/** El código que la app traduce (y el texto, por si no lo traduce). */
export const CODIGO_CUOTA_EN_PAUSA = 'cuota-en-pausa';
export const MENSAJE_CUOTA_EN_PAUSA = 'Tu cuota está en pausa. Habla con tu estudio para reanudarla.';

export const CODIGO_PLAN_CANCELADO = 'plan-cancelado';
export const MENSAJE_PLAN_CANCELADO = 'Tu plan está cancelado. Para volver a activarlo, habla con tu estudio.';

export const CODIGO_PLAN_NO_RENOVABLE = 'plan-no-renovable';
export const MENSAJE_PLAN_NO_RENOVABLE = 'Tu plan no se puede renovar desde aquí. Habla con tu estudio.';

export type RenovacionPorLaAlumna = { ok: true } | { ok: false; codigo: string; error: string };

export function renovacionPorLaAlumna(
  estado: string | null | undefined,
  opts: { renovarSolaCuotaCancelada: boolean },
): RenovacionPorLaAlumna {
  switch (estado) {
    case 'ACTIVA':
    case 'EXPIRADA':
      return { ok: true };
    case 'CANCELADA':
      return opts.renovarSolaCuotaCancelada
        ? { ok: true }
        : { ok: false, codigo: CODIGO_PLAN_CANCELADO, error: MENSAJE_PLAN_CANCELADO };
    case 'PAUSADA':
      return { ok: false, codigo: CODIGO_CUOTA_EN_PAUSA, error: MENSAJE_CUOTA_EN_PAUSA };
    default:
      return { ok: false, codigo: CODIGO_PLAN_NO_RENOVABLE, error: MENSAJE_PLAN_NO_RENOVABLE };
  }
}

/**
 * Pagar online un recibo: el de RENOVACIÓN de una cuota en pausa no se paga desde
 * la app (la descongelaría). Cualquier otro recibo (una venta, una penalización,
 * una deuda que no renueva) sí, aunque la cuota esté en pausa.
 */
export function pagoOnlineDeRenovacionPermitido(recibo: { es_renovacion: boolean | null }, estadoCuota: string | null | undefined): boolean {
  return !(recibo.es_renovacion === true && estadoCuota === 'PAUSADA');
}
