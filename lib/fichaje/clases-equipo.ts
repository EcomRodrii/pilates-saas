import type { SupabaseClient } from '@supabase/supabase-js';
import { TZ_ESTUDIO, uid } from '../utils.ts';
import { nombresPorCuenta } from './jornadas-equipo.ts';
import {
  estadoDeClase, jornadaCubre, retrasoMinutos, HORAS_MARGEN_OTRO_HORARIO,
  type EstadoClase, type FilaClase, type Relacion, type SesionClase, type Tramo,
} from './clases-impartidas.ts';

// Lo que ve quien gestiona el equipo de las clases del mes en «Tiempo trabajado»:
// si cada una se dio, a qué hora empezó, cómo se supo y qué se cambió.
//
// Service-role: todo va acotado a mano al estudio de la sesión y a las fichas que
// puede gestionar quien pregunta (lo decide la ruta, como en las jornadas).

export interface ClaseEquipo {
  sesionId: string;
  instructorId: string;
  nombre: string;
  inicio: string;
  fin: string;
  estado: EstadoClase;
  origen: 'BOTON' | 'LISTA' | 'CONFIRMACION' | 'PROPIETARIA' | null;
  inicioReal: string | null;
  finReal: string | null;
  retrasoMin: number;
  /** Contratada: dada por caer dentro de su jornada, sin empezarla ni confirmarla. */
  porJornada: boolean;
  /** Contratada que la dio sin tener la jornada abierta: olvido de fichar a corregir. */
  fueraDeJornada: boolean;
  /** «No la di» ya visto por quien gestiona. */
  revisada: boolean;
}

export interface CambioClase {
  accion: 'EMPEZADA' | 'DADA_POR_LISTA' | 'CONFIRMADA' | 'NO_DADA' | 'FIN_CAMBIADO' | 'CORREGIDA' | 'REVISADA';
  campo: string | null;
  antes: string | null;
  despues: string | null;
  motivo: string | null;
  en: string;
  por: string | null;
}

type Nombre = { nombre: string } | { nombre: string }[] | null;
interface FilaSesion { id: string; inicio: string; fin: string; cancelada: boolean | null; instructor_id: string; tipos_clase: Nombre }
interface FilaImpartida extends FilaClase { instructor_id: string; revisada_en: string | null }

/**
 * Las clases del mes que ya han empezado, de las fichas indicadas. Las futuras
 * no dicen nada todavía y las canceladas no son trabajo: no se listan.
 */
export async function listarClasesEquipo(
  admin: SupabaseClient,
  p: { studioId: string; desde: string; hasta: string; instructorIds: readonly string[] },
  ahora = new Date(),
): Promise<{ clases: ClaseEquipo[]; cambios: Record<string, CambioClase[]> }> {
  if (p.instructorIds.length === 0) return { clases: [], cambios: {} };
  const hastaReal = new Date(Math.min(Date.parse(p.hasta), ahora.getTime())).toISOString();
  if (hastaReal <= p.desde) return { clases: [], cambios: {} };

  const ids = [...p.instructorIds];
  const [ses, tarifas, jornadas] = await Promise.all([
    admin.from('sesiones').select('id, inicio, fin, cancelada, instructor_id, tipos_clase(nombre)')
      .eq('studio_id', p.studioId).in('instructor_id', ids).eq('cancelada', false)
      .gte('inicio', p.desde).lt('inicio', hastaReal)
      .order('inicio', { ascending: false }),
    admin.from('instructor_tarifas').select('instructor_id, relacion_laboral').eq('studio_id', p.studioId).in('instructor_id', ids),
    // Un día de margen hacia atrás: una jornada del último día del mes anterior puede cubrir una clase del día 1.
    admin.from('instructor_work_sessions').select('instructor_id, check_in_at, check_out_at')
      .eq('studio_id', p.studioId).in('instructor_id', ids)
      .gte('check_in_at', new Date(Date.parse(p.desde) - 24 * 3600_000).toISOString()).lt('check_in_at', hastaReal),
  ]);
  if (ses.error) throw ses.error;
  if (tarifas.error) throw tarifas.error;
  if (jornadas.error) throw jornadas.error;

  const sesiones = (ses.data ?? []) as unknown as FilaSesion[];
  if (sesiones.length === 0) return { clases: [], cambios: {} };

  // Por la fecha de su sesión y no con `in(ids)`: un mes entero de un estudio son
  // cientos de ids, demasiados para la URL de una petición.
  const { data: filasData, error: errFilas } = await admin.from('clases_impartidas')
    .select('sesion_id, instructor_id, estado, inicio_real, fin_real, origen, revisada_en, sesiones!inner(inicio)')
    .eq('studio_id', p.studioId).gte('sesiones.inicio', p.desde).lt('sesiones.inicio', hastaReal);
  if (errFilas) throw errFilas;
  const filas = new Map(((filasData ?? []) as FilaImpartida[]).map((f) => [f.sesion_id, f]));

  const relacion = new Map<string, Relacion>();
  for (const t of (tarifas.data ?? []) as { instructor_id: string; relacion_laboral: string | null }[]) {
    relacion.set(t.instructor_id, t.relacion_laboral === 'CONTRATADA' || t.relacion_laboral === 'AUTONOMA' ? t.relacion_laboral : null);
  }
  const tramos = new Map<string, Tramo[]>();
  for (const j of (jornadas.data ?? []) as { instructor_id: string; check_in_at: string; check_out_at: string | null }[]) {
    const l = tramos.get(j.instructor_id) ?? [];
    l.push({ desde: j.check_in_at, hasta: j.check_out_at });
    tramos.set(j.instructor_id, l);
  }

  const clases = sesiones.map((f): ClaseEquipo => {
    const t = Array.isArray(f.tipos_clase) ? f.tipos_clase[0] : f.tipos_clase;
    const s: SesionClase = { id: f.id, inicio: f.inicio, fin: f.fin, cancelada: false, nombre: t?.nombre ?? 'Clase' };
    // La fila es de quien la dio; si la clase cambió de instructora después, manda la de ahora.
    const filaBruta = filas.get(f.id);
    const fila = filaBruta && filaBruta.instructor_id === f.instructor_id ? filaBruta : null;
    const rel = relacion.get(f.instructor_id) ?? null;
    const suyas = tramos.get(f.instructor_id) ?? [];
    const { estado, porJornada } = estadoDeClase(s, fila, suyas, rel, ahora);
    return {
      sesionId: f.id, instructorId: f.instructor_id, nombre: s.nombre, inicio: f.inicio, fin: f.fin, estado,
      origen: (fila?.origen as ClaseEquipo['origen']) ?? null,
      inicioReal: fila?.inicio_real ?? null, finReal: fila?.fin_real ?? null,
      retrasoMin: retrasoMinutos(s, fila), porJornada,
      fueraDeJornada: rel === 'CONTRATADA' && fila?.estado === 'DADA' && !jornadaCubre(s, suyas, ahora),
      revisada: filaBruta?.revisada_en != null,
    };
  });

  // Lo más reciente primero: si PostgREST corta en 1000 filas, se pierde lo más
  // viejo del historial, no lo último que se cambió.
  const { data: auds, error: errAud } = await admin.from('clases_impartidas_auditoria')
    .select('sesion_id, accion, campo, valor_antes, valor_despues, motivo, created_at, created_by, sesiones!inner(inicio)')
    .eq('studio_id', p.studioId).gte('sesiones.inicio', p.desde).lt('sesiones.inicio', hastaReal)
    .order('created_at', { ascending: false });
  if (errAud) throw errAud;
  const filasAud = ((auds ?? []) as unknown[]).reverse() as {
    sesion_id: string; accion: CambioClase['accion']; campo: string | null; valor_antes: string | null;
    valor_despues: string | null; motivo: string | null; created_at: string; created_by: string;
  }[];
  const nombres = await nombresPorCuenta(admin, p.studioId, [...new Set(filasAud.map((a) => a.created_by))]);
  const cambios: Record<string, CambioClase[]> = {};
  for (const a of filasAud) {
    (cambios[a.sesion_id] ??= []).push({
      accion: a.accion, campo: a.campo, antes: a.valor_antes, despues: a.valor_despues,
      motivo: a.motivo, en: a.created_at, por: nombres.get(a.created_by) ?? null,
    });
  }
  return { clases, cambios };
}

export interface ResumenClases { instructorId: string; dadas: number; minutosDados: number; sinConfirmar: number; noDadasPorRevisar: number; fueraDeJornada: number }

/** Totales por instructora. Los minutos son del horario de cada clase dada. */
export function resumirClases(clases: readonly ClaseEquipo[]): ResumenClases[] {
  const porId = new Map<string, ResumenClases>();
  for (const c of clases) {
    const r = porId.get(c.instructorId) ?? { instructorId: c.instructorId, dadas: 0, minutosDados: 0, sinConfirmar: 0, noDadasPorRevisar: 0, fueraDeJornada: 0 };
    if (c.estado === 'DADA' || c.estado === 'EN_CURSO' || c.estado === 'PREVIA') {
      r.dadas++;
      r.minutosDados += Math.round((Date.parse(c.fin) - Date.parse(c.inicio)) / 60_000);
    }
    if (c.estado === 'SIN_CONFIRMAR') r.sinConfirmar++;
    if (c.estado === 'NO_DADA' && !c.revisada) r.noDadasPorRevisar++;
    if (c.fueraDeJornada) r.fueraDeJornada++;
    porId.set(c.instructorId, r);
  }
  return [...porId.values()];
}

// ── Escrituras de quien gestiona el equipo ──────────────────────────────────

export interface CorreccionClase { sesionId: string; estado: 'DADA' | 'NO_DADA'; inicio?: string; fin?: string }
type Ctx = { studioId: string; userId: string };
type Res = { ok: true; corregidas: number } | { ok: false; status: number; error: string };

/**
 * Deja una o varias clases como dadas (a su hora o con otro horario) o como no
 * dadas. El motivo es obligatorio y queda en el historial con el valor anterior.
 * `instructorIds` son las fichas que puede gestionar quien corrige: una clase de
 * otra ficha o de otro estudio responde como no encontrada.
 */
export async function corregirClases(
  admin: SupabaseClient, c: Ctx, instructorIds: readonly string[], items: CorreccionClase[], motivo: string, ahora = new Date(),
): Promise<Res> {
  const m = motivo.trim();
  if (!m) return { ok: false, status: 400, error: 'Indica el motivo del cambio.' };
  if (m.length > 300) return { ok: false, status: 400, error: 'El motivo es demasiado largo.' };
  if (items.length === 0 || items.length > 60) return { ok: false, status: 400, error: 'Petición no válida' };

  const { data: ses, error } = await admin.from('sesiones').select('id, inicio, fin, cancelada, instructor_id')
    .eq('studio_id', c.studioId).in('id', items.map((i) => i.sesionId));
  if (error) throw error;
  const porId = new Map(((ses ?? []) as { id: string; inicio: string; fin: string; cancelada: boolean | null; instructor_id: string | null }[]).map((s) => [s.id, s]));

  // Todo o nada en la validación: una corrección a medias confunde más que un error.
  const margen = HORAS_MARGEN_OTRO_HORARIO * 3600_000;
  const filasNuevas: { item: CorreccionClase; s: { id: string; inicio: string; fin: string; instructor_id: string }; inicio: string | null; fin: string | null }[] = [];
  for (const it of items) {
    const s = porId.get(it.sesionId);
    if (!s || !s.instructor_id || !instructorIds.includes(s.instructor_id) || s.cancelada) {
      return { ok: false, status: 404, error: 'Clase no encontrada' };
    }
    if (Date.parse(s.inicio) > ahora.getTime()) return { ok: false, status: 400, error: 'Esa clase todavía no ha empezado.' };
    if (it.estado === 'NO_DADA') { filasNuevas.push({ item: it, s: { ...s, instructor_id: s.instructor_id }, inicio: null, fin: null }); continue; }
    const ini = it.inicio ? Date.parse(it.inicio) : Date.parse(s.inicio);
    const fin = it.fin ? Date.parse(it.fin) : Date.parse(s.fin);
    if (Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini) return { ok: false, status: 400, error: 'Revisa el horario: el fin tiene que ser posterior al inicio.' };
    if (ini < Date.parse(s.inicio) - margen || fin > Date.parse(s.fin) + margen) return { ok: false, status: 400, error: 'Ese horario está demasiado lejos del de la clase.' };
    // A su hora = sin fin real (termina a su hora); con otro horario, el que se diga.
    const aSuHora = !it.inicio && !it.fin;
    filasNuevas.push({
      item: it, s: { ...s, instructor_id: s.instructor_id },
      inicio: new Date(ini).toISOString(), fin: aSuHora ? null : new Date(fin).toISOString(),
    });
  }

  const { data: previas, error: errPrev } = await admin.from('clases_impartidas')
    .select('sesion_id, instructor_id, estado, inicio_real, fin_real')
    .eq('studio_id', c.studioId).in('sesion_id', items.map((i) => i.sesionId));
  if (errPrev) throw errPrev;
  const antes = new Map(((previas ?? []) as { sesion_id: string; instructor_id: string; estado: string; inicio_real: string | null; fin_real: string | null }[]).map((f) => [f.sesion_id, f]));

  const cuando = ahora.toISOString();
  let corregidas = 0;
  for (const n of filasNuevas) {
    const previa = antes.get(n.s.id);
    const valores = {
      instructor_id: n.s.instructor_id, estado: n.item.estado, inicio_real: n.inicio, fin_real: n.fin,
      revisada_en: cuando, revisada_por: c.userId,
    };
    const q = previa
      ? admin.from('clases_impartidas').update({ ...valores, edited_at: cuando, edited_by: c.userId })
          .eq('sesion_id', n.s.id).eq('studio_id', c.studioId)
      : admin.from('clases_impartidas').insert({ sesion_id: n.s.id, studio_id: c.studioId, origen: 'PROPIETARIA', created_by: c.userId, ...valores });
    const { error: e } = await q;
    if (e) throw e;
    corregidas++;
    await admin.from('clases_impartidas_auditoria').insert({
      id: uid(), studio_id: c.studioId, sesion_id: n.s.id, accion: 'CORREGIDA', campo: 'estado',
      valor_antes: previa ? describir(previa.estado, previa.inicio_real, previa.fin_real) : 'sin confirmar',
      valor_despues: describir(n.item.estado, n.inicio, n.fin), motivo: m, created_by: c.userId,
    });
  }
  return { ok: true, corregidas };
}

/** «No la di» visto por quien gestiona: sale de la bandeja; la clase sigue sin pagarse. */
export async function marcarRevisada(
  admin: SupabaseClient, c: Ctx, instructorIds: readonly string[], sesionId: string, ahora = new Date(),
): Promise<Res> {
  const { data, error } = await admin.from('clases_impartidas').select('instructor_id, estado, revisada_en')
    .eq('studio_id', c.studioId).eq('sesion_id', sesionId).maybeSingle();
  if (error) throw error;
  const f = data as { instructor_id: string; estado: string; revisada_en: string | null } | null;
  if (!f || !instructorIds.includes(f.instructor_id)) return { ok: false, status: 404, error: 'Clase no encontrada' };
  if (f.revisada_en) return { ok: true, corregidas: 0 };
  const { error: e } = await admin.from('clases_impartidas')
    .update({ revisada_en: ahora.toISOString(), revisada_por: c.userId })
    .eq('studio_id', c.studioId).eq('sesion_id', sesionId).is('revisada_en', null);
  if (e) throw e;
  await admin.from('clases_impartidas_auditoria').insert({
    id: uid(), studio_id: c.studioId, sesion_id: sesionId, accion: 'REVISADA', created_by: c.userId,
  });
  return { ok: true, corregidas: 1 };
}

const fmtHora = new Intl.DateTimeFormat('es-ES', { timeZone: TZ_ESTUDIO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Para el historial, en palabras: «dada 18:05–19:00», «dada desde 18:10», «no dada». */
function describir(estado: string, inicio: string | null, fin: string | null): string {
  if (estado === 'NO_DADA') return 'no dada';
  if (!inicio) return 'dada';
  return fin ? `dada ${fmtHora.format(new Date(inicio))}–${fmtHora.format(new Date(fin))}` : `dada desde ${fmtHora.format(new Date(inicio))}`;
}
