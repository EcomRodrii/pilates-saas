import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
// Rutas relativas a propósito: lo importan módulos de servidor que también
// cargan las pruebas de `node --test` (lib/opening), que no resuelven `@/`.
import { estadosDeClientas, hechosDeAsistencia, type HechosAsistencia, type ResultadoEstado } from './estado.ts';
import { conReintentoTransitorio } from '../reintento-transitorio.ts';
import type { PlanTarifa, Reserva, Sesion, Socio, Suscripcion } from '../types.ts';

// El ESTADO de cada socia calculado en el SERVIDOR: la misma función
// (`estadosDeClientas`) y los mismos hechos que la pantalla de Clientas —su
// ficha, todas sus cuotas y bonos, el catálogo de planes y sus reservas—, para
// que una audiencia de campaña, un post de Comunidad o el módulo de apertura
// cuenten a las mismas personas que el chip que ve la propietaria.
//
// `socioIds` acota a unas pocas (la socia que mira su app): entonces solo se
// leen sus filas. Sin él, las del estudio entero, paginadas.
//
// `null` si cualquier lectura falla: quien llama decide qué hacer (no mandar,
// no contar), nunca «no hay nadie».

const ESTADOS_QUE_CUENTAN = ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO'];
const TROZO_IDS = 200;
// Con más ids que esto, un `in(...)` no cabe en la URL: se lee el estudio entero
// y se devuelven solo las pedidas.
const MAX_IDS_FILTRO = 100;

export type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

const POR_PAGINA = 1000;

/** Todas las filas, de 1.000 en 1.000 (PostgREST corta ahí), reintentando un 504 pasajero. La usan también los cargadores de lib/cobros/recibos-servidor.ts y lib/calendario/rango-servidor.ts. */
export async function todasLasFilas<T>(pagina: (desde: number, hasta: number) => Pagina<T>): Promise<{ data: T[]; error: { message: string } | null }> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += POR_PAGINA) {
    const { resultado } = await conReintentoTransitorio(async () => await pagina(desde, desde + POR_PAGINA - 1));
    if (resultado.error) return { data: filas, error: resultado.error };
    const lote = resultado.data ?? [];
    filas.push(...lote);
    if (lote.length < POR_PAGINA) return { data: filas, error: null };
  }
}

export interface ClientasServidor {
  estados: Map<string, ResultadoEstado>;
  /** Última clase a la que vino y primera reserva, por socia: lo que pide `sinVenir`. */
  hechos: Map<string, HechosAsistencia>;
  /** Las fichas leídas (sin las borradas), con su alta: la otra mitad de `contarSinVenir`. */
  fichas: { id: string; fechaAlta: string | null }[];
}

/**
 * El estado de TODAS las socias del estudio y los hechos de asistencia de los
 * que sale, para quien además necesita «sin venir»: el asistente cuenta así
 * activas y «sin venir 30d» con las mismas funciones que el Resumen
 * (`contarPorEstado`, `contarSinVenir`), y da el mismo número por construcción.
 */
export async function cargarClientasServidor(
  admin: SupabaseClient,
  studioId: string,
  opciones: { ahora: Date },
): Promise<ClientasServidor | null> {
  return leerYCalcular(admin, studioId, opciones.ahora, null);
}

export async function cargarEstadosClientas(
  admin: SupabaseClient,
  studioId: string,
  opciones: { ahora: Date; socioIds?: readonly string[] },
): Promise<Map<string, ResultadoEstado> | null> {
  const pedidas = opciones.socioIds ? [...new Set(opciones.socioIds)] : null;
  if (pedidas && pedidas.length === 0) return new Map();
  const ids = pedidas && pedidas.length <= MAX_IDS_FILTRO ? pedidas : null;
  const leido = await leerYCalcular(admin, studioId, opciones.ahora, ids);
  if (!leido) return null;
  const estados = leido.estados;
  if (!pedidas || ids) return estados;
  const solo = new Set(pedidas);
  return new Map([...estados].filter(([id]) => solo.has(id)));
}

async function leerYCalcular(
  admin: SupabaseClient, studioId: string, ahora: Date, ids: readonly string[] | null,
): Promise<ClientasServidor | null> {

  type FSocio = { id: string; activo: boolean | null; fecha_alta: string | null; lead_stage: string | null };
  type FSus = { id: string; socio_id: string; plan_id: string; estado: string; fecha_inicio: string; fecha_fin: string | null; sesiones_restantes: number | null };
  type FPlan = { id: string; tipo: string; es_prueba: boolean | null };
  type FReserva = { id: string; socio_id: string; sesion_id: string; estado: string };
  type FSesion = { id: string; inicio: string };

  const [socios, suscripciones, planes, reservas] = await Promise.all([
    todasLasFilas<FSocio>((d, h) => {
      let q = admin.from('socios').select('id, activo, fecha_alta, lead_stage').eq('studio_id', studioId).is('borrado_en', null);
      if (ids) q = q.in('id', ids);
      return q.order('id').range(d, h) as unknown as Pagina<FSocio>;
    }),
    todasLasFilas<FSus>((d, h) => {
      let q = admin.from('suscripciones').select('id, socio_id, plan_id, estado, fecha_inicio, fecha_fin, sesiones_restantes').eq('studio_id', studioId);
      if (ids) q = q.in('socio_id', ids);
      return q.order('id').range(d, h) as unknown as Pagina<FSus>;
    }),
    todasLasFilas<FPlan>((d, h) =>
      admin.from('planes_tarifa').select('id, tipo, es_prueba').eq('studio_id', studioId).order('id').range(d, h) as unknown as Pagina<FPlan>),
    todasLasFilas<FReserva>((d, h) => {
      let q = admin.from('reservas').select('id, socio_id, sesion_id, estado').eq('studio_id', studioId).in('estado', ESTADOS_QUE_CUENTAN);
      if (ids) q = q.in('socio_id', ids);
      return q.order('id').range(d, h) as unknown as Pagina<FReserva>;
    }),
  ]);
  if (socios.error || suscripciones.error || planes.error || reservas.error) return null;

  // Las clases de esas reservas: todas las del estudio si se mira a todas; si
  // no, solo las suyas, por trozos (una URL con miles de ids no cabe).
  let sesiones: FSesion[] = [];
  if (ids) {
    const idsSesion = [...new Set(reservas.data.map(r => r.sesion_id))];
    for (let i = 0; i < idsSesion.length; i += TROZO_IDS) {
      const { data, error } = await admin.from('sesiones').select('id, inicio')
        .eq('studio_id', studioId).in('id', idsSesion.slice(i, i + TROZO_IDS));
      if (error) return null;
      sesiones.push(...((data ?? []) as FSesion[]));
    }
  } else {
    const todas = await todasLasFilas<FSesion>((d, h) =>
      admin.from('sesiones').select('id, inicio').eq('studio_id', studioId).order('id').range(d, h) as unknown as Pagina<FSesion>);
    if (todas.error) return null;
    sesiones = todas.data;
  }

  const reservasMapeadas = reservas.data.map(r => ({ socioId: r.socio_id, sesionId: r.sesion_id, estado: r.estado }) as Pick<Reserva, 'socioId' | 'sesionId' | 'estado'>);
  const sesionesMapeadas = sesiones as Pick<Sesion, 'id' | 'inicio'>[];
  const hechos = hechosDeAsistencia(reservasMapeadas, sesionesMapeadas, ahora);
  const estados = estadosDeClientas({
    socios: socios.data.map(s => ({ id: s.id, activo: s.activo ?? true, fechaAlta: s.fecha_alta, leadStage: s.lead_stage ?? undefined }) as Pick<Socio, 'id' | 'activo' | 'fechaAlta' | 'leadStage'>),
    suscripciones: suscripciones.data.map(s => ({
      id: s.id, socioId: s.socio_id, planId: s.plan_id, estado: s.estado, fechaInicio: s.fecha_inicio,
      fechaFin: s.fecha_fin, sesionesRestantes: s.sesiones_restantes,
    }) as unknown as Suscripcion),
    planesTarifa: planes.data.map(p => ({ id: p.id, tipo: p.tipo, esPrueba: p.es_prueba === true }) as unknown as PlanTarifa),
    reservas: reservasMapeadas,
    sesiones: sesionesMapeadas,
  }, ahora, hechos);
  return { estados, hechos, fichas: socios.data.map(s => ({ id: s.id, fechaAlta: s.fecha_alta })) };
}
