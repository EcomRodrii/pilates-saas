import type { SupabaseClient } from '@supabase/supabase-js';
import { penalizacionDelRecibo } from './penalizacion-aprobar-reglas.ts';

// «Marcar devuelto» / «Devolver» de Cobros (components/cobros/panel-pendientes.tsx).
//
// Antes era un UPDATE directo desde el cliente (`dbUpdateRecibo`), y eso dejaba
// fuera lo único que no puede hacer el cliente: si el recibo era el de una
// penalización COBRADA, la penalización se quedaba COBRADA y la liquidación de
// la instructora la seguía imputando con el dinero fuera. Ponerla al día usa
// service-role, así que vive aquí, detrás de `POST /api/cobros/marcar-devuelto`
// (con `puedeMoverDinero`), nunca en el cliente.
//
// Anotar, no mover dinero: no llama a Stripe, no crea fila en `devoluciones` ni
// factura rectificativa. Lo mismo que hacía el UPDATE al que sustituye.
//
// Sin `import 'server-only'` a propósito: se prueba con `node --test`.

/** Desde dónde se puede marcar devuelto. EN_CURSO no: hay un cobro saliendo, y lo resuelve el webhook. */
export const ESTADOS_QUE_SE_PUEDEN_DEVOLVER = ['PENDIENTE', 'FALLIDO', 'COBRADO'] as const;

export type ResultadoMarcarDevuelto =
  | { ok: true; fechaDevolucion: string; yaEstaba: boolean }
  | { ok: false; http: 404 | 409 | 500; error: string };

export type SeguirPenalizacion = (admin: SupabaseClient, p: { studioId: string; reciboId: string }) => Promise<unknown>;

const seguirPorDefecto: SeguirPenalizacion = async (admin, p) => {
  // Dinámico: ese módulo usa alias `@/`, que `node --test` no resuelve.
  const { seguirPenalizacionAlRecibo } = await import('./penalizacion-recibo-server.ts');
  return seguirPenalizacionAlRecibo(admin, p);
};

export const TEXTO_COBRO_POR_STRIPE =
  'Este cobro entró por Stripe: marcarlo aquí no le devuelve el dinero. Haz el reembolso completo desde Stripe (o desde la ficha de la clienta, si tienes activadas las devoluciones) y el recibo se marcará como devuelto solo.';

/**
 * ¿Entró este cobro por Stripe? No basta con `stripe_payment_intent_id`: un adeudo
 * SEPA que sale en `processing` lo deja escrito en el recibo, falla, y si la socia
 * paga luego en efectivo el id sigue ahí sin que el dinero pasara por Stripe (y el
 * reembolso no tendría cargo que devolver).
 */
export function cobroEntroPorStripe(r: { stripe_payment_intent_id?: unknown; metodo_cobro?: unknown; sepa_estado?: unknown }): boolean {
  if (!r.stripe_payment_intent_id) return false;
  if (r.metodo_cobro === 'EFECTIVO' || r.metodo_cobro === 'TRANSFERENCIA') return false;
  return r.sepa_estado !== 'failed';
}

export async function marcarReciboDevuelto(
  admin: SupabaseClient,
  p: { studioId: string; reciboId: string; ahoraISO: string },
  seguir: SeguirPenalizacion = seguirPorDefecto,
): Promise<ResultadoMarcarDevuelto> {
  const { data: recibo, error: errLectura } = await admin.from('recibos')
    .select('estado, fecha_devolucion, stripe_payment_intent_id, metodo_cobro, sepa_estado')
    .eq('id', p.reciboId).eq('studio_id', p.studioId).maybeSingle();
  if (errLectura) return { ok: false, http: 500, error: 'No se ha podido comprobar el recibo.' };
  if (!recibo) return { ok: false, http: 404, error: 'No se encuentra ese recibo.' };

  const estado = recibo.estado as string;
  let fechaDevolucion = p.ahoraISO;
  let yaEstaba = false;

  if (estado === 'DEVUELTO') {
    // Doble toque, o ya lo devolvió el webhook: no se reescribe la fecha original.
    yaEstaba = true;
    fechaDevolucion = (recibo.fecha_devolucion as string | null) ?? p.ahoraISO;
  } else {
    if (estado === 'EN_CURSO') {
      return { ok: false, http: 409, error: 'Este recibo se está cobrando ahora mismo: espera a que termine antes de marcarlo devuelto.' };
    }
    if (!(ESTADOS_QUE_SE_PUEDEN_DEVOLVER as readonly string[]).includes(estado)) {
      return { ok: false, http: 409, error: 'Este recibo ya no se puede marcar como devuelto.' };
    }
    // ⚠️ Un cobro que entró por Stripe no se «devuelve» anotándolo: el dinero
    // sigue en la cuenta del estudio. Y si después se reembolsa de verdad, el
    // webhook ya lo encuentra DEVUELTO y no hace nada más (`.neq('estado',
    // 'DEVUELTO')` en procesar-reembolso.ts): ni rectificativa ni aviso a la
    // nómina. El reembolso real marca el recibo solo.
    if (estado === 'COBRADO' && cobroEntroPorStripe(recibo)) {
      return { ok: false, http: 409, error: TEXTO_COBRO_POR_STRIPE };
    }
    // Compare-and-set sobre el estado leído. `proximo_reintento` a null: un
    // DEVUELTO no lo cobra el dunning, pero si alguien lo vuelve a PENDIENTE con
    // una fecha ya vencida, lo cobraría sin avisar.
    const { data: tocado, error } = await admin.from('recibos')
      .update({ estado: 'DEVUELTO', fecha_devolucion: p.ahoraISO, proximo_reintento: null })
      .eq('id', p.reciboId).eq('studio_id', p.studioId).eq('estado', estado)
      .select('id').maybeSingle();
    if (error) {
      console.error('[marcar-devuelto] no se pudo marcar el recibo', p.reciboId, error.message);
      return { ok: false, http: 500, error: 'No se ha podido marcar el recibo como devuelto.' };
    }
    if (!tocado) return { ok: false, http: 409, error: 'Este recibo acaba de cambiar. Recarga y vuelve a intentarlo.' };
  }

  // ⚠️ SIEMPRE que el recibo esté DEVUELTO, no solo si lo ha devuelto esta
  // llamada: uno marcado devuelto antes de este arreglo tiene aún su penalización
  // COBRADA, y volver a pulsar la pone al día. Repetirlo es seguro (compare-and-set
  // desde COBRADA). Nunca lanza; y si no llega a escribir, lo recoge el barrido
  // horario del cron de penalizaciones. El recibo ya dice la verdad.
  if (penalizacionDelRecibo(p.reciboId)) {
    try {
      await seguir(admin, { studioId: p.studioId, reciboId: p.reciboId });
    } catch (e) {
      console.error('[marcar-devuelto] no se pudo poner al día la penalización del recibo', p.reciboId, e instanceof Error ? e.message : e);
    }
  }

  return { ok: true, fechaDevolucion, yaEstaba };
}
