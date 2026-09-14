import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { instanteEnEstudio, uid } from '@/lib/utils';
import { aforoPorDefectoDeSesion } from '@/lib/aforo-logic';
import { fechaEnZona } from '@/lib/student/agenda-instructora';
import {
  MAX_DIAS_ANTELACION_NUEVA_CLASE, NO_PUEDE_CREAR, mensajeSolapeNuevaClase, type OpcionesNuevaClase,
} from '@/lib/student/nueva-clase';

// «Nueva clase» de la instructora desde la app del estudio.
//
// ⚠️ Service-role: la RLS de INSERT en `sesiones` (migr 20260914104856) NO actúa
// aquí, así que todo lo que ella exige se repite a mano, empezando por el ajuste
// del estudio. Olvidarlo sería saltarse la decisión del estudio desde la app.
//   - `studios.instructoras_crean_clases` encendido;
//   - a SU nombre (el `instructorId` sale del token, nunca del body);
//   - suelta y sin precio (`serie_id` y `precio_puntual` a null);
//   - tipo de clase y sala del MISMO estudio.
// Además, lo que el panel no comprobaba: que no sea en el pasado y que no cruce
// la medianoche (el panel la recortaba a las 23:59 sin avisar). La hora se
// calcula en la zona del estudio: el servidor va en UTC.
//
// Los choques de horario los decide la base de datos (exclusiones 0048 y 0074):
// no se reimplementan, se traducen.

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;

function adminOLanza(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  return admin;
}

async function estudioPermite(admin: Admin, studioId: string): Promise<boolean> {
  const { data, error } = await admin.from('studios').select('instructoras_crean_clases').eq('id', studioId).maybeSingle();
  if (error) throw error;
  return (data as { instructoras_crean_clases?: boolean } | null)?.instructoras_crean_clases === true;
}

/** Lo que puede elegir: los tipos de clase y las salas del estudio, si el estudio le deja crear. */
export async function opcionesNuevaClase(p: { studioId: string }): Promise<OpcionesNuevaClase> {
  const admin = adminOLanza();
  if (!(await estudioPermite(admin, p.studioId))) return { puedeCrear: false, tipos: [], salas: [] };

  const [tipos, salas] = await Promise.all([
    admin.from('tipos_clase').select('id, nombre, color, duracion_minutos, aforo_por_defecto')
      .eq('studio_id', p.studioId).order('nombre', { ascending: true }),
    admin.from('salas').select('id, nombre, capacidad')
      .eq('studio_id', p.studioId).order('nombre', { ascending: true }),
  ]);
  if (tipos.error) throw tipos.error;
  if (salas.error) throw salas.error;

  return {
    puedeCrear: true,
    tipos: ((tipos.data ?? []) as Array<{ id: string; nombre: string | null; color: string | null; duracion_minutos: number | null; aforo_por_defecto: number | null }>)
      .map((t) => ({
        id: t.id,
        nombre: t.nombre || 'Clase',
        color: t.color ?? null,
        duracionMin: Number(t.duracion_minutos) || 60,
        aforo: t.aforo_por_defecto ?? null,
      })),
    salas: ((salas.data ?? []) as Array<{ id: string; nombre: string | null; capacidad: number | null }>)
      .map((s) => ({ id: s.id, nombre: s.nombre || 'Sala', capacidad: s.capacidad ?? null })),
  };
}

export type ResultadoCrearClase =
  | { ok: true; sesionId: string; inicio: string }
  | { ok: false; status: 400 | 403 | 404 | 409; error: string };

export async function crearClasePropia(
  p: { studioId: string; instructorId: string; tipoClaseId: string; salaId: string; fecha: string; hora: string },
  ahoraMs: number = Date.now(),
): Promise<ResultadoCrearClase> {
  const admin = adminOLanza();
  if (!(await estudioPermite(admin, p.studioId))) return { ok: false, status: 403, error: NO_PUEDE_CREAR };

  const [{ data: tipo, error: eTipo }, { data: sala, error: eSala }] = await Promise.all([
    admin.from('tipos_clase').select('id, duracion_minutos, aforo_por_defecto')
      .eq('id', p.tipoClaseId).eq('studio_id', p.studioId).maybeSingle(),
    admin.from('salas').select('id, capacidad')
      .eq('id', p.salaId).eq('studio_id', p.studioId).maybeSingle(),
  ]);
  if (eTipo) throw eTipo;
  if (eSala) throw eSala;
  // De otro estudio responde igual que si no existiera.
  if (!tipo || !sala) return { ok: false, status: 404, error: 'Ese tipo de clase o esa sala ya no están en el estudio.' };

  const inicio = instanteEnEstudio(p.fecha, p.hora);
  if (!inicio) return { ok: false, status: 400, error: 'Elige un día y una hora que existan.' };
  const inicioMs = Date.parse(inicio);
  if (inicioMs <= ahoraMs) return { ok: false, status: 400, error: 'Esa hora ya ha pasado.' };
  if (inicioMs > ahoraMs + MAX_DIAS_ANTELACION_NUEVA_CLASE * 86_400_000) {
    return { ok: false, status: 400, error: `Como mucho puedes crearla con ${MAX_DIAS_ANTELACION_NUEVA_CLASE} días de antelación.` };
  }
  const fila = tipo as { id: string; duracion_minutos: number | null; aforo_por_defecto: number | null };
  const duracion = Number(fila.duracion_minutos) || 60;
  const fin = new Date(inicioMs + duracion * 60_000).toISOString();
  if (fechaEnZona(fin) !== p.fecha) {
    return { ok: false, status: 400, error: 'La clase terminaría pasada la medianoche: elige una hora antes.' };
  }

  const sesionId = `ses-${uid()}`;
  const { error } = await admin.from('sesiones').insert({
    id: sesionId,
    studio_id: p.studioId,
    tipo_clase_id: fila.id,
    sala_id: (sala as { id: string }).id,
    instructor_id: p.instructorId,
    inicio,
    fin,
    aforo_maximo: aforoPorDefectoDeSesion(fila.aforo_por_defecto, (sala as { capacidad: number | null }).capacidad),
    cancelada: false,
    notas: null,
    precio_puntual: null,
    serie_id: null,
  });
  if (error) {
    if (error.code === '23P01') return { ok: false, status: 409, error: mensajeSolapeNuevaClase(error.message) };
    throw error;
  }

  // El mismo aviso que manda el panel a la propietaria (in-app).
  const { emitirClaseCreadaPorInstructor } = await import('@/lib/notifications/emit');
  await emitirClaseCreadaPorInstructor(admin, { studioId: p.studioId, sesionId, instructorId: p.instructorId });

  return { ok: true, sesionId, inicio };
}

/** Si el estudio le deja crear clases (para enseñar o no el botón). */
export async function instructoraPuedeCrearClases(p: { studioId: string }): Promise<boolean> {
  return estudioPermite(adminOLanza(), p.studioId);
}
