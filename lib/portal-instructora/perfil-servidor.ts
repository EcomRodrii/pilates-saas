import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import type { EstudioDeInstructora, PerfilInstructora } from '@/lib/student/perfil-instructora';

// Lo que enseña el Perfil de la instructora en la app del estudio, además de lo
// que ya trae la sesión: sus estudios y su tarifa. SOLO lectura.
//
// Estudios: las sedes donde es INSTRUCTORA activa con esta misma cuenta (P2-14:
// una fila de `instructores` por sede). No se usa `mis_estudios()` porque exige
// `auth.uid()`, que con service-role es nulo; la consulta se acota a mano al
// `auth_user_id` del token. Solo nombre y slug de cada estudio: `studios` tiene
// columnas sensibles y aquí no sale ninguna.
//
// Tarifa: SOLO la suya en ESTE estudio (`instructor_tarifas`, tabla aparte de
// `instructores` a propósito, #562). La fija el estudio; ella nunca la escribe.

export async function perfilDeInstructora(p: {
  userId: string; studioId: string; instructorId: string;
}): Promise<PerfilInstructora> {
  const admin = getSupabaseAdmin();
  if (!admin) throw new Error('Service role no configurada');

  const [fichas, tarifas] = await Promise.all([
    admin.from('instructores').select('studio_id')
      .eq('auth_user_id', p.userId).eq('rol', 'INSTRUCTOR').neq('activo', false),
    admin.from('instructor_tarifas').select('tarifa_hora, base_mensual_eur')
      .eq('studio_id', p.studioId).eq('instructor_id', p.instructorId).limit(1),
  ]);
  if (fichas.error) throw fichas.error;
  if (tarifas.error) throw tarifas.error;

  const ids = [...new Set(((fichas.data ?? []) as Array<{ studio_id: string }>).map((f) => f.studio_id))];
  let estudios: EstudioDeInstructora[] = [];
  if (ids.length) {
    const { data, error } = await admin.from('studios').select('id, nombre, slug').in('id', ids);
    if (error) throw error;
    estudios = ((data ?? []) as Array<{ id: string; nombre: string | null; slug: string | null }>)
      .filter((s): s is { id: string; nombre: string | null; slug: string } => Boolean(s.slug))
      .map((s) => ({ nombre: s.nombre || 'Estudio', slug: s.slug, actual: s.id === p.studioId }))
      .sort((a, b) => (a.actual === b.actual ? a.nombre.localeCompare(b.nombre, 'es') : a.actual ? -1 : 1));
  }

  const fila = ((tarifas.data ?? []) as Array<{ tarifa_hora: number | null; base_mensual_eur: number | null }>)[0];
  const tarifaHora = fila?.tarifa_hora == null ? null : Number(fila.tarifa_hora);
  const baseMensualEur = fila?.base_mensual_eur == null ? null : Number(fila.base_mensual_eur);

  return {
    estudios,
    tarifa: tarifaHora == null && baseMensualEur == null ? null : { tarifaHora, baseMensualEur },
  };
}
