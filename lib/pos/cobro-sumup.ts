import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esEstadoFinal } from './tipos.ts';
import { claveReconciliacionSumup, leerReferenciaSumup, referenciaSumup } from './sumup.ts';
import {
  cobrosParaBarrer, esDeEste, HORAS_PARA_AVISAR, MINUTOS_DE_HISTORIAL, movimientosPorMirar,
} from './terminal-sumup.ts';
import { cuentaSumupDelEstudio, prepararCobroExistente, type CobroListo } from './cobro-del-estudio.ts';
import { cerrarReciboPos, cerrarVentaPos } from './cerrar-cobro-pos.ts';
import type { ObjetoCobro } from './sumup-aviso.ts';
import type { ConsultaCobro } from './consulta-stripe.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Un cobro del datáfono de SumUp que nadie está mirando en la Caja.
//
// Con Stripe, el aviso firmado (`payment_intent.succeeded`) cierra la venta o el
// recibo aunque el mostrador haya cerrado la pestaña. Con SumUp lo hacen dos
// caminos, los dos por aquí:
//   · su aviso (`solo.transaction.updated`, app/api/webhooks/sumup), que llega
//     SIN firma: solo dice a quién preguntar;
//   · el barrido horario de cobros (lib/inngest/conciliar-cobros.ts), por si el
//     aviso no llega nunca: los cobros guardados en vuelo y, además, el historial
//     de la cuenta, por si un cobro entró sin referencia guardada (la venta se
//     anuló, el recibo se soltó, el inicio no contestó).
// La verdad sale SIEMPRE de la API de SumUp con el token del propio estudio, y el
// cierre es el mismo que el del aviso de Stripe (lib/pos/cerrar-cobro-pos.ts).
// ─────────────────────────────────────────────────────────────────────────────

export type ResultadoSumup =
  /** Cerrado ahora, o ya lo estaba. */
  | { tipo: 'cerrado' }
  /** Aún sin terminar, o SumUp no ha contestado: se vuelve a preguntar. */
  | { tipo: 'esperar' }
  /** Acabó sin cobrar: la venta se anula y el recibo queda libre para otro intento. */
  | { tipo: 'soltado' }
  /** No cuadra (otro objeto, otro importe, un estado raro): a Sentry y a mano. */
  | { tipo: 'revisar'; motivo: string }
  /** No hay un cobro de SumUp de este objeto que resolver. */
  | { tipo: 'nada' };

type FilaVenta = { id: string; estado: string | null; stripe_payment_intent_id: string | null };
type FilaRecibo = { id: string; estado: string; importe: number | string; cobro_mostrador_pi: string | null; sumup_transaction_id: string | null };

async function leerObjeto(admin: SupabaseClient, studioId: string, o: ObjetoCobro):
  Promise<{ ok: true; venta?: FilaVenta; recibo?: FilaRecibo; referencia: string | null } | { ok: false }> {
  if (o.tipo === 'venta') {
    const { data, error } = await admin.from('ventas_pos').select('id, estado, stripe_payment_intent_id')
      .eq('id', o.id).eq('studio_id', studioId).maybeSingle();
    if (error) return { ok: false };
    const venta = (data as FilaVenta | null) ?? undefined;
    // Una venta ya cerrada o anulada no tiene cobro en vuelo, aunque guarde la referencia.
    return { ok: true, venta, referencia: venta?.estado === 'PENDIENTE_PAGO' ? venta.stripe_payment_intent_id : null };
  }
  const { data, error } = await admin.from('recibos').select('id, estado, importe, cobro_mostrador_pi, sumup_transaction_id')
    .eq('id', o.id).eq('studio_id', studioId).maybeSingle();
  if (error) return { ok: false };
  const recibo = (data as FilaRecibo | null) ?? undefined;
  return { ok: true, recibo, referencia: recibo?.cobro_mostrador_pi ?? null };
}

function revisar(motivo: string, extra: Record<string, unknown>): ResultadoSumup {
  Sentry.captureMessage(`[pos/sumup] ${motivo}`, { level: 'error', tags: { area: 'cobros', proveedor: 'sumup' }, extra });
  return { tipo: 'revisar', motivo };
}

/** Dinero que entró y no casa con nada: se anota para reconciliar (una vez por transacción). */
async function anotar(admin: SupabaseClient, studioId: string, transaccionId: string, centimos: number | null | undefined, concepto: string):
  Promise<boolean> {
  const { error } = await admin.from('reconciliaciones_pos').insert({
    payment_intent_id: claveReconciliacionSumup(transaccionId), studio_id: studioId,
    importe: (centimos ?? 0) / 100, concepto,
  });
  return !error || error.code === '23505';
}

/**
 * SumUp dice PAGADO: las mismas comprobaciones que el sondeo del mostrador, y el
 * mismo cierre que el aviso de Stripe. Si el importe no cuadra, el dinero entró
 * igual: se anota para reconciliar, no se da el recibo por cobrado.
 */
async function cerrarPagado(
  admin: SupabaseClient, studioId: string, o: ObjetoCobro, referencia: string,
  est: ConsultaCobro, recibo: FilaRecibo | undefined, p: { exigirDueno: boolean },
): Promise<ResultadoSumup> {
  const extra = { studioId, objeto: `${o.tipo}:${o.id}`, referencia };
  if (!esDeEste(est, studioId, o, { exigirDueno: p.exigirDueno })) {
    return revisar('cobro pagado que no corresponde a lo que se cobraba', { ...extra, meta: est.metadata ?? {} });
  }
  if (o.tipo === 'recibo') {
    if (!recibo) return { tipo: 'nada' };
    const esperado = Math.round(Number(recibo.importe) * 100);
    if (est.importeCentimos == null || est.importeCentimos !== esperado) {
      if (est.cargoSumup && !(await anotar(admin, studioId, est.cargoSumup, est.importeCentimos, 'Cobro de SumUp con otro importe que el recibo'))) {
        return { tipo: 'esperar' };
      }
      return revisar('el importe cobrado no coincide con el recibo', { ...extra, esperado, cobrado: est.importeCentimos ?? null });
    }
    // Si el recibo ya no admite cobro (otro cargo lo cerró, se anuló), `confirmarCobro`
    // avisa del doble cobro y lo deja en el libro de intentos.
    const cierre = await cerrarReciboPos(admin, {
      studioId, reciboId: o.id, metodoCobro: 'TARJETA', paymentIntentId: null,
      cargoSumup: est.cargoSumup ?? null, referencia, aviso: 'pos/sumup',
    });
    return cierre.ok ? { tipo: 'cerrado' } : { tipo: 'esperar' };
  }
  if (est.importeCentimos == null) return { tipo: 'esperar' };
  const cierre = await cerrarVentaPos(admin, {
    studioId, ventaId: o.id, referencia,
    ...(est.cargoSumup ? { claveReconciliacion: claveReconciliacionSumup(est.cargoSumup) } : {}),
    // La RPC compara este importe con el total de la venta (IMPORTE_NO_COINCIDE).
    importe: est.importeCentimos / 100,
    metodoPagoReal: null,
    concepto: 'Cobro del datáfono de SumUp',
    aviso: 'pos/sumup',
  });
  return cierre.ok ? { tipo: 'cerrado' } : { tipo: 'esperar' };
}

/** Acabó sin cobrar. Venta: se anula (devuelve stock). Recibo: se suelta, con CAS sobre la referencia. */
async function soltar(admin: SupabaseClient, studioId: string, o: ObjetoCobro, referencia: string, est: ConsultaCobro): Promise<ResultadoSumup> {
  if (o.tipo === 'venta') {
    const { error } = await admin.rpc('fallar_pago_venta_pos', {
      p_venta_id: o.id, p_studio_id: studioId, p_pago_estado: est.estado, p_motivo: est.error ?? null,
    });
    return error ? { tipo: 'esperar' } : { tipo: 'soltado' };
  }
  const { error } = await admin.from('recibos')
    .update({ cobro_mostrador_pi: null, cobro_mostrador_checkout_session_id: null })
    .eq('id', o.id).eq('studio_id', studioId).eq('cobro_mostrador_pi', referencia);
  return error ? { tipo: 'esperar' } : { tipo: 'soltado' };
}

async function cobroDe(admin: SupabaseClient, studioId: string, referencia: string, cobro?: CobroListo): Promise<CobroListo | null> {
  if (cobro) return cobro;
  const preparado = await prepararCobroExistente(admin, studioId, referencia, 'DATAFONO', { origen: '' });
  return preparado.ok ? preparado.cobro : null;
}

/**
 * Resuelve el cobro de SumUp EN VUELO de una venta o un recibo. Idempotente: el
 * cierre es un compare-and-set (`confirmar_pago_venta_pos`, `confirmarCobro`) y
 * soltar va acotado a la referencia exacta.
 *
 * @param soloSi el `client_transaction_id` del aviso: si el cobro en vuelo es
 *   otro, no se toca (ver `cobroSumupHuerfano` para ese caso).
 */
export async function resolverCobroSumup(
  admin: SupabaseClient,
  p: { studioId: string; objeto: ObjetoCobro; soloSi?: string; cobro?: CobroListo },
): Promise<ResultadoSumup> {
  const leido = await leerObjeto(admin, p.studioId, p.objeto);
  if (!leido.ok) return { tipo: 'esperar' };
  const ref = leerReferenciaSumup(leido.referencia);
  if (!ref || !leido.referencia) return { tipo: 'nada' };
  if (p.soloSi && ref.clientTransactionId !== p.soloSi) return { tipo: 'nada' };

  const cobro = await cobroDe(admin, p.studioId, leido.referencia, p.cobro);
  if (!cobro) return { tipo: 'esperar' };
  const est = await cobro.consultar(leido.referencia);
  if (est.estado === 'PAGADO') {
    return cerrarPagado(admin, p.studioId, p.objeto, leido.referencia, est, leido.recibo, { exigirDueno: p.objeto.tipo === 'recibo' });
  }
  // Un aviso de SumUp PRUEBA que la transacción existe: si su API aún no la
  // devuelve, es un retraso, nunca «no llegó a empezar».
  if (est.estado === 'EXPIRADO' && p.soloSi) return { tipo: 'esperar' };
  if (!esEstadoFinal(est.estado)) return { tipo: 'esperar' };
  if (est.estado === 'ERROR') {
    // Puede ser dinero que entró y salió (REFUNDED) o algo que no entendemos: nadie
    // lo anula sin mirarlo. El mostrador, si está delante, decide con su sondeo.
    return revisar('cobro en un estado que no se resuelve solo', {
      studioId: p.studioId, objeto: `${p.objeto.tipo}:${p.objeto.id}`, referencia: leido.referencia, detalle: est.error ?? null,
    });
  }
  return soltar(admin, p.studioId, p.objeto, leido.referencia, est);
}

/**
 * Un cobro de SumUp que NO es el que está guardado en vuelo (la venta se anuló, el
 * recibo se soltó o se volvió a intentar, el inicio no contestó). Si SumUp dice que
 * cobró y de quién es, se cierra por la misma puerta que cualquier otro: la venta
 * pendiente se cobra, la anulada o ya pagada con otro cargo va a reconciliar
 * (`cerrarVentaPos`), y el recibo se cobra si aún se puede o `confirmarCobro` avisa
 * del doble cobro. Sin dueño dicho por SumUp no hay nada que respalde a quién es.
 *
 * @param objeto el del aviso firmado; si SumUp dice que es de otro, no se toca.
 */
export async function cobroSumupHuerfano(
  admin: SupabaseClient,
  p: { studioId: string; objeto?: ObjetoCobro; clientTransactionId: string; cobro: CobroListo },
): Promise<ResultadoSumup> {
  // Con la fecha de ahora: solo sirve para preguntar por el id.
  const referencia = referenciaSumup(p.clientTransactionId, new Date());
  const est = await p.cobro.consultar(referencia);
  if (est.estado !== 'PAGADO' || !est.cargoSumup) {
    return est.estado === 'PROCESANDO' || est.estado === 'PENDIENTE' ? { tipo: 'esperar' } : { tipo: 'nada' };
  }
  const meta = est.metadata ?? {};
  const objeto: ObjetoCobro | null = meta.ventaId ? { tipo: 'venta', id: meta.ventaId }
    : meta.reciboId ? { tipo: 'recibo', id: meta.reciboId } : null;
  if (!objeto) return { tipo: 'nada' };
  if (p.objeto && (p.objeto.tipo !== objeto.tipo || p.objeto.id !== objeto.id)) return { tipo: 'nada' };

  const leido = await leerObjeto(admin, p.studioId, objeto);
  if (!leido.ok) return { tipo: 'esperar' };
  if (!leido.venta && !leido.recibo) {
    // Dice que es nuestro pero no existe en este estudio: dinero sin dueño.
    if (!(await anotar(admin, p.studioId, est.cargoSumup, est.importeCentimos, 'Cobro de SumUp sin venta ni recibo'))) return { tipo: 'esperar' };
    return revisar('cobro de SumUp sin venta ni recibo en el estudio', { studioId: p.studioId, objeto: `${objeto.tipo}:${objeto.id}` });
  }
  if (leido.recibo?.sumup_transaction_id === est.cargoSumup) return { tipo: 'cerrado' };
  return cerrarPagado(admin, p.studioId, objeto, referencia, est, leido.recibo, { exigirDueno: true });
}

type Leida<T> = { data: T[] | null; error: { message: string } | null };

/**
 * El historial de la cuenta de SumUp de un estudio: lo cobrado en las últimas
 * horas que no cerró nada ni espera, se pregunta uno a uno (`cobroSumupHuerfano`).
 * Es lo que tapa los huecos de un aviso sin firma que puede no llegar.
 */
async function repasarHistorial(admin: SupabaseClient, studioId: string, ahora: Date): Promise<number> {
  const cuenta = await cuentaSumupDelEstudio(studioId);
  if (!cuenta.ok) return 0;
  const desde = new Date(ahora.getTime() - MINUTOS_DE_HISTORIAL * 60_000);
  const movs = await cuenta.cliente.historial(cuenta.merchantCode, { desde, limite: 100 });
  if (!movs.length) return 0;
  const ids = movs.map(m => m.transaccionId);

  const [cerrados, anotados, ventas, enVuelo] = await Promise.all([
    admin.from('recibos').select('sumup_transaction_id').eq('studio_id', studioId).in('sumup_transaction_id', ids),
    admin.from('reconciliaciones_pos').select('payment_intent_id').eq('studio_id', studioId).in('payment_intent_id', ids.map(claveReconciliacionSumup)),
    admin.from('ventas_pos').select('estado, stripe_payment_intent_id').eq('studio_id', studioId)
      .like('stripe_payment_intent_id', 'sumup:%').gte('pago_actualizado_en', new Date(desde.getTime() - 3_600_000).toISOString()).limit(500),
    admin.from('recibos').select('cobro_mostrador_pi').eq('studio_id', studioId).like('cobro_mostrador_pi', 'sumup:%'),
  ]) as [Leida<{ sumup_transaction_id: string }>, Leida<{ payment_intent_id: string }>,
    Leida<{ estado: string | null; stripe_payment_intent_id: string }>, Leida<{ cobro_mostrador_pi: string }>];
  const fallo = cerrados.error ?? anotados.error ?? ventas.error ?? enVuelo.error;
  if (fallo) throw new Error(fallo.message);

  const ctid = (ref: string) => leerReferenciaSumup(ref)?.clientTransactionId ?? null;
  const porMirar = movimientosPorMirar(movs, {
    recibosCerrados: new Set((cerrados.data ?? []).map(r => r.sumup_transaction_id)),
    reconciliados: new Set((anotados.data ?? []).map(r => r.payment_intent_id)),
    ventas: new Map((ventas.data ?? []).flatMap(v => { const c = ctid(v.stripe_payment_intent_id); return c ? [[c, v.estado] as const] : []; })),
    recibosEnVuelo: new Set((enVuelo.data ?? []).flatMap(r => { const c = ctid(r.cobro_mostrador_pi); return c ? [c] : []; })),
  }, claveReconciliacionSumup);
  if (!porMirar.length) return 0;

  const cobro = await cobroDe(admin, studioId, referenciaSumup(porMirar[0].clientTransactionId, ahora));
  if (!cobro) return 0;
  // Los cobros de la app de SumUp sin Tentare también salen aquí (y se descartan al
  // mirarlos): un tope para no gastar llamadas sin fin en un estudio con mucho uso.
  for (const m of porMirar.slice(0, 40)) {
    await cobroSumupHuerfano(admin, { studioId, clientTransactionId: m.clientTransactionId, cobro });
  }
  return Math.min(porMirar.length, 40);
}

/**
 * El respaldo del aviso, dentro del barrido horario de cobros
 * (lib/inngest/conciliar-cobros.ts, sin cron nuevo):
 *  1. cada cobro de SumUp guardado en vuelo (venta sin cerrar o recibo), pasados
 *     unos minutos, se resuelve como lo haría el aviso;
 *  2. el historial de cada cuenta de SumUp, por lo que entró sin referencia guardada.
 * Un estudio que falle no deja sin barrer a los demás.
 */
export async function barrerCobrosSumup(admin: SupabaseClient, ahora = new Date()):
  Promise<{ mirados: number; cerrados: number; soltados: number; historial: number }> {
  const [ventas, recibos, conSolo] = await Promise.all([
    admin.from('ventas_pos').select('id, studio_id, stripe_payment_intent_id')
      .eq('estado', 'PENDIENTE_PAGO').like('stripe_payment_intent_id', 'sumup:%').order('pago_actualizado_en').limit(200),
    admin.from('recibos').select('id, studio_id, cobro_mostrador_pi')
      .like('cobro_mostrador_pi', 'sumup:%').order('id').limit(200),
    admin.from('studios').select('id').not('sumup_reader_id', 'is', null),
  ]);
  const fallo = ventas.error ?? recibos.error ?? conSolo.error;
  if (fallo) throw new Error(fallo.message);
  const porEstudio = cobrosParaBarrer([
    ...((ventas.data ?? []) as { id: string; studio_id: string; stripe_payment_intent_id: string | null }[])
      .map(v => ({ tipo: 'venta' as const, id: v.id, studioId: v.studio_id, referencia: v.stripe_payment_intent_id })),
    ...((recibos.data ?? []) as { id: string; studio_id: string; cobro_mostrador_pi: string | null }[])
      .map(r => ({ tipo: 'recibo' as const, id: r.id, studioId: r.studio_id, referencia: r.cobro_mostrador_pi })),
  ], ahora);

  const cuenta = { mirados: 0, cerrados: 0, soltados: 0, historial: 0 };
  for (const [studioId, cobros] of porEstudio) {
    try {
      const preparado = await prepararCobroExistente(admin, studioId, cobros[0].referencia, 'DATAFONO', { origen: '' });
      for (const c of cobros) {
        const r = preparado.ok
          ? await resolverCobroSumup(admin, { studioId, objeto: c.objeto, cobro: preparado.cobro })
          : { tipo: 'esperar' as const };
        cuenta.mirados++;
        if (r.tipo === 'cerrado') cuenta.cerrados++;
        if (r.tipo === 'soltado') cuenta.soltados++;
        if (r.tipo === 'esperar' && c.minutos >= HORAS_PARA_AVISAR * 60) {
          Sentry.captureMessage('[pos/sumup] cobro sin resolver tras un día', {
            level: 'warning', tags: { area: 'cobros', proveedor: 'sumup' },
            extra: { studioId, objeto: `${c.objeto.tipo}:${c.objeto.id}`, referencia: c.referencia, motivo: preparado.ok ? null : preparado.motivo },
          });
        }
      }
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('barrido sumup'), {
        level: 'error', tags: { area: 'cobros', proveedor: 'sumup' }, extra: { studioId },
      });
    }
  }

  for (const { id: studioId } of (conSolo.data ?? []) as { id: string }[]) {
    try {
      cuenta.historial += await repasarHistorial(admin, studioId, ahora);
    } catch (e) {
      Sentry.captureException(e instanceof Error ? e : new Error('historial sumup'), {
        level: 'error', tags: { area: 'cobros', proveedor: 'sumup' }, extra: { studioId },
      });
    }
  }
  return cuenta;
}
