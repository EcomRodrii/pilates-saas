import type { SupabaseClient } from '@supabase/supabase-js';
import type { BloqueAsistente, ContextoHerramienta, PropuestaAccion } from '../tipos.ts';
import { finDelDiaEstudio, inicioDelDiaEstudio } from '../../utils.ts';
import type { SlotSesion } from '../../calendar-logic.ts';
import type { CierreGuardado } from '../../cierres/quitar-cierre.ts';
import type { DiaHorario } from '../../types.ts';
import {
  MINUTOS_CADUCIDAD, prepararCita, prepararClase, prepararEvento, prepararSala,
  type EntradaCita, type EntradaClase, type EntradaEvento, type EntradaSala, type Preparada, type PropuestaPreparada,
} from './nucleo.ts';

// ─────────────────────────────────────────────────────────────────────────────
// Acciones del asistente: lo que lee la base de datos para PROPONER y guardar la
// propuesta. Service-role: la RLS no filtra, así que TODA consulta va con
// `.eq('studio_id', ctx.studioId)` (lo vigila herramientas-acotadas.test.ts).
// Aquí NO se crea nada del estudio: solo la fila de la propuesta.
// ─────────────────────────────────────────────────────────────────────────────

type Admin = SupabaseClient;
const lanza = (e: { message?: string } | null, que: string) => { if (e) throw new Error(`lectura fallida: ${que}`); };

async function instructoraDeMarca(ctx: ContextoHerramienta, marcaRef: string): Promise<{ id: string; activa: boolean } | null | 'ambigua'> {
  const ref = marcaRef.replace(/^\[|\]$/g, '').trim();
  if (!ref) return null;
  if (ref.startsWith('PERSONA_')) return 'ambigua';
  const e = ctx.refs.get(ref);
  if (!e || e.tipo !== 'instructora') return null;
  const { data, error } = await ctx.admin.from('instructores').select('id, activo').eq('studio_id', ctx.studioId).eq('id', e.id).maybeSingle();
  lanza(error, 'instructora');
  return data ? { id: data.id as string, activa: data.activo === true } : null;
}

const bloqueosDe = async (ctx: ContextoHerramienta, instructorId: string | null, fecha: string) => {
  if (!instructorId) return [];
  const { data, error } = await ctx.admin.from('instructora_disponibilidad_excepciones').select('hora_inicio, hora_fin')
    .eq('studio_id', ctx.studioId).eq('instructor_id', instructorId).eq('fecha', fecha).eq('tipo', 'bloqueo');
  lanza(error, 'bloqueos');
  return (data ?? []).map(b => ({ horaInicio: (b.hora_inicio as string | null) ?? null, horaFin: (b.hora_fin as string | null) ?? null }));
};

const cierresDe = async (ctx: ContextoHerramienta): Promise<CierreGuardado[]> => {
  const { data, error } = await ctx.admin.from('cierres_estudio').select('id, desde, hasta, motivo').eq('studio_id', ctx.studioId);
  lanza(error, 'cierres');
  return (data ?? []) as CierreGuardado[];
};

export async function proponerClase(input: EntradaClase, ctx: ContextoHerramienta): Promise<Preparada> {
  const desde = inicioDelDiaEstudio(input.fecha), hasta = finDelDiaEstudio(input.fecha);
  const instructora = await instructoraDeMarca(ctx, input.instructora);
  const [tipos, salas, sesiones, cierres, horario, bloqueos] = await Promise.all([
    ctx.admin.from('tipos_clase').select('id, nombre, duracion_minutos, aforo_por_defecto, archivado_en').eq('studio_id', ctx.studioId),
    ctx.admin.from('salas').select('id, nombre, capacidad').eq('studio_id', ctx.studioId),
    ctx.admin.from('sesiones').select('id, sala_id, instructor_id, inicio, fin, cancelada').eq('studio_id', ctx.studioId).eq('cancelada', false).lt('inicio', hasta).gt('fin', desde),
    cierresDe(ctx),
    ctx.admin.from('studio_horario').select('dia_semana, abierto, hora_apertura, hora_cierre').eq('studio_id', ctx.studioId),
    bloqueosDe(ctx, instructora && instructora !== 'ambigua' ? instructora.id : null, input.fecha),
  ]);
  lanza(tipos.error, 'tipos'); lanza(salas.error, 'salas'); lanza(sesiones.error, 'agenda'); lanza(horario.error, 'horario');
  const semana: DiaHorario[] = (horario.data ?? []).map(h => ({
    diaSemana: h.dia_semana as number, abierto: h.abierto as boolean, horaApertura: h.hora_apertura as string | null, horaCierre: h.hora_cierre as string | null,
  }));
  return prepararClase(input, {
    tipos: (tipos.data ?? []).map(t => ({ id: t.id as string, nombre: (t.nombre as string) || 'Clase', duracionMin: Number(t.duracion_minutos) || 60, aforo: (t.aforo_por_defecto as number | null) ?? null, archivado: !!t.archivado_en })),
    salas: (salas.data ?? []).map(s => ({ id: s.id as string, nombre: (s.nombre as string) || 'Sala', capacidad: Number(s.capacidad) || 1 })),
    instructora,
    existentes: (sesiones.data ?? []).map(s => ({ id: s.id as string, salaId: s.sala_id as string | null, instructorId: s.instructor_id as string | null, inicio: s.inicio as string, fin: s.fin as string, cancelada: false } satisfies SlotSesion)),
    bloqueosInstructora: bloqueos, cierres, horario: { semana },
    marcaInstructora: id => `[${ctx.refs.equipo(id)}]`,
  }, ctx.ahora.getTime(), ctx.hoy);
}

export async function proponerSala(input: EntradaSala, ctx: ContextoHerramienta): Promise<Preparada> {
  const { data, error } = await ctx.admin.from('salas').select('nombre').eq('studio_id', ctx.studioId);
  lanza(error, 'salas');
  return prepararSala(input, (data ?? []) as { nombre: string }[]);
}

export async function proponerEvento(input: EntradaEvento, ctx: ContextoHerramienta): Promise<Preparada> {
  const nombres = new Map<string, string>();
  for (const m of input.texto.matchAll(/\[(EQUIPO_\d+)\]/g)) {
    const e = ctx.refs.get(m[1]);
    if (e?.tipo !== 'instructora') continue;
    const { data, error } = await ctx.admin.from('instructores').select('nombre').eq('studio_id', ctx.studioId).eq('id', e.id).maybeSingle();
    lanza(error, 'equipo');
    if (data?.nombre) nombres.set(m[1], data.nombre as string);
  }
  return prepararEvento(input, ctx.ahora.getTime(), ctx.hoy, m => nombres.get(m.replace(/^\[|\]$/g, '')) ?? null);
}

export async function proponerCita(input: EntradaCita, ctx: ContextoHerramienta): Promise<Preparada> {
  const desde = inicioDelDiaEstudio(input.fecha), hasta = finDelDiaEstudio(input.fecha);
  const refSocia = input.alumna.replace(/^\[|\]$/g, '').trim();
  let socia: { id: string } | null | 'ambigua' = null;
  if (refSocia.startsWith('PERSONA_')) socia = 'ambigua';
  else {
    const e = ctx.refs.get(refSocia);
    if (e?.tipo === 'socia') {
      const { data, error } = await ctx.admin.from('socios').select('id').eq('studio_id', ctx.studioId).eq('id', e.id).is('borrado_en', null).maybeSingle();
      lanza(error, 'alumna');
      socia = data ? { id: data.id as string } : null;
    }
  }
  const instructora = await instructoraDeMarca(ctx, input.instructora);
  const iid = instructora && instructora !== 'ambigua' ? instructora.id : null;
  const [citas, sesiones, cierres, bloqueos] = iid ? await Promise.all([
    ctx.admin.from('citas').select('inicio, fin').eq('studio_id', ctx.studioId).eq('instructor_id', iid).in('estado', ['PENDIENTE', 'CONFIRMADA']).lt('inicio', hasta).gt('fin', desde),
    ctx.admin.from('sesiones').select('inicio, fin').eq('studio_id', ctx.studioId).eq('instructor_id', iid).eq('cancelada', false).lt('inicio', hasta).gt('fin', desde),
    cierresDe(ctx), bloqueosDe(ctx, iid, input.fecha),
  ]) : [{ data: [], error: null }, { data: [], error: null }, await cierresDe(ctx), []] as const;
  lanza(citas.error, 'citas'); lanza(sesiones.error, 'agenda');
  return prepararCita(input, {
    socia, instructora,
    ocupada: [...(citas.data ?? []), ...(sesiones.data ?? [])].map(o => ({ inicio: o.inicio as string, fin: o.fin as string })),
    bloqueosInstructora: bloqueos, cierres,
    marcaSocia: id => `[${ctx.refs.socia(id)}]`, marcaInstructora: id => `[${ctx.refs.equipo(id)}]`,
  }, ctx.ahora.getTime(), ctx.hoy);
}

/** Guarda la propuesta y devuelve la tarjeta. La persona la recibió: solo ella puede confirmarla. */
export async function guardarPropuesta(ctx: ContextoHerramienta, p: PropuestaPreparada): Promise<BloqueAsistente> {
  const caduca = new Date(ctx.ahora.getTime() + MINUTOS_CADUCIDAD * 60_000).toISOString();
  // Higiene: las de este estudio con más de 30 días (ya resueltas o caducadas) se van.
  const limpieza = await ctx.admin.from('asistente_acciones').delete().eq('studio_id', ctx.studioId).lt('creada_en', new Date(ctx.ahora.getTime() - 30 * 86_400_000).toISOString());
  if (limpieza.error) console.error('[asistente] purga de acciones', limpieza.error.code);
  const { data, error } = await ctx.admin.from('asistente_acciones')
    .insert({
      studio_id: ctx.studioId, auth_user_id: ctx.userId, conversacion_id: ctx.conversacionId ?? null,
      tipo: p.tipo, payload: p.payload, caduca_en: caduca,
    })
    .select('id').single();
  if (error || !data) throw new Error('lectura fallida: guardar la propuesta');
  const propuesta: PropuestaAccion = {
    id: data.id as string, accion: p.tipo, titulo: p.titulo, lineas: p.lineas, avisos: p.avisos, efecto: p.efecto,
    expiraEn: caduca, destino: p.destino,
  };
  return { tipo: 'propuesta', propuesta };
}

/** El estado vivo de las propuestas de una conversación (al reabrirla). Solo las de esta persona. */
export async function estadosDePropuestas(admin: Admin, sesion: { studioId: string; userId: string }, ids: readonly string[], ahora = new Date()): Promise<Record<string, { estado: string; resultado: unknown }>> {
  if (ids.length === 0) return {};
  const { data, error } = await admin.from('asistente_acciones').select('id, estado, caduca_en, resultado')
    .eq('studio_id', sesion.studioId).eq('auth_user_id', sesion.userId).in('id', ids.slice(0, 100));
  if (error) return {};
  return Object.fromEntries((data ?? []).map(f => {
    const caducada = f.estado === 'PROPUESTA' && Date.parse(f.caduca_en as string) <= ahora.getTime();
    return [f.id as string, { estado: caducada ? 'CADUCADA' : (f.estado as string), resultado: f.resultado ?? null }];
  }));
}
