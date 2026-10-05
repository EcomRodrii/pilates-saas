import type { SupabaseClient } from '@supabase/supabase-js';
import { estadoCobroCuenta } from '../billing/cuenta-puede-cobrar.ts';
import { stripeServidor, TIMEOUT_STRIPE_MS } from '../opening/servidor.ts';
import { horaHHMM } from '../booking-logic.ts';
import { hoyEnEstudio } from '../utils.ts';
import {
  puedeReservarAlumnaNueva,
  type DatosPuedeReservar, type PlanPuedeReservar, type ResultadoPuedeReservar,
} from './puede-reservar.ts';

// Lo que necesita `puedeReservarAlumnaNueva`, leído de las mismas tablas que
// miran `crearReservaPublica`, `reservar_plaza` y el checkout.
//
// ⚠️ Cliente service-role: la RLS NO filtra aquí. Quien llama ya ha comprobado
// el rol, y TODA consulta va acotada al estudio de la sesión. Lanza en error.

/**
 * Las primeras clases por venir bastan: con UNA que se pueda reservar ya es
 * que sí, y un horario recién creado nunca llega a tantas.
 */
const MAX_SESIONES = 500;

export interface DatosPuedeReservarServidor {
  datos: Omit<DatosPuedeReservar, 'stripe'>;
  /** `studios.stripe_account_id`: a Stripe solo se le pregunta si hace falta. */
  cuentaStripe: string | null;
}

export async function cargarDatosPuedeReservar(
  admin: SupabaseClient, studioId: string, now: Date,
): Promise<DatosPuedeReservarServidor> {
  const [studioR, sesionesR, tiposR, planesR, cierresR] = await Promise.all([
    admin.from('studios')
      .select('stripe_account_id, reserva_exigir_plan, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, reserva_antelacion_hora, apertura_suave, fecha_apertura')
      .eq('id', studioId).maybeSingle(),
    // `is not true`: `cancelada` admite NULL, y un `= false` se las dejaría fuera.
    admin.from('sesiones').select('inicio, cancelada, aforo_maximo, tipo_clase_id')
      .eq('studio_id', studioId).gt('inicio', now.toISOString()).not('cancelada', 'is', true)
      .order('inicio', { ascending: true }).limit(MAX_SESIONES),
    admin.from('tipos_clase')
      .select('id, reserva_exigir_plan, reserva_ventana_minima_minutos, reserva_antelacion_maxima_dias, requiere_autorizacion')
      .eq('studio_id', studioId),
    // Todas, no solo las vendibles: `exigePlanAlReservar` decide con TODAS si
    // hay algo que contratar, igual que el gate.
    admin.from('planes_tarifa').select('id, activo, precio, es_prueba').eq('studio_id', studioId),
    // Sin `motivo`: es texto libre de la propietaria y aquí no hace falta.
    admin.from('cierres_estudio').select('id, desde, hasta')
      .eq('studio_id', studioId).gte('hasta', hoyEnEstudio(now)),
  ]);
  const error = studioR.error ?? sesionesR.error ?? tiposR.error ?? planesR.error ?? cierresR.error;
  if (error) throw error;
  if (!studioR.data) throw new Error('Estudio no encontrado');
  const s = studioR.data;

  const planes: PlanPuedeReservar[] = (planesR.data ?? []).map(p => ({
    id: p.id as string, activo: Boolean(p.activo), precio: Number(p.precio), esPrueba: p.es_prueba === true,
  }));
  // Qué tipos cubre cada plan, solo de los que se pueden comprar: los demás no
  // le sirven de salida a una alumna nueva.
  const vendibles = planes.filter(p => p.activo && p.precio > 0).map(p => p.id);
  if (vendibles.length > 0) {
    const { data, error: e } = await admin.from('plan_tipos_clase').select('plan_id, tipo_clase_id')
      .eq('studio_id', studioId).in('plan_id', vendibles);
    if (e) throw e;
    const porPlan = new Map<string, string[]>();
    for (const t of data ?? []) porPlan.set(t.plan_id as string, [...(porPlan.get(t.plan_id as string) ?? []), t.tipo_clase_id as string]);
    for (const p of planes) if (porPlan.has(p.id)) p.tiposClaseIds = porPlan.get(p.id);
  }

  return {
    cuentaStripe: (s.stripe_account_id as string | null) ?? null,
    datos: {
      sesiones: (sesionesR.data ?? []).map(x => ({
        inicio: x.inicio as string,
        cancelada: Boolean(x.cancelada),
        aforoMaximo: Number(x.aforo_maximo ?? 0),
        tipoClaseId: (x.tipo_clase_id as string | null) ?? null,
      })),
      tipos: (tiposR.data ?? []).map(t => ({
        id: t.id as string,
        reservaExigirPlan: (t.reserva_exigir_plan as boolean | null) ?? null,
        reservaVentanaMinimaMinutos: (t.reserva_ventana_minima_minutos as number | null) ?? null,
        reservaAntelacionMaximaDias: (t.reserva_antelacion_maxima_dias as number | null) ?? null,
        requiereAutorizacion: t.requiere_autorizacion === true,
      })),
      estudio: {
        reservaExigirPlan: (s.reserva_exigir_plan as boolean | null) ?? null,
        reservaVentanaMinimaMinutos: (s.reserva_ventana_minima_minutos as number | null) ?? null,
        reservaAntelacionMaximaDias: (s.reserva_antelacion_maxima_dias as number | null) ?? null,
        reservaAntelacionHora: horaHHMM(s.reserva_antelacion_hora as string | null | undefined),
        aperturaSuave: s.apertura_suave === true,
        fechaApertura: (s.fecha_apertura as string | null) ?? null,
      },
      planes,
      cierres: (cierresR.data ?? []).map(c => ({ id: c.id as string, desde: c.desde as string, hasta: c.hasta as string, motivo: null })),
    },
  };
}

/**
 * El veredicto entero. A Stripe (hasta 2,5 s) solo se le pregunta cuando su
 * respuesta puede cambiarlo: si sin ella ya sale un sí, o un no por otra causa,
 * cobre o no cobre da lo mismo (lo fija un test de puede-reservar.test.ts).
 */
export async function puedeReservarEnServidor(
  admin: SupabaseClient, studioId: string, now: Date,
): Promise<ResultadoPuedeReservar> {
  const { datos, cuentaStripe } = await cargarDatosPuedeReservar(admin, studioId, now);
  if (!cuentaStripe) return puedeReservarAlumnaNueva({ ...datos, stripe: 'SIN_CUENTA' }, now);
  const sinPreguntar = puedeReservarAlumnaNueva({ ...datos, stripe: 'SIN_RESPUESTA' }, now);
  if (sinPreguntar.estado !== 'SIN_COMPROBAR') return sinPreguntar;
  const stripe = stripeServidor();
  const estado = stripe ? await estadoCobroCuenta(stripe, cuentaStripe, { timeoutMs: TIMEOUT_STRIPE_MS }) : 'SIN_RESPUESTA';
  return puedeReservarAlumnaNueva({ ...datos, stripe: estado }, now);
}
