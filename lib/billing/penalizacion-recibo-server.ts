// ─────────────────────────────────────────────────────────────────────────────
// Acceso a datos de «la penalización sigue a su recibo» para el dunning y el
// barrido del cron. Las decisiones (qué estado del recibo resuelve qué, con qué
// estados puede cobrar el dunning) viven en `penalizacion-aprobar-reglas.ts`,
// probadas sin Supabase.
//
// La penalización se busca por su id (sale del id del recibo) Y por `recibo_id`:
// solo cuenta si apunta a ESE recibo.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  cobroManualDeRecibo, hayQueRevisarLiquidacion, motivoRevisionPorRecibo, penalizacionDelRecibo, seguirAlRecibo,
  type ContextoCobroManual, type EstadoPenalizacion, type LecturaPenalizacion, type Seguimiento, type VeredictoCobroManual,
} from '@/lib/billing/penalizacion-aprobar-reglas';
import {
  pedirRevisionLiquidacionPenalizacion, type PenalizacionRepartida,
} from '@/lib/equipo/liquidacion-penalizacion-revertida';

/**
 * Saca del dunning el recibo de una penalización que no lo va a cobrar
 * (`proximo_reintento = null`, solo si sigue PENDIENTE). Si algún día hay que
 * cobrarlo, lo vuelve a programar el cron (DETECTADA en automático) o lo cobra la
 * aprobación a mano. `true` si tocó el recibo.
 *
 * `hastaISO`: solo si su reintento ya vencía cuando arrancó el dunning (el mismo
 * corte que su consulta de candidatos). Si entre medias el cron lo programó para
 * cobrarlo, lleva un `proximo_reintento` posterior y no se toca.
 */
export async function desprogramarReciboDePenalizacion(
  admin: SupabaseClient, p: { studioId: string; reciboId: string; hastaISO: string },
): Promise<boolean> {
  if (!penalizacionDelRecibo(p.reciboId)) return false;
  const { data, error } = await admin.from('recibos').update({ proximo_reintento: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('estado', 'PENDIENTE')
    .lte('proximo_reintento', p.hastaISO).select('id');
  if (error) console.error('[dunning] no se pudo desprogramar el recibo de la penalización', p.reciboId, error.message);
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Borra el recibo de una penalización que se ha decidido NO cobrar
 * (OMITIDA_SIN_CONSENTIMIENTO, y cualquier OMITIDA_* desde el barrido del cron,
 * que ya soltaron `recibo_id`). Compare-and-set: solo si sigue PENDIENTE, sin
 * `proximo_reintento`, sin PaymentIntent enlazado, sin Checkout abierto y sin un
 * cobro de mostrador en vuelo (datáfono o Bizum del TPV) — cualquier otra cosa
 * puede tener dinero detrás y no se toca. Mismo patrón que el `borrarRecibo` del
 * cron. Devuelve las filas tocadas.
 */
export async function borrarReciboDePenalizacionSinCobro(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<{ error: boolean; tocadas: number }> {
  if (!penalizacionDelRecibo(p.reciboId)) return { error: false, tocadas: 0 };
  const { data, error } = await admin.from('recibos').delete()
    .eq('id', p.reciboId).eq('studio_id', p.studioId)
    .eq('estado', 'PENDIENTE').is('proximo_reintento', null)
    .is('stripe_payment_intent_id', null).is('checkout_session_id', null)
    .is('cobro_mostrador_pi', null)
    .select('id');
  if (error) console.error('[penalizaciones] no se pudo borrar el recibo de una penalización sin cobro', p.reciboId, error.message);
  return { error: !!error, tocadas: data?.length ?? 0 };
}

/**
 * Guardia de «Cobrar online» y de la aprobación desde Automatizaciones: el
 * recibo de una penalización solo se cobra ahí con el cobro ya decidido
 * (`cobroManualDeRecibo`). `null` = adelante (incluido cualquier recibo que no
 * sea de una penalización, sin leer nada). Sin service-role o sin poder leer la
 * penalización, no se cobra.
 *
 * Lo usan también el ejecutor del Decision OS (`panel`) y el checkout de la alumna
 * (`checkout_alumna`, que deja además pagar una FALLIDA). Lo que devuelve es un
 * objeto plano: el ejecutor lo llama dentro de un `step.run`.
 */
export async function bloqueoCobroManualDePenalizacion(
  admin: SupabaseClient | null, p: { studioId: string; reciboId: string; contexto?: ContextoCobroManual },
): Promise<Extract<VeredictoCobroManual, { ok: false }> | null> {
  if (cobroManualDeRecibo(p.reciboId).ok) return null; // no es de una penalización: no se lee nada
  let lectura: LecturaPenalizacion = { ok: false };
  if (admin) {
    try {
      lectura = await leerPenalizacionDelRecibo(admin, p);
    } catch {
      lectura = { ok: false };
    }
  }
  const veredicto = cobroManualDeRecibo(p.reciboId, lectura, p.contexto);
  return veredicto.ok ? null : veredicto;
}

/**
 * Guardia del mostrador (datáfono/Bizum del TPV): el recibo de una penalización
 * anulada no se cobra (`cobroManualDeRecibo` con `'mostrador'`). `null` =
 * adelante. Lee la penalización POR SU ID, apunte o no a este recibo.
 *
 * ⚠️ Falla ABIERTO a propósito: sin service-role o sin poder leerla, deja cobrar y
 * lo registra en Sentry. Hay una persona cobrando delante de la alumna, y parar el
 * mostrador por un fallo de lectura deja sin cobrar cuotas de verdad; el caso que
 * se evita (una penalización anulada con su recibo aún sin soltar) es mucho más
 * raro, y el barrido del cron lo suelta cada hora.
 */
export async function bloqueoCobroEnMostradorDePenalizacion(
  admin: SupabaseClient | null, p: { studioId: string; reciboId: string; origen: string },
): Promise<Extract<VeredictoCobroManual, { ok: false }> | null> {
  if (cobroManualDeRecibo(p.reciboId).ok) return null; // no es de una penalización: no se lee nada
  let lectura: LecturaPenalizacion = { ok: false };
  if (admin) {
    try {
      lectura = await leerPenalizacionPorIdDelRecibo(admin, p);
    } catch {
      lectura = { ok: false };
    }
  }
  const veredicto = cobroManualDeRecibo(p.reciboId, lectura, 'mostrador');
  if (veredicto.ok && veredicto.sinComprobar) {
    // Solo ids.
    Sentry.captureMessage('[penalizaciones] cobro en mostrador sin poder comprobar la penalización', {
      level: 'warning', tags: { area: 'cobros', tipo: 'penalizacion-mostrador' },
      extra: { reciboId: p.reciboId, studioId: p.studioId, origen: p.origen },
    });
  }
  return veredicto.ok ? null : veredicto;
}

/**
 * Estado de la penalización de un recibo `rec-penaliz-<id>` buscada solo por su
 * id (y estudio), sin exigir que apunte al recibo. `estado: null` = no existe.
 */
export async function leerPenalizacionPorIdDelRecibo(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<LecturaPenalizacion> {
  const penalizacionId = penalizacionDelRecibo(p.reciboId);
  if (!penalizacionId) return { ok: true, estado: null };
  const { data, error } = await admin.from('penalizaciones').select('estado')
    .eq('id', penalizacionId).eq('studio_id', p.studioId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, estado: (data?.estado as string | undefined) ?? null };
}

/** Estado de la penalización de un recibo `rec-penaliz-*`. Un recibo que no es de una: `estado: null`. */
export async function leerPenalizacionDelRecibo(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<LecturaPenalizacion> {
  const penalizacionId = penalizacionDelRecibo(p.reciboId);
  if (!penalizacionId) return { ok: true, estado: null };
  const { data, error } = await admin.from('penalizaciones').select('estado')
    .eq('id', penalizacionId).eq('studio_id', p.studioId).eq('recibo_id', p.reciboId).maybeSingle();
  if (error) return { ok: false };
  return { ok: true, estado: (data?.estado as string | undefined) ?? null };
}

/**
 * Deja la penalización como dice su recibo (COBRADO → COBRADA, FALLIDO →
 * FALLIDA). Nunca lanza: lo llama el dunning después de cobrar, y un fallo aquí
 * no puede reintentar ese step. Lo que no se escriba ahora lo recoge el barrido
 * horario del cron de penalizaciones. `null` si el recibo no es de una penalización.
 */
export async function seguirPenalizacionAlRecibo(
  admin: SupabaseClient, p: { studioId: string; reciboId: string },
): Promise<Seguimiento | null> {
  const penalizacionId = penalizacionDelRecibo(p.reciboId);
  if (!penalizacionId) return null;
  const penalizacion = (columnas: string) => admin.from('penalizaciones').select(columnas)
    .eq('id', penalizacionId).eq('studio_id', p.studioId).eq('recibo_id', p.reciboId);
  try {
    return await seguirAlRecibo({
      leerRecibo: async () => {
        const { data, error } = await admin.from('recibos').select('estado')
          .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
        return error ? { ok: false } : { ok: true, estado: (data?.estado as string | undefined) ?? null };
      },
      cerrarPenalizacion: async (e, estadoRecibo) => {
        let desde: string[] = [...e.desde];
        let previa: (PenalizacionRepartida & { estado: string }) | null = null;
        if (e.desde.includes('COBRADA')) {
          // Una COBRADA que deja de serlo (adeudo SEPA que no entró o que vuelve al
          // dunning, recibo devuelto) pudo repartirse ya: se leen antes sus datos de
          // cuando estaba cobrada, porque el UPDATE pisa `procesada_en`, que es lo
          // que decide el periodo de la liquidación.
          const lectura = await penalizacion('estado, reserva_id, importe, procesada_en')
            .maybeSingle<PenalizacionRepartida & { estado: string }>();
          // Sin esa lectura no se escribe: la COBRADA pasaría a FALLIDA sin pedir la
          // revisión, y el barrido ya no la volvería a ver. Se queda para la hora siguiente.
          if (lectura.error) {
            console.error('[penalizaciones] no se pudo leer la penalización antes de reflejar el recibo', penalizacionId, lectura.error.message);
            return { error: true, tocadas: 0 };
          }
          previa = lectura.data;
          // Y solo desde el estado leído: si cambió entre medias (la socia pagó y otra
          // llamada la dejó COBRADA con el recibo ya cobrado), no se toca nada.
          desde = previa && e.desde.includes(previa.estado as EstadoPenalizacion) ? [previa.estado] : [];
          if (desde.length === 0) return { error: false, tocadas: 0 };
        }
        const { data, error } = await admin.from('penalizaciones')
          .update({ estado: e.estado, procesada_en: new Date().toISOString() })
          .eq('id', penalizacionId).eq('studio_id', p.studioId).eq('recibo_id', p.reciboId)
          .in('estado', desde).select('id');
        if (error) console.error('[penalizaciones] no se pudo reflejar el recibo en la penalización', penalizacionId, error.message);
        const tocadas = data?.length ?? 0;
        if (tocadas > 0 && previa?.reserva_id && hayQueRevisarLiquidacion(previa.estado, e)) {
          const revisada = await pedirRevisionLiquidacionPenalizacion(admin, p.studioId, previa,
            motivoRevisionPorRecibo(estadoRecibo, Number(previa.importe)));
          if (!revisada) {
            Sentry.captureMessage('[penalizaciones] no se pudo pedir la revisión de la liquidación de una penalización no cobrada', {
              level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-recibo' },
              extra: { penalizacionId, reciboId: p.reciboId, studioId: p.studioId },
            });
          }
        }
        return { error: !!error, tocadas };
      },
      leerEstadoPenalizacion: async () => {
        const { data, error } = await penalizacion('estado').maybeSingle<{ estado: string }>();
        return error ? null : (data?.estado ?? null);
      },
      notificarPago: async () => {
        const { data } = await penalizacion('socio_id, importe').maybeSingle<{ socio_id: string | null; importe: number | null }>();
        if (!data?.socio_id) return;
        const { emitirPagoPenalizacion } = await import('@/lib/notifications/emit');
        await emitirPagoPenalizacion(admin, {
          studioId: p.studioId, socioId: data.socio_id, importe: Number(data.importe ?? 0), penalizacionId,
        });
      },
    });
  } catch (e) {
    // Solo ids: ni nombre, ni email, ni importe de la socia.
    Sentry.captureException(e instanceof Error ? e : new Error('No se pudo reflejar el recibo en la penalización'), {
      level: 'error', tags: { area: 'cobros', tipo: 'penalizacion-recibo' },
      extra: { penalizacionId, reciboId: p.reciboId, studioId: p.studioId },
    });
    return null;
  }
}
