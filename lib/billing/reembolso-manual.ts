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
//   0. ANTES del UPDATE, si es el recibo de una penalización, la penalización se
//      pone al día con el cobro (`seguirPenalizacionAlRecibo`): el cobro a mano no
//      la mueve, y si se devolviera aún en RECIBO_CREADO, el barrido horario la
//      dejaría FALLIDA (como si se debiera) en vez de REEMBOLSADA;
//   1. la devolución (`registrarDevolucion`, referencia `manual:<recibo>`): la
//      tarjeta de Devoluciones del Resumen, por si hay que deshacer lo entregado
//      — igual que con un reembolso de Stripe;
//   2. la penalización y la nómina (`marcarPenalizacionReembolsada`);
//   3. los créditos de «Renovar plan» (`seguirCreditosAlRecibo`);
//   4. la caja: una SALIDA si el dinero salió del mostrador (`mover_caja`, id
//      `mov-dev-<recibo>`: dos clics no la apuntan dos veces);
//   5. el libro de auditoría (quién devolvió qué y cómo).
// Ni aviso ni email, como el cobro a mano. Cada efecto que falla se avisa a Sentry.
//
// ⚠️ Si se repite (doble clic, o el primero se cortó entre el UPDATE y sus
// efectos), se reconoce por el PROPIO recibo que lo devolvió este camino
// (`devueltoAMano`) y se repiten los efectos, que son todos idempotentes. No por
// la devolución anotada: si eso fallaba, el reintento se lo saltaba todo.
//
// La factura no se rectifica sola: qué rectificativa toca lo decide la gestoría,
// igual que con Stripe y con la caja. El cierre ya lo avisa.
//
// Sin `@/`: lo prueba `node --test` con las dependencias inyectadas.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { cobroEntroPorStripe } from './devolucion-reglas.ts';
import { registrarDevolucion } from './registrar-devolucion.ts';
import { penalizacionDelRecibo } from './penalizacion-aprobar-reglas.ts';
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
  /** La penalización al día con su recibo cobrado, antes de devolverlo. */
  seguirPenalizacion: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;
  marcarPenalizacionReembolsada: (admin: SupabaseClient, studioId: string, reciboId: string) => Promise<void>;
  seguirCreditos: (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;
  registrar: RegistrarAuditoria;
  /** Log + Sentry de un efecto que no se pudo aplicar. */
  avisar: (mensaje: string, extra: Record<string, unknown>) => void;
}

const DEPENDENCIAS: DependenciasReembolsoManual = {
  registrarDevolucion,
  seguirPenalizacion: async (admin, p) => {
    // Dinámico: ese módulo usa alias `@/`, que `node --test` no resuelve.
    const { seguirPenalizacionAlRecibo } = await import('./penalizacion-recibo-server.ts');
    return seguirPenalizacionAlRecibo(admin, p);
  },
  marcarPenalizacionReembolsada: async (admin, studioId, reciboId) => {
    // Dinámico: ese módulo carga Sentry, que `node --test` no tiene.
    const { marcarPenalizacionReembolsada } = await import('../equipo/liquidacion-penalizacion-revertida.ts');
    return marcarPenalizacionReembolsada(admin, studioId, reciboId, 'reembolso');
  },
  seguirCreditos: seguirCreditosAlRecibo,
  registrar: registrarAuditoriaServidor,
  avisar: (mensaje, extra) => {
    console.error(`[reembolso-manual] ${mensaje}`, extra);
    void import('@sentry/nextjs')
      .then(S => S.captureMessage(`[reembolso-manual] ${mensaje}`, { level: 'error', tags: { area: 'cobros', tipo: 'reembolso-manual' }, extra }))
      .catch(() => { /* sin Sentry solo se pierde el aviso */ });
  },
};

/**
 * ¿Lo devolvió ESTE camino? Lo dice el propio recibo: devuelto entero, sin
 * reembolso de Stripe pedido ni hecho, y con un cobro que no entró por Stripe.
 * Ningún otro escritor deja esa combinación (Stripe deja su cargo o su
 * reembolso; la caja, su venta, que se mira aparte).
 */
export function devueltoAMano(r: Record<string, unknown>): boolean {
  const importe = Number(r.importe);
  return r.estado === 'DEVUELTO' && importe > 0 && Number(r.importe_devuelto ?? 0) >= importe
    && !r.reembolso_stripe_id && !r.reembolso_solicitado_en && !cobroEntroPorStripe(r);
}

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

  // Una venta de la caja se devuelve desde la caja: si no, la venta y su recibo
  // divergen y se podría devolver dos veces.
  const { data: venta, error: errVenta } = await admin.from('ventas_pos').select('id')
    .eq('studio_id', p.studioId).eq('recibo_id', p.reciboId).limit(1);
  if (errVenta) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  const esVentaDeCaja = !!venta && venta.length > 0;

  // Doble clic, o el primero se cortó entre el UPDATE y sus efectos: si lo
  // devolvió ESTE camino, se repiten los efectos (idempotentes). Si lo devolvió
  // otro (Stripe, la caja), no se toca nada: apuntar aquí una salida de caja
  // sería inventarla.
  if (estado === 'DEVUELTO' && importe > 0 && devuelto >= importe) {
    if (esVentaDeCaja || !devueltoAMano(recibo)) return { ok: true, yaEstaba: true, importe, caja: 'FUERA_DE_CAJA' };
    const caja = await efectos(admin, p, recibo, importe, d);
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
  if (esVentaDeCaja) return { ok: false, http: 409, error: 'Este cobro es una venta de la caja: devuélvela desde la caja.' };

  // 0. La penalización al día con su recibo COBRADO, antes de devolverlo: si no,
  //    se quedaría en RECIBO_CREADO y el barrido la dejaría FALLIDA.
  if (penalizacionDelRecibo(p.reciboId)) {
    try { await d.seguirPenalizacion(admin, { studioId: p.studioId, reciboId: p.reciboId }); }
    catch (e) { d.avisar('no se pudo poner al día la penalización antes de devolver', { reciboId: p.reciboId, error: String(e) }); }
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

  const caja = await efectos(admin, p, recibo, importe, d);
  return { ok: true, yaEstaba: false, importe, caja };
}

async function efectos(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; metodo: MetodoReembolsoManual; actor: ActorReembolso },
  recibo: Record<string, unknown>,
  importe: number,
  d: DependenciasReembolsoManual,
): Promise<CajaDelReembolso> {
  const avisar = (paso: string, e: unknown) =>
    d.avisar(paso, { reciboId: p.reciboId, studioId: p.studioId, error: e instanceof Error ? e.message : String(e ?? '') });

  // 1. La devolución. `registrarDevolucion` no lanza y devuelve null tanto si ya
  //    estaba como si falló: se comprueba que quede anotada.
  try {
    await d.registrarDevolucion(admin, {
      studioId: p.studioId, reciboId: p.reciboId, origen: 'REEMBOLSO_TOTAL',
      devueltoCentimos: Math.round(importe * 100), referencia: referenciaReembolsoManual(p.reciboId),
    });
    const { data: anotada, error } = await admin.from('devoluciones').select('id')
      .eq('studio_id', p.studioId).eq('referencia', referenciaReembolsoManual(p.reciboId)).maybeSingle();
    if (error || !anotada) avisar('la devolución no ha quedado anotada', error?.message ?? 'sin fila');
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

  // 5. El libro, una vez por devolución: si ya está anotada (un reintento), no se
  //    repite. Nunca lanza.
  const { data: yaAnotada } = await admin.from('auditoria_estudio').select('id')
    .eq('studio_id', p.studioId).eq('tabla', 'recibos').eq('fila_id', p.reciboId)
    .eq('contexto->>accion', 'RECIBO_REEMBOLSADO_A_MANO').limit(1);
  if (!yaAnotada || yaAnotada.length === 0) {
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
