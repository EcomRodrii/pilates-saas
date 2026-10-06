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

import { esReciboCobrable, type ReciboParaDeuda } from './deuda-recibo.ts';
import { leTocaPagarlaAElla, type CobroDeReciboAlumna } from './cobro-recibo-alumna.ts';

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

// ─────────────────────────────────────────────────────────────────────────────
// RECIBOS (6-oct-2026): renovar ESE plan, desde la app y sin salir de ella.
// ─────────────────────────────────────────────────────────────────────────────

export interface SuscripcionRenovable { id: string; estado: string | null; plan_id: string | null }

/**
 * Las suscripciones que la alumna puede renovar ella misma, con la regla de
 * siempre: las ACTIVA; si no tiene ninguna, la más reciente. `filas` llegan
 * ordenadas de más reciente a más antigua (por `fecha_inicio`).
 */
export function suscripcionesRenovables<T extends SuscripcionRenovable>(filas: readonly T[]): T[] {
  const activas = filas.filter((s) => s.estado === 'ACTIVA');
  return activas.length > 0 ? activas : filas.slice(0, 1);
}

export const CODIGO_PLAN_NO_ES_TUYO = 'plan-no-renovable-aqui';

/**
 * Cuál renueva. Con `pedida` (la app dice cuál): tiene que ser suya y estar entre
 * las que admite la regla — no se renueva por esta puerta un bono viejo mientras
 * tiene otro activo. Sin `pedida`, la primera admitida (lo de siempre).
 */
export function elegirSuscripcionARenovar<T extends SuscripcionRenovable>(
  filas: readonly T[], pedida?: string | null,
): { ok: true; sus: T } | { ok: false; status: 404 | 409; codigo?: string; error: string } {
  const admitidas = suscripcionesRenovables(filas);
  if (pedida) {
    const sus = admitidas.find((s) => s.id === pedida);
    if (sus) return { ok: true, sus };
    return filas.some((s) => s.id === pedida)
      ? { ok: false, status: 409, codigo: CODIGO_PLAN_NO_ES_TUYO, error: 'Ese plan no se renueva desde aquí. Habla con tu estudio.' }
      : { ok: false, status: 404, error: 'No encontramos ese plan.' };
  }
  const sus = admitidas[0];
  return sus ? { ok: true, sus } : { ok: false, status: 404, error: 'No tienes ningún plan que renovar' };
}

export const CODIGO_PLAN_YA_NO_SE_VENDE = 'plan-ya-no-se-vende';

/**
 * Un plan que el estudio ya no vende (`activo: false`) solo se renueva si es su
 * cuota ACTIVA (el estudio sigue cobrándosela): a quien ya lo dejó no se le vuelve
 * a vender algo que el estudio retiró.
 */
export function planSeRenueva(estadoSuscripcion: string | null | undefined, plan: { activo?: boolean | null }): RenovacionPorLaAlumna {
  if (plan.activo === false && estadoSuscripcion !== 'ACTIVA') {
    return { ok: false, codigo: CODIGO_PLAN_YA_NO_SE_VENDE, error: 'Ese plan ya no se vende. Mira los planes de tu estudio.' };
  }
  return { ok: true };
}

export const CODIGO_RENOVACION_COBRANDOSE = 'renovacion-cobrandose';
export const MENSAJE_RENOVACION_COBRANDOSE = 'Tu renovación se está cobrando ahora mismo. Mira tus pagos en un momento: no hace falta que la pagues.';

/**
 * Un recibo que ya hay para esa suscripción, ¿se paga ESE? Solo uno de renovación
 * (`es_renovacion`) y que se pueda cobrar; uno que está en el banco o con un cobro
 * con su tarjeta en vuelo NO se le da para pagar otra vez.
 */
export function reciboPrevioDeRenovacion(
  r: ReciboParaDeuda & { es_renovacion?: boolean | null; cobro_off_session_clave?: string | null },
): 'reutilizar' | 'cobrandose' | 'ignorar' {
  if (r.es_renovacion !== true) return 'ignorar';
  if (r.estado === 'EN_CURSO' || r.cobro_off_session_clave) return 'cobrandose';
  return esReciboCobrable(r) ? 'reutilizar' : 'ignorar';
}

export const CODIGO_RENOVACION_LA_COBRA_OTRO = 'renovacion-la-cobra-otro';

/**
 * La renovación que ya hay, ¿se la damos a pagar a ella? Con la regla de su app (`leTocaPagarlaAElla`, de
 * `cobro-recibo-alumna.ts`), no con otra: si la cobra el banco (remesa o SEPA), su tarjeta guardada con el reintento
 * programado, si se está cobrando o si la cuota está en pausa, NO. Los códigos que la app ya sabe leer se conservan
 * (`cuota-en-pausa`, `renovacion-cobrandose`); el resto es `renovacion-la-cobra-otro`, con lo que se le dice en Recibos.
 * `null` (la regla dice que no es deuda): tampoco, falla cerrado.
 */
export function renovacionQuePagaElla(cobro: CobroDeReciboAlumna | null): RenovacionPorLaAlumna {
  if (leTocaPagarlaAElla(cobro)) return { ok: true };
  if (cobro?.como === 'EN_MARCHA') return { ok: false, codigo: CODIGO_RENOVACION_COBRANDOSE, error: MENSAJE_RENOVACION_COBRANDOSE };
  if (cobro?.como === 'ESTUDIO' && cobro.motivo === 'cuota-en-pausa') {
    return { ok: false, codigo: CODIGO_CUOTA_EN_PAUSA, error: MENSAJE_CUOTA_EN_PAUSA };
  }
  const error = cobro?.como === 'BANCO'
    ? (cobro.via === 'remesa'
      ? 'Tu estudio pasará tu renovación a tu banco. No tienes que hacer nada.'
      : 'Tu renovación la cobrará tu banco. No tienes que hacer nada.')
    : cobro?.como === 'TARJETA'
      ? 'Tu renovación se cobrará de tu tarjeta guardada. No tienes que hacer nada.'
      : 'Tu renovación no se paga desde aquí. Habla con tu estudio.';
  return { ok: false, codigo: CODIGO_RENOVACION_LA_COBRA_OTRO, error };
}
