import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { checkinPublico } from '@/lib/db/supabase-data-admin';
import {
  estadoEnLista, fechaEnZona, horaEnZona, nombresParaLista, ordenarLista, puedePasarLista,
  type AlumnaEnLista, type EstadoEnLista, type ListaDeClase,
} from '@/lib/student/agenda-instructora';

// Pasar lista desde la app del estudio: la instructora ve quién tiene plaza en
// SU clase y marca quién ha venido.
//
// ⚠️ Solo «Asistió» (decisión del 14-sep-2026). `NO_ASISTIO` dispara
// `trg_penalizacion_no_show`, que abre una penalización de dinero a la alumna:
// eso lo decide el estudio desde el panel. Aquí no hay ningún camino que escriba
// ese estado, ni para marcarlo ni para deshacerlo.
//
// Marcar reutiliza `checkinPublico`, el mismo check-in del pase y del kiosko:
// ASISTIDA + créditos de asistencia + premio de referido + logros y racha, en
// servidor. Deshacer hace lo mismo que el panel (`deshacerCheckin`): vuelve a
// CONFIRMADA y NO retira créditos; el dedup por reserva evita el doble crédito
// si se vuelve a marcar.
//
// Service-role (la app no lee por RLS): la clase se busca SIEMPRE con
// `studio_id` + `instructor_id` del token, y la reserva, dentro de esa clase.
// De la alumna sale lo mínimo (RGPD): nombre e inicial del apellido.

interface FilaClase { id: string; inicio: string; fin: string; cancelada: boolean | null; tipo_clase_id: string | null }
interface Socia { nombre: string | null; apellidos: string | null }
interface FilaReserva { id: string; estado: string; socios: Socia | Socia[] | null }

type Admin = NonNullable<ReturnType<typeof getSupabaseAdmin>>;
type ClaseDeInstructora = { studioId: string; instructorId: string; sesionId: string };

const NO_VINO = 'El estudio la ha marcado como que no vino. Si sí ha venido, díselo al estudio.';

function adminOLanza(): Admin {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');
  return admin;
}

async function suClase(admin: Admin, p: ClaseDeInstructora): Promise<FilaClase | null> {
  const { data, error } = await admin.from('sesiones').select('id, inicio, fin, cancelada, tipo_clase_id')
    .eq('id', p.sesionId).eq('studio_id', p.studioId).eq('instructor_id', p.instructorId).maybeSingle();
  if (error) throw error;
  return (data as FilaClase | null) ?? null;
}

/** La lista de una clase suya, o `null` si la clase no existe o no es suya (sin decir cuál). */
export async function listaDeClase(p: ClaseDeInstructora): Promise<ListaDeClase | null> {
  const admin = adminOLanza();
  const clase = await suClase(admin, p);
  if (!clase) return null;

  const [tipo, filas] = await Promise.all([
    (async () => {
      if (!clase.tipo_clase_id) return 'Clase';
      const { data, error } = await admin.from('tipos_clase').select('nombre')
        .eq('id', clase.tipo_clase_id).eq('studio_id', p.studioId).maybeSingle();
      if (error) throw error;
      return (data?.nombre as string | undefined) || 'Clase';
    })(),
    (async () => {
      const { data, error } = await admin.from('reservas').select('id, estado, socios!inner(nombre, apellidos)')
        .eq('studio_id', p.studioId).eq('sesion_id', clase.id)
        .in('estado', ['CONFIRMADA', 'ASISTIDA', 'NO_ASISTIO']);
      if (error) throw error;
      return (data ?? []) as unknown as FilaReserva[];
    })(),
  ]);

  const enLista = filas.flatMap((f) => {
    const estado = estadoEnLista(f.estado);
    if (!estado) return [];
    const socia = Array.isArray(f.socios) ? f.socios[0] : f.socios;
    return [{ reservaId: f.id, estado, persona: { nombre: socia?.nombre ?? null, apellidos: socia?.apellidos ?? null } }];
  });
  const nombres = nombresParaLista(enLista.map((f) => f.persona));
  const alumnas: AlumnaEnLista[] = ordenarLista(
    enLista.map((f, i) => ({ reservaId: f.reservaId, nombre: nombres[i], estado: f.estado })),
  );

  return {
    clase: {
      id: clase.id,
      tipo,
      inicio: clase.inicio,
      fin: clase.fin,
      fecha: fechaEnZona(clase.inicio),
      hora: horaEnZona(clase.inicio),
      horaFin: horaEnZona(clase.fin),
      cancelada: clase.cancelada === true,
    },
    alumnas,
  };
}

export type ResultadoMarcar =
  | { ok: true; estado: EstadoEnLista }
  | { ok: false; status: 404 | 409; error: string };

/** Marca «Asistió» o lo deshace. Solo eso: nunca escribe `NO_ASISTIO`. */
export async function marcarAsistencia(
  p: ClaseDeInstructora & { reservaId: string; accion: 'asistio' | 'deshacer' },
  ahoraMs: number = Date.now(),
): Promise<ResultadoMarcar> {
  const admin = adminOLanza();
  const clase = await suClase(admin, p);
  // Una clase ajena responde igual que una que no existe.
  if (!clase) return { ok: false, status: 404, error: 'No encontramos esta clase.' };
  const cancelada = clase.cancelada === true;
  if (!puedePasarLista({ inicio: clase.inicio, fin: clase.fin, cancelada }, ahoraMs)) {
    return { ok: false, status: 409, error: cancelada ? 'Esta clase está cancelada.' : 'La lista de esta clase no está abierta ahora.' };
  }

  const { data: reserva, error } = await admin.from('reservas').select('id, estado')
    .eq('id', p.reservaId).eq('studio_id', p.studioId).eq('sesion_id', clase.id).maybeSingle();
  if (error) throw error;
  if (!reserva) return { ok: false, status: 404, error: 'Esta reserva ya no está en la clase.' };
  const actual = reserva.estado as string;

  if (p.accion === 'asistio') {
    // Idempotente: un doble toque no es un error.
    if (actual === 'ASISTIDA') return { ok: true, estado: 'asistio' };
    if (actual !== 'CONFIRMADA') {
      return { ok: false, status: 409, error: actual === 'NO_ASISTIO' ? NO_VINO : 'Esta reserva ya no está confirmada.' };
    }
    const r = await checkinPublico({ studioId: p.studioId, reservaId: p.reservaId });
    if ('error' in r) return { ok: false, status: 409, error: r.error ?? 'No se ha podido marcar la asistencia.' };
    return { ok: true, estado: 'asistio' };
  }

  if (actual === 'CONFIRMADA') return { ok: true, estado: 'por-marcar' };
  if (actual !== 'ASISTIDA') {
    return { ok: false, status: 409, error: actual === 'NO_ASISTIO' ? NO_VINO : 'Esta reserva ya no está en la clase.' };
  }
  // Compare-and-set: solo si sigue ASISTIDA. Si alguien la cambió a la vez
  // (el estudio desde el panel), no se pisa.
  const { data: cambiadas, error: eUpd } = await admin.from('reservas')
    .update({ estado: 'CONFIRMADA', check_in_en: null })
    .eq('id', p.reservaId).eq('studio_id', p.studioId).eq('estado', 'ASISTIDA')
    .select('id');
  if (eUpd) throw eUpd;
  if (!cambiadas?.length) return { ok: false, status: 409, error: 'La lista ha cambiado mientras tanto. Vuelve a cargarla.' };
  return { ok: true, estado: 'por-marcar' };
}
