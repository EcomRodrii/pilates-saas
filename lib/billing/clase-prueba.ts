// La «clase de prueba»: un plan de tarifa marcado `es_prueba` (migración
// `planes_tarifa_es_prueba`) que solo puede usar, UNA vez, quien llega nueva al
// estudio — y siempre junto a una clase concreta.
//
// Un dueño para las tres puertas por las que se estrena una prueba:
//  - los DOS checkouts gemelos (`/api/public/checkout-embebido` y
//    `/api/stripe/checkout`) llaman a `rechazoCompraPrueba` antes de crear el
//    cobro — el fallo recurrente de este repo es arreglar uno y no el otro;
//  - la prueba GRATIS (precio 0, no pasa por Stripe) la concede
//    `concederClasePruebaGratis` desde `/api/public/reserva`.
//
// ⚠️ «Nueva» NO es `esSociaNueva` (lib/billing/socia-nueva.ts). Esa devuelve
// `false` en cuanto hay ficha, y quien viene a probar la tiene casi siempre al
// reservar (alta walk-in, lead registrada). Aquí «nueva» es «nunca ha comprado
// ni ha venido»: sin suscripciones (en cualquier estado), sin reservas vivas y
// sin recibos cobrados, en ESTE estudio. De `esSociaNueva` se reutiliza la
// forma —fail-CLOSED, `escaparLike`, la guarda de `*`—, no el predicado.
//
// ⚠️ «Una por persona» se garantiza por ficha y por email, no por identidad:
// alguien con otro email es, para Tentare, otra persona. El respaldo es
// humano (la app de la instructora marca «Primera clase»).
//
// Sin `@/` y con imports `.ts`: lo prueba `node --test`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { escaparLike } from '../escapar-like.ts';
import { cicloInicialDe } from '../bono-logic.ts';
import { hoyEnEstudio } from '../utils.ts';
import type { PlanTarifa } from '../types.ts';

const YA_EXISTIA = '23505';

/** Id determinista de la prueba gratis de una socia: dos peticiones a la vez insertan UNA. */
export const idSuscripcionPrueba = (socioId: string) => `sus-prueba-${socioId}`;

/**
 * ¿Puede estrenar la oferta de prueba? Fail-CLOSED: cualquier error de
 * consulta devuelve `false` (la respuesta cómoda regalaría la prueba justo en
 * el caso que esto existe para cerrar).
 */
export async function puedeEstrenarPrueba(
  admin: SupabaseClient,
  studioId: string,
  socioId: string | null,
  email: string | null | undefined,
): Promise<boolean> {
  const id = socioId;
  if (!id) {
    const e = email?.trim();
    // Sin ficha y sin email no hay a quién entregar nada: el checkout ya lo
    // rechaza aparte. Aquí, «no se sabe» = no.
    if (!e) return false;
    // `*` PostgREST lo convierte en comodín ANTES de Postgres: casaría con
    // cualquier ficha. No es un email válido: fuera.
    if (e.includes('*')) return false;
    // TODAS las fichas con ese email (borradas incluidas): con una vieja y una
    // nueva, coger «una cualquiera» podría mirar justo la que no tiene historial.
    const { data, error } = await admin
      .from('socios').select('id')
      .eq('studio_id', studioId).ilike('email', escaparLike(e))
      .limit(50);
    if (error) return false;
    const ids = ((data ?? []) as { id: string }[]).map(f => f.id);
    if (ids.length === 0) return true;
    return sinHistorial(admin, studioId, ids);
  }
  return sinHistorial(admin, studioId, [id]);
}

async function sinHistorial(admin: SupabaseClient, studioId: string, ids: string[]): Promise<boolean> {
  const [sus, res, rec] = await Promise.all([
    admin.from('suscripciones').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).in('socio_id', ids),
    admin.from('reservas').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).in('socio_id', ids).neq('estado', 'CANCELADA'),
    admin.from('recibos').select('id', { count: 'exact', head: true })
      .eq('studio_id', studioId).in('socio_id', ids).eq('estado', 'COBRADO'),
  ]);
  if (sus.error || res.error || rec.error) return false;
  return (sus.count ?? 1) === 0 && (res.count ?? 1) === 0 && (rec.count ?? 1) === 0;
}

export interface RechazoPrueba {
  status: 400 | 409;
  error: string;
  codigo: 'prueba-sin-clase' | 'prueba-gratis' | 'prueba-no-disponible';
}

/**
 * La puerta de los DOS checkouts. Un plan normal devuelve `null` sin tocar la
 * base. Un plan de prueba solo se cobra junto a una clase, nunca a 0 € por
 * Stripe (la gratis va por la reserva) y solo a quien puede estrenarla.
 */
export async function rechazoCompraPrueba(admin: SupabaseClient, p: {
  studioId: string;
  plan: { es_prueba?: boolean | null; precio: number | string };
  socioId: string | null;
  email: string | null | undefined;
  sesionId: string | null | undefined;
}): Promise<RechazoPrueba | null> {
  if (p.plan.es_prueba !== true) return null;
  if (!p.sesionId) {
    return { status: 400, codigo: 'prueba-sin-clase', error: 'La clase de prueba se reserva junto a una clase concreta.' };
  }
  if (!(Number(p.plan.precio) > 0)) {
    return { status: 409, codigo: 'prueba-gratis', error: 'Esta clase de prueba es gratis: se reserva sin pagar.' };
  }
  if (!(await puedeEstrenarPrueba(admin, p.studioId, p.socioId, p.email))) {
    return { status: 409, codigo: 'prueba-no-disponible', error: 'La clase de prueba es solo para tu primera visita al estudio.' };
  }
  return null;
}

export type ResultadoPruebaGratis =
  | { ok: true; concedida: boolean }
  | { ok: false; codigo: 'prueba-no-disponible' | 'prueba-no-cubre' | 'error'; error: string };

/**
 * La prueba GRATIS: le da a la socia su bono de prueba (sin recibo, mismo
 * criterio que un plan de 0 € en el mostrador) para que la reserva normal lo
 * gaste. No reserva nada: la reserva sigue siendo `crearReservaPublica`, que
 * encuentra el bono y lo consume dentro del candado de `reservar_plaza`.
 *
 * Idempotente: el id de la suscripción es determinista, así que un reintento o
 * dos pestañas a la vez insertan una sola fila. Si ya la tiene (`concedida:
 * false`), se sigue: la reserva gasta lo que le quede o dice que no tiene plan.
 */
export async function concederClasePruebaGratis(admin: SupabaseClient, p: {
  studioId: string;
  socioId: string;
  planId: string;
  sesionId: string;
  ahora?: Date;
}): Promise<ResultadoPruebaGratis> {
  const id = idSuscripcionPrueba(p.socioId);
  const ya = await admin.from('suscripciones').select('id').eq('id', id).maybeSingle();
  if (ya.error) return { ok: false, codigo: 'error', error: 'No hemos podido comprobar tu clase de prueba.' };
  if (ya.data) return { ok: true, concedida: false };

  const noDisponible = { ok: false as const, codigo: 'prueba-no-disponible' as const, error: 'Esta clase de prueba ya no está disponible.' };
  const { data: plan, error: errPlan } = await admin
    .from('planes_tarifa')
    .select('id, studio_id, tipo, precio, activo, es_prueba, sesiones, validez_dias')
    .eq('id', p.planId).maybeSingle();
  if (errPlan) return { ok: false, codigo: 'error', error: 'No hemos podido leer la oferta.' };
  const f = plan as { studio_id: string; tipo: string; precio: number; activo: boolean; es_prueba: boolean | null; sesiones: number | null; validez_dias: number | null } | null;
  if (!f || f.studio_id !== p.studioId || !f.activo || f.es_prueba !== true || Number(f.precio) !== 0) return noDisponible;

  const { data: sesion, error: errSes } = await admin
    .from('sesiones').select('tipo_clase_id, cancelada, inicio')
    .eq('id', p.sesionId).eq('studio_id', p.studioId).maybeSingle();
  if (errSes) return { ok: false, codigo: 'error', error: 'No hemos podido leer la clase.' };
  const s = sesion as { tipo_clase_id: string | null; cancelada: boolean; inicio: string } | null;
  const ahora = p.ahora ?? new Date();
  if (!s || s.cancelada || new Date(s.inicio).getTime() <= ahora.getTime()) {
    return { ok: false, codigo: 'prueba-no-cubre', error: 'Esa clase ya no se puede reservar.' };
  }
  // ¿Cubre el tipo de ESA clase? Sin tipos marcados, cubre todas (mismo
  // criterio que `planCubreTipo`). Se decide ANTES de insertar nada: un bono
  // de prueba que no sirve para la clase elegida sería una prueba gastada.
  const { data: tipos, error: errTipos } = await admin
    .from('plan_tipos_clase').select('tipo_clase_id')
    .eq('studio_id', p.studioId).eq('plan_id', p.planId);
  if (errTipos) return { ok: false, codigo: 'error', error: 'No hemos podido leer la oferta.' };
  const cubiertos = (tipos ?? []).map(t => (t as { tipo_clase_id: string }).tipo_clase_id);
  if (cubiertos.length > 0 && (!s.tipo_clase_id || !cubiertos.includes(s.tipo_clase_id))) {
    return { ok: false, codigo: 'prueba-no-cubre', error: 'La clase de prueba no sirve para esta clase.' };
  }

  if (!(await puedeEstrenarPrueba(admin, p.studioId, p.socioId, null))) return {
    ok: false, codigo: 'prueba-no-disponible', error: 'La clase de prueba es solo para tu primera visita al estudio.',
  };

  const { fechaFin } = cicloInicialDe(
    { tipo: f.tipo as PlanTarifa['tipo'], sesiones: f.sesiones, validezDias: f.validez_dias },
    ahora.toISOString(),
  );
  const { error: errIns } = await admin.from('suscripciones').insert({
    id,
    studio_id: p.studioId,
    socio_id: p.socioId,
    plan_id: p.planId,
    estado: 'ACTIVA',
    fecha_inicio: hoyEnEstudio(ahora),
    fecha_fin: fechaFin,
    sesiones_restantes: f.sesiones ?? null,
    stripe_subscription_id: null,
  });
  if (errIns) {
    // Otra petición la insertó a la vez: ya la tiene, se sigue igual.
    if (errIns.code === YA_EXISTIA) return { ok: true, concedida: false };
    return { ok: false, codigo: 'error', error: 'No hemos podido darte la clase de prueba.' };
  }
  return { ok: true, concedida: true };
}
