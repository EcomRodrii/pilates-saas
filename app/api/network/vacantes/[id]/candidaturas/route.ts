import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaACandidatura, type FilaRedCandidatura } from '@/lib/network/mapeo';

// Candidaturas de UNA vacante — solo staff del estudio dueño. Se verifica
// vacante.studio_id === sesion.studioId ANTES de leer nada: el riesgo más
// fácil de colar aquí es que un manager de otro estudio, con un vacanteId
// ajeno, viera la lista de candidatas de un competidor (fuga de datos de
// reclutamiento, no genérica).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: vacante } = await admin.from('red_vacantes').select('id, studio_id').eq('id', id).maybeSingle();
  if (!vacante || vacante.studio_id !== sesion.studioId) {
    return NextResponse.json({ error: 'Vacante no encontrada.' }, { status: 404 });
  }

  const { data, error } = await admin
    .from('red_candidaturas')
    .select('id, vacante_id, perfil_id, mensaje, notas_estudio, estado, solicitud_id, creado_en, actualizado_en, resuelto_en, red_perfiles ( nombre, foto_url )')
    .eq('vacante_id', id)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:vacantes:candidaturas:GET', error, 'No se han podido cargar las candidaturas.');

  type Fila = FilaRedCandidatura & { red_perfiles: { nombre: string | null; foto_url: string | null } | null };
  const candidaturas = ((data ?? []) as unknown as Fila[]).map(f =>
    mapFilaACandidatura(f, { perfilNombre: f.red_perfiles?.nombre ?? null, perfilFotoUrl: f.red_perfiles?.foto_url ?? null }),
  );

  return NextResponse.json({ candidaturas });
}
