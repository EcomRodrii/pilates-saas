// ─────────────────────────────────────────────────────────────────────────────
// «Le he devuelto el dinero» (Cobros → ⋯ de un cobro): el estudio le devuelve a
// la clienta, a mano, el dinero de un cobro que se hizo a mano (efectivo,
// tarjeta del datáfono, Bizum, transferencia). Ya no debe nada.
//
// Antes no existía: el único botón, «Devolver», escribía DEVUELTO con
// `importe_devuelto = 0`, que es «lo devolvió el banco» —deuda—. Devolver en
// mano un cobro en efectivo dejaba a la clienta debiéndolo, con sus reservas
// bloqueadas por impago y «Cobrar» otra vez en la fila (lib/billing/
// devolucion-reglas.ts). Un reembolso es DEVUELTO con `importe_devuelto =
// importe` —lo que ya entienden `situacionRecibo` (REEMBOLSADO),
// `esReciboCobrable` (no se cobra) y el cierre (pide rectificativa)—, así que
// no hay estado nuevo ni migración.
//
// Lo que entró por Stripe no se devuelve aquí: sale por Stripe («Devolver» de la
// ficha) y el webhook lo marca. Una venta de la caja, desde la caja.
//
// Ningún efecto es nuevo: cada uno tiene ya su dueño y aquí solo se componen,
// en este orden y sin que ninguno tumbe al recibo, que ya dice la verdad:
//   1. la devolución (`registrarDevolucion`, referencia `manual:<recibo>`): la
//      tarjeta de Devoluciones del Resumen, por si hay que deshacer lo entregado
//      — igual que con un reembolso de Stripe. Va PRIMERO: es la marca de que
//      este recibo lo devolvió este camino;
//   2. la penalización y la nómina (`marcarPenalizacionReembolsada`);
//   3. los créditos de «Renovar plan» (`seguirCreditosAlRecibo`);
//   4. la caja: una SALIDA si el dinero salió del mostrador (`mover_caja`, id
//      `mov-dev-<recibo>`: dos clics no la apuntan dos veces);
//   5. el libro de auditoría (quién devolvió qué y cómo).
// Ni aviso ni email, como el cobro a mano.
//
// La factura no se rectifica sola: qué rectificativa toca lo decide la gestoría,
// igual que con Stripe y con la caja. El cierre ya lo avisa.
//
// Sin `@/`: lo prueba `node --test` con las dependencias inyectadas.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { cobroEntroPorStripe } from './devolucion-reglas.ts';
import { registrarDevolucion } from './registrar-devolucion.ts';
import { seguirCreditosAlRecibo } from './creditos-recibo-server.ts';
import { registrarAuditoriaServidor, type RegistrarAuditoria } from '../auditoria/registrar-servidor.ts';
import { hoyEnEstudio } from '../utils.ts';

/** Cómo le devuelve el estudio el dinero. SEPA no: un adeudo no se «devuelve» a mano. */
export const METODOS_REEMBOLSO_MANUAL = ['EFECTIVO', 'TARJETA', 'BIZUM', 'TRANSFERENCIA'] as const;
export type MetodoReembolsoManual = (typeof METODOS_REEMBOLSO_MANUAL)[number];

export function esMetodoReembolsoManual(m: unknown): m is MetodoReembolsoManual {
  return typeof m === 'string' && (METODOS_REEMBOLSO_MANUAL as readonly string[]).includes(m);
}

/** Qué pasó con el apunte de caja. */
export type CajaDelReembolso = 'APUNTADA' | 'YA_APUNTADA' | 'SIN_CAJA' | 'FUERA_DE_CAJA' | 'NO_APUNTADA';

export type ResultadoReembolsoManual =
  | { ok: true; yaEstaba: boolean; importe: number; caja: CajaDelReembolso }
  | { ok: false; http: 404 | 409 | 500; error: string };

export interface ActorReembolso { userId: string; rol: string; nombre: string | null }

export interface DependenciasReembolsoManual {
  registrarDevolucion: typeof registrarDevolucion;
  marcarPenalizacionReembolsada: (admin: SupabaseClient, studioId: string, reciboId: string) => Promise<void>;
  seguirCreditos: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;
  registrar: RegistrarAuditoria;
}

const DEPENDENCIAS: DependenciasReembolsoManual = {
  registrarDevolucion,
  marcarPenalizacionReembolsada: async (admin, studioId, reciboId) => {
    // Dinámico: ese módulo carga Sentry, que `node --test` no tiene.
    const { marcarPenalizacionReembolsada } = await import('../equipo/liquidacion-penalizacion-revertida.ts');
    return marcarPenalizacionReembolsada(admin, studioId, reciboId, 'reembolso');
  },
  seguirCreditos: seguirCreditosAlRecibo,
  registrar: registrarAuditoriaServidor,
};

export const referenciaReembolsoManual = (reciboId: string) => `manual:${reciboId}`;
export const idMovimientoReembolso = (reciboId: string) => `mov-dev-${reciboId}`;

/** Lo que sale del mostrador se apunta en la caja; una transferencia no pasa por el cajón. */
export const metodoPasaPorCaja = (m: MetodoReembolsoManual) => m !== 'TRANSFERENCIA';

export async function reembolsarReciboAMano(
  admin: SupabaseClient,
  /** `actor`: la sesión de quien pulsó, nunca el cuerpo de la petición. */
  p: { studioId: string; reciboId: string; metodo: MetodoReembolsoManual; ahoraISO: string; actor: ActorReembolso },
  deps: Partial<DependenciasReembolsoManual> = {},
): Promise<ResultadoReembolsoManual> {
  const d: DependenciasReembolsoManual = { ...DEPENDENCIAS, ...deps };
  const { data: recibo, error: errLectura } = await admin.from('recibos')
    .select('estado, importe, importe_devuelto, reembolso_stripe_id, reembolso_solicitado_en, stripe_payment_intent_id, metodo_cobro, sepa_estado, socio_id, concepto, fecha_cobro')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
  if (errLectura) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  if (!recibo) return { ok: false, http: 404, error: 'No se encuentra ese recibo.' };

  const importe = Number(recibo.importe);
  const devuelto = Number(recibo.importe_devuelto ?? 0);
  const estado = recibo.estado as string;

  // Doble clic, o una pestaña con la lista vieja: si lo devolvió ESTE camino (su
  // devolución está anotada), se repiten los efectos, que son idempotentes, por
  // si el primero se quedó a medias. Si lo devolvió otro (Stripe, la caja), no se
  // toca nada: apuntar aquí una salida de caja sería inventarla.
  if (estado === 'DEVUELTO' && importe > 0 && devuelto >= importe) {
    const { data: marca } = await admin.from('devoluciones').select('id')
      .eq('studio_id', p.studioId).eq('referencia', referenciaReembolsoManual(p.reciboId)).maybeSingle();
    if (!marca) return { ok: true, yaEstaba: true, importe, caja: 'FUERA_DE_CAJA' };
    const caja = await efectos(admin, p, recibo, importe, d, false);
    return { ok: true, yaEstaba: true, importe, caja };
  }
  if (estado !== 'COBRADO') {
    return { ok: false, http: 409, error: 'Solo se le puede devolver el dinero de un recibo cobrado.' };
  }
  if (cobroEntroPorStripe(recibo)) {
    return {
      ok: false, http: 409,
      error: 'Este cobro entró por Stripe: devuélvelo desde la ficha de la clienta («Devolver»), y el recibo se marcará solo.',
    };
  }
  if (recibo.reembolso_stripe_id || recibo.reembolso_solicitado_en || devuelto > 0) {
    return { ok: false, http: 409, error: 'A este cobro ya se le ha devuelto dinero: revísalo en la ficha de la clienta.' };
  }
  if (!(importe > 0)) return { ok: false, http: 409, error: 'Este recibo no tiene importe que devolver.' };

  // Una venta de la caja se devuelve desde la caja: si no, la venta y su recibo
  // divergen y se podría devolver dos veces.
  const { data: venta, error: errVenta } = await admin.from('ventas_pos').select('id')
    .eq('studio_id', p.studioId).eq('recibo_id', p.reciboId).limit(1);
  if (errVenta) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  if (venta && venta.length > 0) {
    return { ok: false, http: 409, error: 'Este cobro es una venta de la caja: devuélvela desde la caja.' };
  }

  // Un solo UPDATE, con `importe_devuelto` dentro: con dos escrituras, entre una
  // y otra el recibo sería «devuelto por el banco» (deuda, bloqueo y «Cobrar»).
  // Compare-and-set sobre todo lo leído que decide.
  const hoy = hoyEnEstudio(new Date(p.ahoraISO));
  let consulta = admin.from('recibos')
    .update({ estado: 'DEVUELTO', importe_devuelto: importe, fecha_devolucion: hoy, proximo_reintento: null })
    .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('estado', 'COBRADO').eq('importe_devuelto', 0)
    .is('reembolso_stripe_id', null).is('reembolso_solicitado_en', null);
  consulta = recibo.stripe_payment_intent_id
    ? consulta.eq('stripe_payment_intent_id', recibo.stripe_payment_intent_id as string)
    : consulta.is('stripe_payment_intent_id', null);
  const { data: tocado, error } = await consulta.select('id').maybeSingle();
  if (error) {
    console.error('[reembolso-manual] no se pudo marcar el recibo', p.reciboId, error.message);
    return { ok: false, http: 500, error: 'No se ha podido registrar la devolución.' };
  }
  if (!tocado) return { ok: false, http: 409, error: 'Este recibo acaba de cambiar. Recarga y vuelve a intentarlo.' };

  const caja = await efectos(admin, p, recibo, importe, d, true);
  return { ok: true, yaEstaba: false, importe, caja };
}

async function efectos(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; metodo: MetodoReembolsoManual; actor: ActorReembolso },
  recibo: Record<string, unknown>,
  importe: number,
  d: DependenciasReembolsoManual,
  anotar: boolean,
): Promise<CajaDelReembolso> {
  const avisar = (paso: string, e: unknown) =>
    console.error(`[reembolso-manual] ${paso}`, p.reciboId, e instanceof Error ? e.message : e);

  // 1. La devolución (y la marca de que la hizo este camino).
  try {
    await d.registrarDevolucion(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origen: 'REEMBOLSO_TOTAL',
      devueltoCentimos: Math.round(importe * 100), referencia: referenciaReembolsoManual(p.reciboId),
    });
  } catch (e) { avisar('no se pudo anotar la devolución', e); }
  // 2. La penalización: REEMBOLSADA y la liquidación pide revisión (no FALLIDA:
  //    no se sigue debiendo).
  try { await d.marcarPenalizacionReembolsada(admin, p.studioId, p.reciboId); } catch (e) { avisar('no se pudo poner al día la penalización', e); }
  // 3. Los créditos que diera este recibo se revierten.
  try { await d.seguirCreditos(admin, { studioId: p.studioId, reciboId: p.reciboId }); } catch (e) { avisar('no se pudieron revertir los créditos', e); }

  // 4. La caja.
  let caja: CajaDelReembolso = 'FUERA_DE_CAJA';
  if (metodoPasaPorCaja(p.metodo)) {
    try {
      const { data: abierta } = await admin.from('cajas').select('id')
        .eq('studio_id', p.studioId).eq('estado', 'ABIERTA').limit(1);
      const cajaId = (abierta?.[0]?.id as string | undefined) ?? null;
      if (!cajaId) caja = 'SIN_CAJA';
      else {
        const { error } = await admin.rpc('mover_caja', {
          p_movimiento_id: idMovimientoReembolso(p.reciboId), p_studio_id: p.studioId, p_caja_id: cajaId,
          p_tipo: 'SALIDA', p_importe: importe,
          p_concepto: `Devolución: ${String(recibo.concepto ?? 'recibo').slice(0, 80)}`,
          p_metodo_pago: p.metodo, p_por: p.actor.userId, p_por_nombre: p.actor.nombre,
        });
        caja = !error ? 'APUNTADA' : (error as { code?: string }).code === '23505' ? 'YA_APUNTADA' : 'NO_APUNTADA';
        if (error && caja === 'NO_APUNTADA') avisar('no se pudo apuntar la salida de caja', error.message);
      }
    } catch (e) {
      caja = 'NO_APUNTADA';
      avisar('no se pudo apuntar la salida de caja', e);
    }
  }

  // 5. El libro: solo si ESTA llamada lo devolvió. Nunca lanza.
  if (anotar) {
    await d.registrar(admin, {
      sesion: { userId: p.actor.userId, rol: p.actor.rol, studioId: p.studioId },
      tabla: 'recibos', filaId: p.reciboId, operacion: 'UPDATE',
      socioId: (recibo.socio_id as string | null) ?? null,
      antes: { estado: 'COBRADO', importe_devuelto: 0 },
      despues: { estado: 'DEVUELTO', importe_devuelto: importe },
      contexto: { accion: 'RECIBO_REEMBOLSADO_A_MANO', concepto: recibo.concepto ?? null, importe, metodo_devolucion: p.metodo },
    });
  }
  return caja;
}
