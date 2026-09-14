import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { ultimaRespuestaDe, type ContactoFila } from '@/lib/sustituciones/traza';
import { fechaEnZona, horaEnZona, type OfertaSustitucion } from '@/lib/student/agenda-instructora';

// Las clases que el motor le está pidiendo cubrir a una instructora, para la
// tarjeta «Te piden cubrir esta clase» de la app. SOLO lectura.
//
// Mismo criterio que decide si su respuesta vale (`responderSustitucion` con
// `via: 'app'`): la sustitución sigue en `contactando`, ella es la candidata
// actual del ranking, no ha contestado ya y la clase no ha empezado. Enseñar una
// oferta que luego no se puede aceptar sería prometer algo que el servidor va a
// negar.
//
// ⚠️ Service-role (la app no lee por RLS): todo acotado a `studio_id` +
// `instructor_id` del token. El ranking lleva nombres de compañeras y NO sale de
// aquí; tampoco quién pidió la baja.

interface FilaSesion {
  inicio: string; fin: string; cancelada: boolean | null; tipo_clase_id: string | null; sala_id: string | null;
}
interface FilaSustitucion {
  id: string; sesion_id: string; candidata_actual: number | null; ranking: unknown;
  sesiones: FilaSesion | FilaSesion[] | null;
}

export async function ofertasDeInstructora(
  p: { studioId: string; instructorId: string },
  ahoraMs: number = Date.now(),
): Promise<OfertaSustitucion[]> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const { data, error } = await admin.from('sustituciones')
    .select('id, sesion_id, candidata_actual, ranking, sesiones(inicio, fin, cancelada, tipo_clase_id, sala_id)')
    .eq('studio_id', p.studioId).eq('estado', 'contactando')
    .limit(100);
  if (error) throw error;

  // La candidata actual, con el mismo criterio que `escalacionVigente`.
  const vigentes = ((data ?? []) as unknown as FilaSustitucion[]).flatMap((s) => {
    const ses = Array.isArray(s.sesiones) ? s.sesiones[0] ?? null : s.sesiones;
    const ranking = (Array.isArray(s.ranking) ? s.ranking : []) as Array<{ instructor_id?: string }>;
    const actual = ranking[typeof s.candidata_actual === 'number' ? s.candidata_actual : 0];
    if (actual?.instructor_id !== p.instructorId || !ses || ses.cancelada === true) return [];
    if (Date.parse(ses.inicio) <= ahoraMs) return [];
    return [{ s, ses }];
  });
  if (!vigentes.length) return [];

  const { data: contactos, error: eCont } = await admin.from('sustitucion_contactos')
    .select('sustitucion_id, instructor_id, canal, estado, enviado_en, respondido_en')
    .eq('studio_id', p.studioId).eq('instructor_id', p.instructorId)
    .in('sustitucion_id', vigentes.map(({ s }) => s.id));
  if (eCont) throw eCont;
  const contactosDe = new Map<string, ContactoFila[]>();
  for (const c of (contactos ?? []) as Array<ContactoFila & { sustitucion_id: string }>) {
    contactosDe.set(c.sustitucion_id, [...(contactosDe.get(c.sustitucion_id) ?? []), c]);
  }
  const sinContestar = vigentes.filter(({ s }) => !ultimaRespuestaDe(contactosDe.get(s.id) ?? []));
  if (!sinContestar.length) return [];

  const tipoIds = [...new Set(sinContestar.map(({ ses }) => ses.tipo_clase_id).filter((x): x is string => !!x))];
  const salaIds = [...new Set(sinContestar.map(({ ses }) => ses.sala_id).filter((x): x is string => !!x))];
  const vacio = Promise.resolve({ data: [] as unknown[], error: null });
  const [tipos, salas] = await Promise.all([
    tipoIds.length ? admin.from('tipos_clase').select('id, nombre').eq('studio_id', p.studioId).in('id', tipoIds) : vacio,
    salaIds.length ? admin.from('salas').select('id, nombre').eq('studio_id', p.studioId).in('id', salaIds) : vacio,
  ]);
  for (const r of [tipos, salas]) if (r.error) throw r.error;
  const nombreTipo = new Map(((tipos.data ?? []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre]));
  const nombreSala = new Map(((salas.data ?? []) as Array<{ id: string; nombre: string }>).map((t) => [t.id, t.nombre]));

  return sinContestar
    .map(({ s, ses }) => ({
      sustitucionId: s.id,
      sesionId: s.sesion_id,
      inicio: ses.inicio,
      fin: ses.fin,
      fecha: fechaEnZona(ses.inicio),
      hora: horaEnZona(ses.inicio),
      horaFin: horaEnZona(ses.fin),
      tipo: (ses.tipo_clase_id && nombreTipo.get(ses.tipo_clase_id)) || 'Clase',
      sala: (ses.sala_id && nombreSala.get(ses.sala_id)) || null,
    }))
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
}
