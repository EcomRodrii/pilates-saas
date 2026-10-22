import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Rutas relativas: lo prueba `node --test`.
import { encendidaPara } from '../interruptor-por-estudio.ts';
import { puedeReservarEnServidor } from '../onboarding/puede-reservar-servidor.ts';
import type { RespuestaPuedeReservar } from '../onboarding/puede-reservar.ts';
import { avisoDeClase } from './aviso-clase.ts';
import type { EstadoAlta } from './estado.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que contesta GET /api/alta/estado (lib/alta/estado.ts dice qué es cada
// cosa). Aquí, de dónde sale:
//   · una consulta por cosa, todas acotadas al estudio de la sesión y con
//     `limit(1)`: se pregunta si HAY, no cuántas;
//   · la clase reservable, del embudo si ya consta; si no, y solo si hay alguna
//     clase por venir, se le pregunta al MISMO motor que decide la reserva
//     (`puedeReservarEnServidor`). Con el SÍ, quien llama apunta el hito, para
//     no volver a preguntar.
//
// ⚠️ Cliente service-role: la RLS no filtra. El estudio sale SIEMPRE de la
// sesión de quien llama. Lanza si una lectura falla: la ruta contesta 500 y la
// pantalla no marca nada (mejor una tarea de más que una dada por hecha).
// ─────────────────────────────────────────────────────────────────────────────

const PASOS_QUE_SE_LEEN = ['clase_reservable', 'enlace_compartido', 'recorrido_visto', 'plan_ensenado'] as const;

export interface EstadoAltaServidor {
  estado: EstadoAlta;
  /** El SÍ se acaba de saber preguntando (no constaba en el embudo): hay que apuntarlo. */
  apuntarClaseReservable: boolean;
}

export async function estadoDelAlta(
  admin: SupabaseClient,
  studioId: string,
  ahora: Date,
  entorno: Record<string, string | undefined> = process.env,
  preguntar: (admin: SupabaseClient, studioId: string, ahora: Date) => Promise<RespuestaPuedeReservar> = puedeReservarEnServidor,
): Promise<EstadoAltaServidor> {
  const [estudio, embudo, socio, reserva, futura] = await Promise.all([
    admin.from('studios').select('cadena_id').eq('id', studioId).maybeSingle(),
    admin.from('embudo_alta').select('paso').eq('studio_id', studioId).in('paso', [...PASOS_QUE_SE_LEEN]),
    admin.from('socios').select('id').eq('studio_id', studioId).is('borrado_en', null).limit(1),
    // Cualquier reserva, cancelada o no y la haga quien la haga: el mismo
    // criterio que `estudioActivado` (lib/onboarding.ts).
    admin.from('reservas').select('id').eq('studio_id', studioId).limit(1),
    // `is not true`: `cancelada` admite NULL.
    admin.from('sesiones').select('id').eq('studio_id', studioId).gt('inicio', ahora.toISOString())
      .not('cancelada', 'is', true).limit(1),
  ]);
  const error = estudio.error ?? embudo.error ?? socio.error ?? reserva.error ?? futura.error;
  if (error) throw new Error(error.message);

  const pasos = new Set((embudo.data ?? []).map(f => f.paso as string));
  let sedesAbiertas = 1;
  const cadenaId = (estudio.data?.cadena_id as string | null | undefined) ?? null;
  if (cadenaId) {
    const { count, error: e } = await admin.from('studios').select('id', { count: 'exact', head: true }).eq('cadena_id', cadenaId);
    if (e) throw new Error(e.message);
    sedesAbiertas = Math.max(1, count ?? 1);
  }

  let claseReservable = pasos.has('clase_reservable');
  let apuntarClaseReservable = false;
  let avisoClase: EstadoAlta['avisoClase'] = null;
  if (!claseReservable && (futura.data ?? []).length > 0) {
    // Si no se puede preguntar, no se marca ni se avisa: no se sabe.
    const veredicto = await preguntar(admin, studioId, ahora).catch((): RespuestaPuedeReservar => ({ estado: 'SIN_COMPROBAR' }));
    if (veredicto.estado === 'SI') {
      claseReservable = true;
      apuntarClaseReservable = true;
    } else {
      avisoClase = avisoDeClase(veredicto);
    }
  }

  return {
    estado: {
      claseReservable,
      avisoClase,
      enlaceCompartido: pasos.has('enlace_compartido'),
      alumnas: (socio.data ?? []).length > 0,
      primeraReserva: (reserva.data ?? []).length > 0,
      recorridoVisto: pasos.has('recorrido_visto'),
      planEnsenado: pasos.has('plan_ensenado'),
      sedesAbiertas,
      foundingGratis: encendidaPara(entorno.FOUNDING_GRATIS, studioId),
    },
    apuntarClaseReservable,
  };
}
