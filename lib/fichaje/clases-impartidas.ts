import type { SupabaseClient } from '@supabase/supabase-js';
import { horaEstudio, uid } from '../utils.ts';
import { registrarEntrada } from './fichaje-servidor.ts';

// Clases impartidas: qué clase dio de verdad cada instructora y a qué hora.
// Control horario, no asistencia de alumnas.
//
// Reglas (decididas con el fundador el 21-sep-2026):
//   · «Empezar clase» aparece 15 min antes y hasta que termina. Registra la hora
//     real (antes de la hora = a su hora; después = retraso, que solo se enseña).
//   · Pasar lista también la da por dada, a su hora.
//   · Termina sola a la hora programada: `fin_real` nulo = fin de la sesión.
//     Empezar otra cierra la que siguiera en curso, y «Terminé antes» la cierra
//     mientras está en curso. Terminar más tarde no cambia nada: se paga el
//     horario programado.
//   · La olvidada queda «sin confirmar» y se confirma después: a su hora, con
//     otro horario o «no la di».
//   · Contratada: empezar le abre la jornada si no la tenía, y una clase que cae
//     dentro de su jornada cuenta como dada sin tocar nada. Autónoma: no ficha
//     jornada (ver `relacionDe`).
//
// Service-role: cada consulta va acotada a `studio_id` + `instructor_id` de la
// sesión verificada. La clase la decide `sesiones.instructor_id` — al confirmar
// una sustitución pasa a la sustituta, así que confirma quien la da.

export type Relacion = 'CONTRATADA' | 'AUTONOMA' | null;
export type EstadoClase = 'FUTURA' | 'EMPEZABLE' | 'EN_CURSO' | 'DADA' | 'NO_DADA' | 'SIN_CONFIRMAR' | 'PREVIA' | 'CANCELADA';

export const MIN_ANTES_EMPEZAR = 15;
export const HORAS_MARGEN_OTRO_HORARIO = 3;
export const DIAS_PARA_CONFIRMAR = 14;
/** Las clases anteriores no se preguntan: la función no existía (00:00 del 22-sep-2026 en Madrid). */
export const CONFIRMAR_CLASES_DESDE = '2026-09-21T22:00:00.000Z';

export interface SesionClase { id: string; inicio: string; fin: string; cancelada: boolean; nombre: string }
export interface FilaClase {
  sesion_id: string; estado: 'DADA' | 'NO_DADA'; inicio_real: string | null; fin_real: string | null; origen: string;
}
export interface Tramo { desde: string; hasta: string | null }

const MIN = 60_000;

export function finEfectivo(s: SesionClase, fila: FilaClase | null): string {
  return fila?.fin_real ?? s.fin;
}

/** La jornada cubre la clase si solapa al menos la mitad de su duración. */
export function jornadaCubre(s: SesionClase, jornadas: readonly Tramo[], ahora: Date): boolean {
  const ini = Date.parse(s.inicio);
  const fin = Date.parse(s.fin);
  const dur = fin - ini;
  if (dur <= 0) return false;
  return jornadas.some((j) => {
    const desde = Date.parse(j.desde);
    const hasta = j.hasta ? Date.parse(j.hasta) : ahora.getTime();
    return Math.min(fin, hasta) - Math.max(ini, desde) >= dur / 2;
  });
}

export function estadoDeClase(
  s: SesionClase, fila: FilaClase | null, jornadas: readonly Tramo[], relacion: Relacion, ahora: Date,
): { estado: EstadoClase; porJornada: boolean } {
  const t = ahora.getTime();
  if (s.cancelada) return { estado: 'CANCELADA', porJornada: false };
  if (fila?.estado === 'NO_DADA') return { estado: 'NO_DADA', porJornada: false };
  if (fila?.estado === 'DADA') {
    return { estado: t < Date.parse(finEfectivo(s, fila)) ? 'EN_CURSO' : 'DADA', porJornada: false };
  }
  if (t < Date.parse(s.inicio) - MIN_ANTES_EMPEZAR * MIN) return { estado: 'FUTURA', porJornada: false };
  if (t <= Date.parse(s.fin)) return { estado: 'EMPEZABLE', porJornada: false };
  if (relacion !== 'AUTONOMA' && jornadaCubre(s, jornadas, ahora)) return { estado: 'DADA', porJornada: true };
  if (s.inicio < CONFIRMAR_CLASES_DESDE) return { estado: 'PREVIA', porJornada: false };
  return { estado: 'SIN_CONFIRMAR', porJornada: false };
}

/** Minutos de retraso al empezar (solo se miden con el botón: la lista y lo confirmado van a su hora). */
export function retrasoMinutos(s: SesionClase, fila: FilaClase | null): number {
  if (fila?.estado !== 'DADA' || !fila.inicio_real) return 0;
  return Math.max(0, Math.round((Date.parse(fila.inicio_real) - Date.parse(s.inicio)) / MIN));
}

// ── Base de datos ────────────────────────────────────────────────────────────

export interface ContextoClases { studioId: string; instructorId: string; userId: string }

type Nombre = { nombre: string } | { nombre: string }[] | null;
interface FilaSesion { id: string; inicio: string; fin: string; cancelada: boolean | null; tipos_clase: Nombre }

function aSesion(f: FilaSesion): SesionClase {
  const t = Array.isArray(f.tipos_clase) ? f.tipos_clase[0] : f.tipos_clase;
  return { id: f.id, inicio: f.inicio, fin: f.fin, cancelada: f.cancelada === true, nombre: t?.nombre ?? 'Clase' };
}

export async function relacionDe(admin: SupabaseClient, studioId: string, instructorId: string): Promise<Relacion> {
  const { data, error } = await admin.from('instructor_tarifas').select('relacion_laboral')
    .eq('instructor_id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (error) throw error;
  const r = (data as { relacion_laboral?: string | null } | null)?.relacion_laboral;
  return r === 'CONTRATADA' || r === 'AUTONOMA' ? r : null;
}

async function suSesion(admin: SupabaseClient, c: ContextoClases, sesionId: string): Promise<SesionClase | null> {
  const { data, error } = await admin.from('sesiones').select('id, inicio, fin, cancelada, tipos_clase(nombre)')
    .eq('id', sesionId).eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).maybeSingle();
  if (error) throw error;
  return data ? aSesion(data as unknown as FilaSesion) : null;
}

async function filasDe(admin: SupabaseClient, c: ContextoClases, sesionIds: string[]): Promise<Map<string, FilaClase>> {
  if (sesionIds.length === 0) return new Map();
  const { data, error } = await admin.from('clases_impartidas')
    .select('sesion_id, estado, inicio_real, fin_real, origen')
    .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).in('sesion_id', sesionIds);
  if (error) throw error;
  return new Map(((data ?? []) as FilaClase[]).map((f) => [f.sesion_id, f]));
}

async function auditar(admin: SupabaseClient, c: ContextoClases, sesionId: string, accion: string, extra: {
  campo?: string | null; antes?: string | null; despues?: string | null; motivo?: string | null;
} = {}): Promise<boolean> {
  const { error } = await admin.from('clases_impartidas_auditoria').insert({
    id: uid(), studio_id: c.studioId, sesion_id: sesionId, accion,
    campo: extra.campo ?? null, valor_antes: extra.antes ?? null, valor_despues: extra.despues ?? null,
    motivo: extra.motivo ?? null, created_by: c.userId,
  });
  return !error;
}

export interface ClaseActual {
  id: string; nombre: string; inicio: string; fin: string;
  estado: 'EMPEZABLE' | 'EN_CURSO';
  inicioReal: string | null;
  /** «Terminé antes» ya puesto: la hora a la que acaba de verdad. */
  finReal: string | null;
}
/** Clase de hoy que ella terminó antes de su hora, mientras su horario sigue abierto. */
export interface ClaseTerminadaAntes { id: string; inicioReal: string; finReal: string }
export interface ClasePendiente { id: string; nombre: string; inicio: string; fin: string }
export interface EstadoClases {
  relacion: Relacion; actual: ClaseActual | null; pendientes: ClasePendiente[];
  terminadaAntes: ClaseTerminadaAntes | null;
}

export async function estadoClasesInstructora(admin: SupabaseClient, c: ContextoClases, ahora = new Date()): Promise<EstadoClases> {
  const desdeMs = Math.max(ahora.getTime() - DIAS_PARA_CONFIRMAR * 24 * 60 * MIN, Date.parse(CONFIRMAR_CLASES_DESDE) - 12 * 60 * MIN);
  const desde = new Date(desdeMs).toISOString();
  const hasta = new Date(ahora.getTime() + (MIN_ANTES_EMPEZAR + 1) * MIN).toISOString();

  const [relacion, sesionesQ] = await Promise.all([
    relacionDe(admin, c.studioId, c.instructorId),
    admin.from('sesiones').select('id, inicio, fin, cancelada, tipos_clase(nombre)')
      .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).neq('cancelada', true)
      .gte('inicio', desde).lte('inicio', hasta).order('inicio', { ascending: true }),
  ]);
  if (sesionesQ.error) throw sesionesQ.error;
  const sesiones = ((sesionesQ.data ?? []) as unknown as FilaSesion[]).map(aSesion);

  const [filas, jornadas] = await Promise.all([
    filasDe(admin, c, sesiones.map((s) => s.id)),
    relacion === 'AUTONOMA'
      ? Promise.resolve([] as Tramo[])
      : admin.from('instructor_work_sessions').select('check_in_at, check_out_at')
        .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).gte('check_in_at', new Date(desdeMs - 24 * 60 * MIN).toISOString())
        .then(({ data, error }) => {
          if (error) throw error;
          return ((data ?? []) as { check_in_at: string; check_out_at: string | null }[]).map((j) => ({ desde: j.check_in_at, hasta: j.check_out_at }));
        }),
  ]);

  let actual: ClaseActual | null = null;
  let terminadaAntes: ClaseTerminadaAntes | null = null;
  const pendientes: ClasePendiente[] = [];
  for (const s of sesiones) {
    const fila = filas.get(s.id) ?? null;
    const { estado } = estadoDeClase(s, fila, jornadas, relacion, ahora);
    if (estado === 'SIN_CONFIRMAR') pendientes.push({ id: s.id, nombre: s.nombre, inicio: s.inicio, fin: s.fin });
    // En curso gana siempre; si no hay ninguna, la primera que ya se puede empezar.
    if (estado === 'EN_CURSO' || (estado === 'EMPEZABLE' && !actual)) {
      actual = {
        id: s.id, nombre: s.nombre, inicio: s.inicio, fin: s.fin, estado,
        inicioReal: fila?.inicio_real ?? null, finReal: fila?.fin_real ?? null,
      };
    }
    if (estado === 'DADA' && fila?.inicio_real && fila.fin_real && ahora.getTime() < Date.parse(s.fin)) {
      terminadaAntes = { id: s.id, inicioReal: fila.inicio_real, finReal: fila.fin_real };
    }
  }
  return { relacion, actual, pendientes, terminadaAntes };
}

export type ResultadoEmpezar =
  | { ok: true; yaEmpezada: boolean; jornadaAbierta: boolean }
  | { ok: false; status: 404 | 409; error: string };

export async function empezarClase(
  admin: SupabaseClient, c: ContextoClases, sesionId: string, ahora = new Date(),
): Promise<ResultadoEmpezar> {
  const s = await suSesion(admin, c, sesionId);
  if (!s) return { ok: false, status: 404, error: 'No encontramos esta clase.' };
  if (s.cancelada) return { ok: false, status: 409, error: 'Esta clase está cancelada.' };
  const t = ahora.getTime();
  if (t < Date.parse(s.inicio) - MIN_ANTES_EMPEZAR * MIN) {
    return { ok: false, status: 409, error: `Podrás empezarla ${MIN_ANTES_EMPEZAR} minutos antes de la hora.` };
  }
  if (t > Date.parse(s.fin)) return { ok: false, status: 409, error: 'Esta clase ya ha terminado: confírmala desde Hoy.' };

  const existente = (await filasDe(admin, c, [s.id])).get(s.id);
  if (existente?.estado === 'NO_DADA') return { ok: false, status: 409, error: 'Dijiste que esta clase no la dabas. Si sí la das, avisa al estudio.' };
  if (existente) return { ok: true, yaEmpezada: true, jornadaAbierta: false };

  // Empezar una clase cierra la que siguiera en curso (clases seguidas).
  const { data: abiertas, error: eAb } = await admin.from('clases_impartidas').select('sesion_id, inicio_real')
    .eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).eq('estado', 'DADA').is('fin_real', null)
    .gte('inicio_real', new Date(t - 12 * 60 * MIN).toISOString());
  if (eAb) throw eAb;
  for (const a of (abiertas ?? []) as { sesion_id: string; inicio_real: string }[]) {
    const previa = await suSesion(admin, c, a.sesion_id);
    if (previa && Date.parse(previa.fin) > t && Date.parse(a.inicio_real) < t) {
      await admin.from('clases_impartidas').update({ fin_real: ahora.toISOString(), edited_at: ahora.toISOString(), edited_by: c.userId })
        .eq('sesion_id', a.sesion_id).eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).is('fin_real', null);
      await auditar(admin, c, a.sesion_id, 'FIN_CAMBIADO', { campo: 'fin_real', antes: previa.fin, despues: ahora.toISOString(), motivo: 'Empezó otra clase' });
    }
  }

  const inicioReal = new Date(Math.max(t, Date.parse(s.inicio))).toISOString();
  const { error } = await admin.from('clases_impartidas').insert({
    sesion_id: s.id, studio_id: c.studioId, instructor_id: c.instructorId,
    estado: 'DADA', inicio_real: inicioReal, origen: 'BOTON', created_by: c.userId,
  });
  if (error) {
    if (error.code === '23505') return { ok: true, yaEmpezada: true, jornadaAbierta: false };
    throw error;
  }
  await auditar(admin, c, s.id, 'EMPEZADA', { campo: 'inicio_real', despues: inicioReal });

  let jornadaAbierta = false;
  if (await relacionDe(admin, c.studioId, c.instructorId) === 'CONTRATADA') {
    const r = await registrarEntrada(admin, c, ahora);
    jornadaAbierta = r.ok && !r.yaAbierta;
  }
  return { ok: true, yaEmpezada: false, jornadaAbierta };
}

export type ResultadoSimple = { ok: true } | { ok: false; status: 400 | 404 | 409; error: string };

export async function cambiarFinClase(
  admin: SupabaseClient, c: ContextoClases, sesionId: string, fin: Date, ahora = new Date(),
): Promise<ResultadoSimple> {
  if (Number.isNaN(fin.getTime())) return { ok: false, status: 400, error: 'Hora no válida' };
  const s = await suSesion(admin, c, sesionId);
  if (!s) return { ok: false, status: 404, error: 'No encontramos esta clase.' };
  const fila = (await filasDe(admin, c, [s.id])).get(s.id);
  if (!fila || fila.estado !== 'DADA' || !fila.inicio_real) return { ok: false, status: 409, error: 'Esta clase no está empezada.' };
  if (ahora.getTime() >= Date.parse(finEfectivo(s, fila))) return { ok: false, status: 409, error: 'Esta clase ya ha terminado.' };
  // La hora llega en minutos («14:18») y el inicio real lleva segundos (14:18:10):
  // terminar en el mismo minuto en que empezó es «nada más empezar», no un error
  // que ella no puede corregir escribiendo mejor.
  const inicioReal = Date.parse(fila.inicio_real);
  if (fin.getTime() <= inicioReal) {
    if (fin.getTime() < Math.floor(inicioReal / MIN) * MIN) {
      return { ok: false, status: 400, error: `La empezaste a las ${horaEstudio(fila.inicio_real)}: pon una hora de fin posterior.` };
    }
    fin = new Date(inicioReal + 1000);
  }
  if (fin.getTime() > ahora.getTime() + 5 * MIN) return { ok: false, status: 400, error: 'Esa hora aún no ha llegado.' };

  const antes = finEfectivo(s, fila);
  const { data, error } = await admin.from('clases_impartidas')
    .update({ fin_real: fin.toISOString(), edited_at: ahora.toISOString(), edited_by: c.userId })
    .eq('sesion_id', s.id).eq('studio_id', c.studioId).eq('instructor_id', c.instructorId).eq('estado', 'DADA')
    .select('sesion_id');
  if (error) throw error;
  if (!data?.length) return { ok: false, status: 409, error: 'Esta clase no está empezada.' };
  await auditar(admin, c, s.id, 'FIN_CAMBIADO', { campo: 'fin_real', antes, despues: fin.toISOString() });
  return { ok: true };
}

export type ModoConfirmar = 'A_SU_HORA' | 'OTRO_HORARIO' | 'NO_DADA';
export interface ItemConfirmar { sesionId: string; modo: ModoConfirmar; inicio?: Date; fin?: Date }
export const MAX_CONFIRMAR = 20;

export async function confirmarClases(
  admin: SupabaseClient, c: ContextoClases, items: readonly ItemConfirmar[], ahora = new Date(),
): Promise<{ ok: true; confirmadas: number; errores: { sesionId: string; error: string }[] } | { ok: false; status: 400; error: string }> {
  if (items.length === 0 || items.length > MAX_CONFIRMAR) return { ok: false, status: 400, error: 'Petición no válida' };
  const errores: { sesionId: string; error: string }[] = [];
  let confirmadas = 0;
  const desde = Math.max(Date.parse(CONFIRMAR_CLASES_DESDE), ahora.getTime() - DIAS_PARA_CONFIRMAR * 24 * 60 * MIN);

  for (const it of items) {
    const s = await suSesion(admin, c, it.sesionId);
    if (!s) { errores.push({ sesionId: it.sesionId, error: 'No encontramos esta clase.' }); continue; }
    if (s.cancelada) { errores.push({ sesionId: s.id, error: 'Esta clase está cancelada.' }); continue; }
    if (Date.parse(s.fin) > ahora.getTime()) { errores.push({ sesionId: s.id, error: 'Esta clase aún no ha terminado.' }); continue; }
    if (Date.parse(s.inicio) < desde) { errores.push({ sesionId: s.id, error: 'Esta clase ya no se confirma desde la app: díselo al estudio.' }); continue; }

    let fila: Record<string, unknown>;
    if (it.modo === 'NO_DADA') {
      fila = { estado: 'NO_DADA', inicio_real: null, fin_real: null };
    } else if (it.modo === 'A_SU_HORA') {
      fila = { estado: 'DADA', inicio_real: s.inicio, fin_real: null };
    } else {
      const ini = it.inicio?.getTime();
      const fin = it.fin?.getTime();
      const margen = HORAS_MARGEN_OTRO_HORARIO * 60 * MIN;
      if (!ini || !fin || Number.isNaN(ini) || Number.isNaN(fin) || fin <= ini) {
        errores.push({ sesionId: s.id, error: 'Revisa el horario: el fin tiene que ser posterior al inicio.' }); continue;
      }
      if (ini < Date.parse(s.inicio) - margen || fin > Date.parse(s.fin) + margen || fin > ahora.getTime() + 5 * MIN) {
        errores.push({ sesionId: s.id, error: 'Ese horario está demasiado lejos del de la clase.' }); continue;
      }
      fila = { estado: 'DADA', inicio_real: new Date(ini).toISOString(), fin_real: new Date(fin).toISOString() };
    }

    const { error } = await admin.from('clases_impartidas').insert({
      sesion_id: s.id, studio_id: c.studioId, instructor_id: c.instructorId, origen: 'CONFIRMACION', created_by: c.userId, ...fila,
    });
    if (error) {
      if (error.code === '23505') { confirmadas++; continue; } // ya estaba: el resultado es el mismo
      throw error;
    }
    confirmadas++;
    await auditar(admin, c, s.id, it.modo === 'NO_DADA' ? 'NO_DADA' : 'CONFIRMADA', {
      campo: it.modo === 'OTRO_HORARIO' ? 'horario' : null,
      despues: it.modo === 'OTRO_HORARIO' ? `${fila.inicio_real} → ${fila.fin_real}` : null,
    });
  }
  return { ok: true, confirmadas, errores };
}

/** Pasar lista da la clase por dada, a su hora. Idempotente; nunca pisa lo que ya hubiera. */
export async function marcarDadaPorLista(
  admin: SupabaseClient, c: ContextoClases, sesion: { id: string; inicio: string },
): Promise<void> {
  const { error } = await admin.from('clases_impartidas').insert({
    sesion_id: sesion.id, studio_id: c.studioId, instructor_id: c.instructorId,
    estado: 'DADA', inicio_real: sesion.inicio, origen: 'LISTA', created_by: c.userId,
  });
  if (error) {
    if (error.code === '23505') return;
    throw error;
  }
  await auditar(admin, c, sesion.id, 'DADA_POR_LISTA');
}
