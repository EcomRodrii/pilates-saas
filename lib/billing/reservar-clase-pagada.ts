// ─────────────────────────────────────────────────────────────────────────────
// «Pagar y reservar sin login previo» (docs/reserva-sin-login-diseno.md §4.2):
// reservar la clase que venía con la compra, una vez entregado el plan que la
// cubre.
//
// Esto es de la COMPRA, no del cobro: por eso no vive en `confirmar-cobro.ts`.
// Estaba copiado tres veces casi literal —webhook Checkout Session (Bizum sin
// login), webhook checkout embebido y conciliador—; los tres llaman ahora aquí
// y cada uno conserva su texto de alerta.
//
// Best-effort a propósito: el dinero y el plan ya están entregados, así que un
// fallo aquí no puede tumbar el evento. Pero es `error` y no `warning`: la socia
// ha PAGADO por una clase concreta y la pantalla ya le dijo que estaba
// reservada, así que si no se avisa nadie se entera. Además del aviso a Sentry
// se avisa al mostrador dentro del panel (I-3, auditoría 19-ago), que es quien
// puede llamarla hoy mismo.
//
// Idempotente por `res-web-<pi>` y serializado por el FOR UPDATE de
// `reservar_plaza`: la carrera webhook/conciliador acaba en YA_RESERVADA, no en
// plaza doble.
// ─────────────────────────────────────────────────────────────────────────────
//
// P06 · Fase A (6-oct-2026): con la fila de `pagos_clase` del pago (la que abrió el
// cobro con clase), además se REGISTRA en qué acabó: RESERVADA, o COMPENSADA con su
// motivo (la clase queda a su favor en lo que compró), o sigue PAGADO para que el
// barrido del conciliador lo reintente; al tercer fallo, COMPENSADA ERROR con aviso.
// Ningún pago correcto se queda sin desenlace registrado. Sin fila (pagos de antes,
// o la tabla aún sin aplicar), exactamente como antes.
import type { SupabaseClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  conPrioridadEnLaCola, destinoDelPago, MAX_INTENTOS_RESERVA, type DestinoPagoClase, type MotivoCompensacion,
  type ReservaTrasPago,
} from './resultado-pago-clase.ts';

export type ViaReservaPagada = 'checkout' | 'embebido' | 'conciliador';

const TEXTOS: Record<ViaReservaPagada, { sinPlaza: string; sinPago: string; contexto: string; tags?: Record<string, string> }> = {
  checkout: {
    sinPlaza: '[stripe webhook] checkout (Bizum sin login): plan entregado pero NO se pudo reservar la clase',
    sinPago: '[stripe webhook] checkout (Bizum sin login): sin payment_intent para reservar la clase',
    contexto: 'reservarPlazaTrasPagoPublico',
  },
  embebido: {
    sinPlaza: '[stripe webhook] checkout embebido: plan entregado pero NO se pudo reservar la clase',
    sinPago: '[stripe webhook] checkout embebido: sin payment_intent para reservar la clase',
    contexto: 'reservarPlazaTrasPagoPublico',
  },
  conciliador: {
    sinPlaza: '[conciliador] plan entregado pero NO se pudo reservar la clase pagada',
    sinPago: '[conciliador] sin payment_intent para reservar la clase pagada',
    contexto: 'conciliador reservarPlazaTrasPagoPublico',
    tags: { area: 'cobros', tipo: 'conciliado-sin-plaza' },
  },
};

export async function reservarClasePagada(
  admin: SupabaseClient,
  p: {
    studioId: string;
    sesionId: string;
    socioId: string;
    /** El cargo: sin él `reservarPlazaTrasPagoPublico` no tiene con qué ser idempotente. */
    paymentIntentId: string | null;
    /** Si la socia pagó por una camilla/plaza concreta, se le da ESA. */
    spotId: string | null;
    via: ViaReservaPagada;
    /** Ids de Stripe para localizar el caso en Sentry (`sessionId` o `paymentIntentId`). */
    referencia: Record<string, string>;
    /** La fila de `pagos_clase` del pago (metadata `pagoClaseId`). Sin ella, como siempre. */
    pagoClaseId?: string | null;
    /** La suscripción que entregó este pago (`sus-web-…`): la que debería pagar la plaza. */
    suscripcionEntregadaId?: string | null;
    /** Cuándo se cobró (el `created` del evento de Stripe). Sin él, ahora (sin prioridad en la cola). */
    pagadoEn?: string | null;
  },
): Promise<DestinoPagoClase | null> {
  const t = TEXTOS[p.via];
  if (!p.paymentIntentId) {
    // No debería pasar (un pago completado trae su payment_intent), pero si
    // pasara sería el mismo problema: dinero cobrado, clase sin reservar.
    Sentry.captureMessage(t.sinPago, {
      level: 'error', ...(t.tags ? { tags: t.tags } : {}),
      extra: { studioId: p.studioId, sesionId: p.sesionId, ...p.referencia },
    });
    return null;
  }
  // La fila del pago, si la hay: se marca PAGADO (si aún estaba ABIERTO) y se lee lo
  // que hace falta para decidir. Si ya tiene desenlace (otra entrega se adelantó), nada.
  const fila = p.pagoClaseId ? await filaDelPago(admin, p.studioId, p.pagoClaseId, p.pagadoEn ?? null) : null;
  if (fila === 'resuelta') return null;
  try {
    const { reservarPlazaTrasPagoPublico } = await import('@/lib/db/supabase-data-admin');
    // La plaza la paga lo que entregó ESTE pago, no otro bono suyo (migr 20261006120200).
    const entregada = p.suscripcionEntregadaId ?? (fila ? fila.suscripcion_id : null);
    let r = await reservarPlazaTrasPagoPublico({
      studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId,
      paymentIntentId: p.paymentIntentId, spotId: p.spotId, suscripcionEntregadaId: entregada,
    });
    let destino: DestinoPagoClase | null = null;
    if (fila) {
      destino = destinoDelPago(r as ReservaTrasPago, { sinSitio: !p.spotId, pagadaConLoEntregado: await pagadaConLoEntregado(admin, r, p.suscripcionEntregadaId ?? fila.suscripcion_id) });
      if (destino.tipo === 'reintentar-sin-sitio') {
        // Pagó por un sitio que otra se llevó primero: la plaza sin sitio concreto.
        r = await reservarPlazaTrasPagoPublico({
          studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, paymentIntentId: p.paymentIntentId, spotId: null,
          suscripcionEntregadaId: entregada,
        });
        destino = destinoDelPago(r as ReservaTrasPago, { sinSitio: true, pagadaConLoEntregado: await pagadaConLoEntregado(admin, r, p.suscripcionEntregadaId ?? fila.suscripcion_id) });
      }
      destino = await registrarDesenlace(admin, p, fila, destino, r.ok ? r.reservaId : null);
      // Reintento: sigue PAGADO, sin aviso todavía (el barrido lo vuelve a intentar).
      if (destino.tipo === 'reintentar') return destino;
    }
    if (!r.ok) {
      // `ya-tenia-reserva`: la socia ya tenía plaza en la clase (con su bono, o
      // de otro pago), así que ESTE pago no se ha usado. No es un fallo del
      // sistema (warning, no error), pero hay dinero que devolver o dejar a su
      // favor: el mostrador tiene que enterarse igual.
      const yaTenia = r.motivo === 'ya-tenia-reserva';
      Sentry.captureMessage(t.sinPlaza, {
        level: yaTenia ? 'warning' : 'error',
        tags: { ...(t.tags ?? {}), ...(yaTenia ? { situacion: 'ya-tenia-reserva' } : {}) },
        extra: { studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, ...p.referencia, motivo: r.motivo, detalle: r.detalle },
      });
      const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
      // Lo que ya tenía decide el texto y el destino: plaza → la ficha (devolver o
      // dejarlo a su favor); cola o pendiente de aprobar → el calendario de la clase.
      const { situacionYaTenia } = await import('@/lib/notifications/pagada-sin-plaza');
      await emitirReservaPagadaSinPlaza(admin, {
        studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId,
        situacion: yaTenia ? situacionYaTenia(r.estadoPrevio) : 'sin-reserva',
        paymentIntentId: p.paymentIntentId,
      });
      if (fila) await sellarAvisoEstudio(admin, p.pagoClaseId!);
    } else if (r.estado === 'LISTA_ESPERA') {
      // Pagó y la clase se llenó entre crear el cobro y confirmarlo:
      // `reservar_plaza` la metió en la cola (ok:true). Desde el panel es una
      // fila de espera más, pero aquí hay dinero cobrado — el mostrador tiene
      // que poder llamarla hoy. Si se libera plaza, la promoción automática
      // sigue siendo el camino normal.
      const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
      // Con SU pago: /reservar elige el aviso de ESTE pago (estado-pago), y uno sin
      // pago valdría para cualquier otro pago de esa socia ese día.
      await emitirReservaPagadaSinPlaza(admin, {
        studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, situacion: 'en-espera',
        paymentIntentId: p.paymentIntentId,
      });
      if (fila) await sellarAvisoEstudio(admin, p.pagoClaseId!);
    }
    return destino;
  } catch (e) {
    Sentry.captureException(e instanceof Error ? e : new Error(t.contexto), {
      extra: { contexto: t.contexto, studioId: p.studioId, sesionId: p.sesionId, ...p.referencia },
    });
    // Una excepción tras cobrar: el pago sigue PAGADO y el barrido lo reintenta; al
    // tercer fallo se compensa con ERROR y se avisa (nunca se queda sin desenlace).
    if (fila) {
      try {
        const d = await registrarDesenlace(admin, p, fila, { tipo: 'reintentar' }, null);
        if (d.tipo === 'compensada') await avisarError(admin, p);
        return d;
      } catch (e2) {
        Sentry.captureException(e2 instanceof Error ? e2 : new Error('registrar el desenlace del pago de clase'), {
          level: 'error', tags: { area: 'cobros', tipo: 'pago-clase-sin-desenlace' }, extra: { studioId: p.studioId, pagoClaseId: p.pagoClaseId },
        });
      }
    }
    return null;
  }
}

// ── La fila de `pagos_clase` ────────────────────────────────────────────────

interface FilaPago {
  estado: string;
  plaza_comprobada_en: string | null;
  pagado_en: string | null;
  intentos_reserva: number;
  suscripcion_id: string | null;
}

const RESUELTAS = new Set(['RESERVADA', 'COMPENSADA', 'REEMBOLSADA', 'CERRADA', 'CANCELADO']);

/**
 * Lee la fila y la marca PAGADO si aún estaba ABIERTO. `null`: no hay fila (pago de
 * antes, o la tabla aún sin aplicar): se sigue como siempre. `'resuelta'`: ya tiene
 * desenlace (una entrega anterior se adelantó, o se canceló): no se toca.
 */
async function filaDelPago(admin: SupabaseClient, studioId: string, id: string, pagadoEn: string | null): Promise<FilaPago | 'resuelta' | null> {
  const { data, error } = await admin.from('pagos_clase')
    .select('estado, plaza_comprobada_en, pagado_en, intentos_reserva, suscripcion_id')
    .eq('id', id).eq('studio_id', studioId).maybeSingle();
  if (error || !data) {
    if (error && error.code !== '42P01') {
      Sentry.captureMessage('[pago de clase] no se pudo leer la fila del pago', {
        level: 'warning', tags: { area: 'cobros' }, extra: { studioId, pagoClaseId: id, detalle: error.message },
      });
    }
    return null;
  }
  const fila = data as FilaPago;
  if (RESUELTAS.has(fila.estado)) return 'resuelta';
  if (fila.estado === 'ABIERTO') {
    const { data: r, error: e } = await admin.rpc('registrar_resultado_pago_clase', {
      p_id: id, p_studio_id: studioId, p_estado: 'PAGADO', p_pagado_en: pagadoEn,
    });
    if (e) return null;
    const pagada = (r as { estado: string }[] | null)?.[0];
    if (pagada && pagada.estado !== 'PAGADO') return 'resuelta';
    const { data: ahora } = await admin.from('pagos_clase').select('pagado_en').eq('id', id).maybeSingle();
    fila.pagado_en = (ahora?.pagado_en as string | null | undefined) ?? pagadoEn;
    fila.estado = 'PAGADO';
  }
  return fila;
}

/** ¿La plaza CONFIRMADA la pagó lo que entregó este pago? Sin poder saberlo, sí (como antes). */
async function pagadaConLoEntregado(
  admin: SupabaseClient, r: { ok: boolean; estado?: string; reservaId?: string }, entregada: string | null,
): Promise<boolean> {
  if (!r.ok || r.estado !== 'CONFIRMADA' || !r.reservaId || !entregada) return true;
  const [{ data: reserva }, { data: sus }] = await Promise.all([
    admin.from('reservas').select('bono_suscripcion_id').eq('id', r.reservaId).maybeSingle(),
    admin.from('suscripciones').select('sesiones_restantes').eq('id', entregada).maybeSingle(),
  ]);
  if (!reserva) return true;
  // Lo entregado es una cuota (sin sesiones que gastar): si la plaza se confirmó, la cubrió ella.
  if (sus && sus.sesiones_restantes == null) return true;
  return (reserva.bono_suscripcion_id as string | null) === entregada;
}

/** Escribe el desenlace (compare-and-set de la RPC). Al tercer fallo, ERROR. Devuelve el destino final. */
async function registrarDesenlace(
  admin: SupabaseClient,
  p: { studioId: string; pagoClaseId?: string | null; suscripcionEntregadaId?: string | null; pagadoEn?: string | null },
  fila: FilaPago, destino: DestinoPagoClase, reservaId: string | null,
): Promise<DestinoPagoClase> {
  const id = p.pagoClaseId!;
  let final = destino;
  if (destino.tipo === 'reintentar' || destino.tipo === 'reintentar-sin-sitio') {
    if (fila.intentos_reserva + 1 >= MAX_INTENTOS_RESERVA) {
      final = { tipo: 'compensada', motivo: 'ERROR' };
    } else {
      await admin.rpc('registrar_resultado_pago_clase', { p_id: id, p_studio_id: p.studioId, p_estado: 'PAGADO' });
      return { tipo: 'reintentar' };
    }
  }
  const motivo: MotivoCompensacion | null = final.tipo === 'compensada' ? final.motivo : null;
  const { error } = await admin.rpc('registrar_resultado_pago_clase', {
    p_id: id, p_studio_id: p.studioId,
    p_estado: final.tipo === 'reservada' ? 'RESERVADA' : 'COMPENSADA',
    p_motivo: motivo, p_reserva_id: reservaId, p_suscripcion_id: p.suscripcionEntregadaId ?? null,
    p_pagado_en: p.pagadoEn ?? null,
    p_prioridad: motivo ? conPrioridadEnLaCola(motivo, fila.plaza_comprobada_en, fila.pagado_en ?? p.pagadoEn ?? null) : false,
  });
  if (error) throw new Error(`registrar_resultado_pago_clase: ${error.message}`);
  return final;
}

async function sellarAvisoEstudio(admin: SupabaseClient, id: string): Promise<void> {
  await admin.from('pagos_clase').update({ aviso_estudio_en: new Date().toISOString() }).eq('id', id).is('aviso_estudio_en', null);
}

/** Tras el tercer fallo (ERROR): el mostrador tiene que saberlo hoy. */
async function avisarError(admin: SupabaseClient, p: { studioId: string; sesionId: string; socioId: string; paymentIntentId: string | null; pagoClaseId?: string | null }): Promise<void> {
  const { emitirReservaPagadaSinPlaza } = await import('@/lib/notifications/emit');
  await emitirReservaPagadaSinPlaza(admin, {
    studioId: p.studioId, sesionId: p.sesionId, socioId: p.socioId, situacion: 'sin-reserva', paymentIntentId: p.paymentIntentId,
  });
  if (p.pagoClaseId) await sellarAvisoEstudio(admin, p.pagoClaseId);
}
