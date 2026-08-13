import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaAPerfilPublico, mapFilaAExperienciaPublica, type FilaRedPerfilPublica, type FilaRedExperiencia } from '@/lib/network/mapeo';
import {
  emailVerificado, experienciaVerificada, referenciaProfesional, identidadVerificada, activaRecientemente,
} from '@/lib/network/badges';

// Detalle público de un perfil de Network — visto por un estudio desde los
// resultados del buscador (Fase 4). Mismo criterio de columnas que
// /api/network/buscar: nunca se piden email_contacto/telefono_contacto/
// auth_user_id. Solo perfiles `published` — uno oculto/borrador/suspendido
// da 404, no un 403 que confirmaría que existe.
const SELECT_COLUMNAS_PUBLICAS = `
  id, nombre, foto_url, ciudad, zona, radio_km, descripcion,
  especialidades, anios_experiencia, tarifa_rango, disponibilidad_estado,
  disponibilidad_horarios, tipo_trabajo, estado, identidad_verificada_en,
  creado_en, actualizado_en, ultimo_acceso_en
`;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data, error } = await admin
    .from('red_perfiles')
    .select(SELECT_COLUMNAS_PUBLICAS)
    .eq('id', id)
    .eq('estado', 'published')
    .maybeSingle();
  if (error) return errorInterno('network:perfil:detalle', error, 'No se ha podido cargar este perfil.');
  if (!data) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 404 });

  // Experiencia laboral (Fase 6): pública en la misma medida que el resto
  // del perfil — el perfil padre ya se comprobó `published` arriba, y la
  // RLS de `red_experiencias` (Fase 1) usa exactamente ese mismo criterio.
  const { data: experienciasData, error: errExp } = await admin
    .from('red_experiencias')
    .select('id, studio_id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion, estado_verificacion, creado_en')
    .eq('perfil_id', id)
    .order('fecha_inicio', { ascending: false });
  if (errExp) return errorInterno('network:perfil:detalle:experiencias', errExp, 'No se ha podido cargar este perfil.');

  const experiencias = ((experienciasData ?? []) as unknown as Omit<FilaRedExperiencia, 'perfil_id'>[]).map(mapFilaAExperienciaPublica);

  // Badges (Fase 8) — docs/NETWORK-IMPLEMENTATION-PLAN.md. `auth_user_id` se
  // pide APARTE (nunca en SELECT_COLUMNAS_PUBLICAS, que nunca lo devuelve al
  // cliente) solo para resolver si el email de la cuenta está confirmado.
  // Un único perfil, un único lookup — no es el N+1 que sería hacerlo por
  // cada tarjeta de un listado, por eso el buscador (Fase 4) no lo trae.
  const [{ data: filaAuth }, { count: referenciasConfirmadas }] = await Promise.all([
    admin.from('red_perfiles').select('auth_user_id').eq('id', id).maybeSingle(),
    admin.from('red_referencias').select('id', { count: 'exact', head: true }).eq('perfil_id', id).eq('estado', 'confirmada'),
  ]);
  const { data: userData } = filaAuth?.auth_user_id
    ? await admin.auth.admin.getUserById(filaAuth.auth_user_id as string)
    : { data: { user: null } };

  const tieneExperienciaVerificada = experienciaVerificada(experiencias.map(e => e.estadoVerificacion));
  const badges = {
    emailVerificado: emailVerificado(userData.user?.email_confirmed_at ?? null),
    experienciaVerificada: tieneExperienciaVerificada,
    referenciaProfesional: referenciaProfesional(referenciasConfirmadas ?? 0),
    identidadVerificada: identidadVerificada((data as unknown as FilaRedPerfilPublica).identidad_verificada_en),
    activaRecientemente: activaRecientemente((data as unknown as FilaRedPerfilPublica).ultimo_acceso_en, new Date()),
  };

  return NextResponse.json({
    perfil: mapFilaAPerfilPublico(data as unknown as FilaRedPerfilPublica, tieneExperienciaVerificada),
    experiencias,
    badges,
  });
}
