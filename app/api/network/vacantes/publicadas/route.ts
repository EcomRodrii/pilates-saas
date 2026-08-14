import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaAVacante, type FilaRedVacante } from '@/lib/network/mapeo';
import { esEspecialidadValida, esTipoTrabajoValido } from '@/lib/network/catalogo';

// Marketplace de oportunidades (Fase 2, "instructora → busca oportunidades")
// — vacantes 'published' de cualquier estudio. Requiere sesión (mismo
// criterio que red_vacantes_select en RLS: visible a `authenticated`, nunca
// a `anon` — sin SEO en esta ronda, coherente con red_perfiles).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const especialidad = req.nextUrl.searchParams.get('especialidad');
  const tipoTrabajo = req.nextUrl.searchParams.get('tipoTrabajo');
  const ciudad = req.nextUrl.searchParams.get('ciudad');

  // `studios!inner`: cada vacante tiene studio_id NOT NULL, así que el join
  // interno no descarta filas — pero PostgREST solo permite filtrar sobre
  // columnas de un recurso embebido (`studios.ciudad`) cuando el join es
  // inner, de ahí el `!inner` aunque el resultado sería el mismo con left.
  let query = admin
    .from('red_vacantes')
    .select('id, studio_id, titulo, especialidades, horarios, tipo_trabajo, tarifa_rango, requisitos, descripcion, estado, creado_en, actualizado_en, cerrado_en, studios!inner ( nombre, ciudad )')
    .eq('estado', 'published')
    .order('creado_en', { ascending: false });

  if (especialidad && esEspecialidadValida(especialidad)) query = query.contains('especialidades', [especialidad]);
  if (tipoTrabajo && esTipoTrabajoValido(tipoTrabajo)) query = query.eq('tipo_trabajo', tipoTrabajo);
  if (ciudad) query = query.ilike('studios.ciudad', `%${ciudad}%`);

  const { data, error } = await query;
  if (error) return errorInterno('network:vacantes:publicadas:GET', error, 'No se han podido cargar las oportunidades.');

  type Fila = FilaRedVacante & { studios: { nombre: string | null; ciudad: string | null } | null };
  const vacantes = ((data ?? []) as unknown as Fila[]).map(f =>
    mapFilaAVacante(f, { estudioNombre: f.studios?.nombre ?? null, estudioCiudad: f.studios?.ciudad ?? null }),
  );

  return NextResponse.json({ vacantes });
}
