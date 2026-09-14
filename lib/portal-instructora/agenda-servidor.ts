import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import {
  estadoBajaVista, fechaEnZona, horaEnZona,
  type BajaConClase, type BajaVista, type ClaseQueDa,
} from '@/lib/student/agenda-instructora';

// La agenda de una instructora para la app del estudio. SOLO lectura.
//
// ⚠️ Corre con service-role (la app del portal no lee nunca por RLS: todo pasa
// por rutas de servidor). La RLS que en el panel limita a INSTRUCTOR a sus
// clases (#528) aquí no actúa, así que la restricción se REPITE a mano: cada
// consulta va acotada a `studio_id` + `instructor_id` (o `instructor_original_id`)
// que salen del token verificado en la ruta, nunca del body.
//
// Qué NO devuelve, y es a propósito: nombres de alumnas, pagos, bonos ni nada
// de salud. Las cifras de ocupación son recuentos. Los datos de alumnas llegan
// en la Fase 2, acotados a sus clases y a lo mínimo (RGPD).

interface FilaSesion {
  id: string; inicio: string; fin: string; aforo_maximo: number;
  cancelada: boolean | null; tipo_clase_id: string | null; sala_id: string | null;
}
interface FilaSustitucion {
  id: string; sesion_id: string; estado: string; sustituta_final_id: string | null;
}

const COLUMNAS_SESION = 'id, inicio, fin, aforo_maximo, cancelada, tipo_clase_id, sala_id';
const OCUPA_PLAZA = new Set(['CONFIRMADA', 'ASISTIDA']);

export interface AgendaInstructora {
  clases: ClaseQueDa[];
  /** Bajas con clase en el rango, incluidas las de clases que ya no son suyas. */
  bajas: BajaConClase[];
}

export async function agendaDeInstructora(p: {
  studioId: string; instructorId: string; desde: string; hasta: string;
}): Promise<AgendaInstructora> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  // Ventana UTC holgada (un día antes, dos después) y el corte EXACTO por día
  // en la zona del estudio: una clase de las 00:30 del martes en Madrid empieza
  // el lunes en UTC.
  const desdeUtc = new Date(`${p.desde}T00:00:00Z`);
  desdeUtc.setUTCDate(desdeUtc.getUTCDate() - 1);
  const hastaUtc = new Date(`${p.hasta}T00:00:00Z`);
  hastaUtc.setUTCDate(hastaUtc.getUTCDate() + 2);
  const enRango = (s: FilaSesion) => {
    const f = fechaEnZona(s.inicio);
    return f >= p.desde && f <= p.hasta;
  };

  const [{ data: sesionesRaw, error: eSes }, { data: sustRaw, error: eSust }] = await Promise.all([
    admin.from('sesiones').select(COLUMNAS_SESION)
      .eq('studio_id', p.studioId).eq('instructor_id', p.instructorId)
      .gte('inicio', desdeUtc.toISOString()).lt('inicio', hastaUtc.toISOString())
      .order('inicio', { ascending: true }).limit(300),
    // Sus bajas, la más reciente primero: si pidió dos veces la misma clase,
    // manda la última.
    admin.from('sustituciones').select('id, sesion_id, estado, sustituta_final_id')
      .eq('studio_id', p.studioId).eq('instructor_original_id', p.instructorId)
      .order('creado_en', { ascending: false }).limit(200),
  ]);
  if (eSes) throw eSes;
  if (eSust) throw eSust;

  const propias = ((sesionesRaw ?? []) as FilaSesion[]).filter(enRango);
  const idsPropias = new Set(propias.map((s) => s.id));

  const ultimaBajaPorSesion = new Map<string, FilaSustitucion>();
  for (const s of (sustRaw ?? []) as FilaSustitucion[]) {
    if (!ultimaBajaPorSesion.has(s.sesion_id)) ultimaBajaPorSesion.set(s.sesion_id, s);
  }

  // Clases de sus bajas que YA no están a su nombre (cubiertas y reasignadas).
  const idsAjenas = [...ultimaBajaPorSesion.keys()].filter((id) => !idsPropias.has(id));
  let ajenas: FilaSesion[] = [];
  if (idsAjenas.length) {
    const { data, error } = await admin.from('sesiones').select(COLUMNAS_SESION)
      .eq('studio_id', p.studioId).in('id', idsAjenas);
    if (error) throw error;
    ajenas = ((data ?? []) as FilaSesion[]).filter(enRango);
  }

  const todas = [...propias, ...ajenas];
  const tipoIds = [...new Set(todas.map((s) => s.tipo_clase_id).filter((x): x is string => !!x))];
  const salaIds = [...new Set(propias.map((s) => s.sala_id).filter((x): x is string => !!x))];
  const sustitutaIds = [...new Set(
    [...ultimaBajaPorSesion.values()].map((s) => s.sustituta_final_id).filter((x): x is string => !!x),
  )];
  const vacio = Promise.resolve({ data: [] as unknown[], error: null });

  const [tipos, salas, reservas, sustitutas] = await Promise.all([
    tipoIds.length
      ? admin.from('tipos_clase').select('id, nombre, color').eq('studio_id', p.studioId).in('id', tipoIds)
      : vacio,
    salaIds.length
      ? admin.from('salas').select('id, nombre').eq('studio_id', p.studioId).in('id', salaIds)
      : vacio,
    propias.length
      ? admin.from('reservas').select('sesion_id, estado').eq('studio_id', p.studioId)
          .in('sesion_id', [...idsPropias]).in('estado', ['CONFIRMADA', 'ASISTIDA', 'LISTA_ESPERA'])
      : vacio,
    sustitutaIds.length
      ? admin.from('instructores').select('id, nombre').eq('studio_id', p.studioId).in('id', sustitutaIds)
      : vacio,
  ]);
  for (const r of [tipos, salas, reservas, sustitutas]) if (r.error) throw r.error;

  const tipoPorId = new Map(((tipos.data ?? []) as Array<{ id: string; nombre: string; color: string | null }>)
    .map((t) => [t.id, t]));
  const salaPorId = new Map(((salas.data ?? []) as Array<{ id: string; nombre: string }>).map((s) => [s.id, s.nombre]));
  const nombreSustituta = new Map(((sustitutas.data ?? []) as Array<{ id: string; nombre: string }>)
    .map((i) => [i.id, i.nombre]));

  const ocupadas = new Map<string, number>();
  const enEspera = new Map<string, number>();
  for (const r of (reservas.data ?? []) as Array<{ sesion_id: string; estado: string }>) {
    const destino = OCUPA_PLAZA.has(r.estado) ? ocupadas : enEspera;
    destino.set(r.sesion_id, (destino.get(r.sesion_id) ?? 0) + 1);
  }

  const bajaDe = (sesionId: string): BajaVista | null => {
    const s = ultimaBajaPorSesion.get(sesionId);
    if (!s) return null;
    const estado = estadoBajaVista(s.estado);
    return {
      sustitucionId: s.id,
      sesionId,
      estado,
      sustituta: estado === 'cubierta' && s.sustituta_final_id ? nombreSustituta.get(s.sustituta_final_id) ?? null : null,
    };
  };
  const nombreTipo = (s: FilaSesion) => (s.tipo_clase_id && tipoPorId.get(s.tipo_clase_id)?.nombre) || 'Clase';

  const clases: ClaseQueDa[] = propias.map((s) => ({
    id: s.id,
    inicio: s.inicio,
    fin: s.fin,
    fecha: fechaEnZona(s.inicio),
    hora: horaEnZona(s.inicio),
    horaFin: horaEnZona(s.fin),
    tipo: nombreTipo(s),
    color: (s.tipo_clase_id && tipoPorId.get(s.tipo_clase_id)?.color) || null,
    sala: (s.sala_id && salaPorId.get(s.sala_id)) || null,
    aforo: s.aforo_maximo,
    confirmadas: ocupadas.get(s.id) ?? 0,
    enEspera: enEspera.get(s.id) ?? 0,
    cancelada: s.cancelada === true,
    baja: bajaDe(s.id),
  }));

  const bajas: BajaConClase[] = todas
    .map((s) => {
      const baja = bajaDe(s.id);
      return baja ? { ...baja, inicio: s.inicio, fecha: fechaEnZona(s.inicio), hora: horaEnZona(s.inicio), tipo: nombreTipo(s) } : null;
    })
    .filter((b): b is BajaConClase => b !== null)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));

  return { clases, bajas };
}
