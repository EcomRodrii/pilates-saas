import 'server-only';
import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import { esEstadoFinal } from './tipos.ts';
import { leerReferenciaSumup, referenciaSumup } from './sumup.ts';
import { cobrosParaBarrer, esDeEste, HORAS_PARA_AVISAR } from './terminal-sumup.ts';
import { prepararCobroExistente, type CobroListo } from './cobro-del-estudio.ts';
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
//     aviso no llega nunca.
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

/** Lo que pasa cuando SumUp dice PAGADO: las mismas comprobaciones que el sondeo del mostrador. */
async function cerrarPagado(
  admin: SupabaseClient, studioId: string, o: ObjetoCobro, referencia: string,
  est: ConsultaCobro, recibo: FilaRecibo | undefined,
): Promise<ResultadoSumup> {
  const extra = { studioId, objeto: `${o.tipo}:${o.id}`, referencia };
  if (!esDeEste(est, studioId, o, { exigirDueno: o.tipo === 'recibo' })) {
    // En la venta basta la referencia guardada (como en su sondeo); en el recibo
    // se exige además que SumUp devuelva de quién es (como en el suyo).
    return revisar('cobro pagado que no corresponde a lo que se cobraba', { ...extra, meta: est.metadata ?? {} });
  }
  if (o.tipo === 'recibo') {
    if (!recibo) return { tipo: 'nada' };
    const esperado = Math.round(Number(recibo.importe) * 100);
    if (est.importeCentimos == null || est.importeCentimos !== esperado) {
      return revisar('el importe cobrado no coincide con el recibo', { ...extra, esperado, cobrado: est.importeCentimos ?? null });
    }
    const cierre = await cerrarReciboPos(admin, {
      studioId, reciboId: o.id, metodoCobro: 'TARJETA', paymentIntentId: null,
      cargoSumup: est.cargoSumup ?? null, referencia,
    });
    return cierre.ok ? { tipo: 'cerrado' } : { tipo: 'esperar' };
  }
  if (est.importeCentimos == null) return { tipo: 'esperar' };
  const cierre = await cerrarVentaPos(admin, {
    studioId, ventaId: o.id, referencia,
    // La RPC compara este importe con el total de la venta (IMPORTE_NO_COINCIDE).
    importe: est.importeCentimos / 100,
    metodoPagoReal: null,
    concepto: 'Cobro del datáfono de SumUp',
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

  let cobro = p.cobro;
  if (!cobro) {
    const preparado = await prepararCobroExistente(admin, p.studioId, leido.referencia, 'DATAFONO', { origen: '' });
    if (!preparado.ok) return { tipo: 'esperar' };
    cobro = preparado.cobro;
  }
  const est = await cobro.consultar(leido.referencia);
  if (est.estado === 'PAGADO') return cerrarPagado(admin, p.studioId, p.objeto, leido.referencia, est, leido.recibo);
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
 * Un aviso de un cobro de SumUp que YA NO es el que está en vuelo (la venta se
 * anuló, el recibo se soltó o se volvió a intentar). Si SumUp dice que cobró y es
 * de este objeto, y no es el cargo que ya lo cerró, es dinero que entró sin nada
 * que lo case: se deja en `reconciliaciones_pos` (el mismo sitio que una venta
 * anulada que cobra) y se avisa. Nunca se aplica solo.
 */
export async function cobroSumupHuerfano(
  admin: SupabaseClient,
  p: { studioId: string; objeto: ObjetoCobro; clientTransactionId: string; cobro: CobroListo },
): Promise<ResultadoSumup> {
  // Con la fecha de ahora: solo sirve para preguntar por el id.
  const referencia = referenciaSumup(p.clientTransactionId, new Date());
  const est = await p.cobro.consultar(referencia);
  if (est.estado !== 'PAGADO' || !est.cargoSumup) return est.estado === 'PROCESANDO' ? { tipo: 'esperar' } : { tipo: 'nada' };
  // Aquí no hay referencia guardada que lo respalde: sin dueño dicho por SumUp, no se anota.
  if (!esDeEste(est, p.studioId, p.objeto, { exigirDueno: true })) return { tipo: 'nada' };

  const leido = await leerObjeto(admin, p.studioId, p.objeto);
  if (!leido.ok) return { tipo: 'esperar' };
  if (leido.recibo?.sumup_transaction_id === est.cargoSumup) return { tipo: 'cerrado' };
  if (leido.venta?.estado === 'PAGADA' && leido.venta.stripe_payment_intent_id?.endsWith(`:${p.clientTransactionId}`)) {
    return { tipo: 'cerrado' };
  }
  const clave = `sumup-txn:${est.cargoSumup}`;
  const { error } = await admin.from('reconciliaciones_pos').insert({
    payment_intent_id: clave, studio_id: p.studioId,
    importe: (est.importeCentimos ?? 0) / 100,
    concepto: p.objeto.tipo === 'venta' ? 'Cobro de SumUp sobre una venta que ya no lo esperaba' : 'Cobro de SumUp sobre un recibo que ya no lo esperaba',
  });
  if (error && error.code !== '23505') return { tipo: 'esperar' };
  if (error?.code === '23505') return { tipo: 'revisar', motivo: 'ya anotado' };
  return revisar('cobro de SumUp sin nada que lo case', {
    studioId: p.studioId, objeto: `${p.objeto.tipo}:${p.objeto.id}`, clave, importe: est.importeCentimos ?? null,
  });
}

/**
 * El respaldo del aviso: cada cobro de SumUp que sigue guardado en una venta sin
 * cerrar o en un recibo, pasados unos minutos, se resuelve como lo haría el aviso.
 * Corre dentro del barrido horario de cobros (lib/inngest/conciliar-cobros.ts):
 * sin cron nuevo. Un estudio que falle no deja sin barrer a los demás.
 */
export async function barrerCobrosSumup(admin: SupabaseClient, ahora = new Date()):
  Promise<{ mirados: number; cerrados: number; soltados: number }> {
  const [ventas, recibos] = await Promise.all([
    admin.from('ventas_pos').select('id, studio_id, stripe_payment_intent_id')
      .eq('estado', 'PENDIENTE_PAGO').like('stripe_payment_intent_id', 'sumup:%').limit(200),
    admin.from('recibos').select('id, studio_id, cobro_mostrador_pi')
      .like('cobro_mostrador_pi', 'sumup:%').limit(200),
  ]);
  if (ventas.error || recibos.error) throw new Error(ventas.error?.message ?? recibos.error?.message ?? 'lectura');
  const porEstudio = cobrosParaBarrer([
    ...((ventas.data ?? []) as { id: string; studio_id: string; stripe_payment_intent_id: string | null }[])
      .map(v => ({ tipo: 'venta' as const, id: v.id, studioId: v.studio_id, referencia: v.stripe_payment_intent_id })),
    ...((recibos.data ?? []) as { id: string; studio_id: string; cobro_mostrador_pi: string | null }[])
      .map(r => ({ tipo: 'recibo' as const, id: r.id, studioId: r.studio_id, referencia: r.cobro_mostrador_pi })),
  ], ahora);

  const cuenta = { mirados: 0, cerrados: 0, soltados: 0 };
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
  return cuenta;
}
