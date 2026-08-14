import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarEquipo } from '@/lib/permisos-reglas';
import { mapFilaAVacante, type FilaRedVacante } from '@/lib/network/mapeo';

const SELECT_COLUMNAS = `
  id, studio_id, titulo, especialidades, horarios, tipo_trabajo, tarifa_rango,
  requisitos, descripcion, estado, creado_en, actualizado_en, cerrado_en
`;

// Publicar/cerrar una vacante — endpoint aparte de PATCH /[id] a propósito
// (mismo criterio que /api/network/perfil/estado): cambiar de estado tiene
// su propia regla de negocio (mínimos para publicar), no debe colarse en
// cada guardado de un campo suelto.
const TRANSICIONES: Record<string, string[]> = {
  draft: ['published'],
  published: ['closed'],
  closed: [],
};

function motivoNoPublicable(fila: Pick<FilaRedVacante, 'titulo' | 'descripcion' | 'especialidades'>): string | null {
  if (!fila.titulo?.trim()) return 'Añade un título antes de publicar.';
  if (!fila.descripcion?.trim()) return 'Añade una descripción antes de publicar.';
  if (!fila.especialidades || fila.especialidades.length === 0) return 'Añade al menos una especialidad antes de publicar.';
  return null;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarEquipo(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para publicar vacantes.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { estado?: unknown } | null;
  const estado = typeof body?.estado === 'string' ? body.estado : null;
  if (!estado || !(estado in TRANSICIONES)) return errorPeticion('Estado no válido.');

  const { id } = await params;
  const { data: fila, error: errLeer } = await admin
    .from('red_vacantes')
    .select('id, studio_id, titulo, descripcion, especialidades, estado')
    .eq('id', id)
    .maybeSingle();
  if (errLeer) return errorInterno('network:vacantes:estado:leer', errLeer, 'No se ha podido leer la vacante.');
  if (!fila || fila.studio_id !== sesion.studioId) return NextResponse.json({ error: 'Vacante no encontrada.' }, { status: 404 });

  if (!TRANSICIONES[fila.estado]?.includes(estado)) {
    return errorPeticion(`No se puede pasar de "${fila.estado}" a "${estado}".`);
  }
  if (estado === 'published') {
    const motivo = motivoNoPublicable(fila as FilaRedVacante);
    if (motivo) return errorPeticion(motivo);
  }

  const ahora = new Date().toISOString();
  const update: Record<string, unknown> = { estado, actualizado_en: ahora };
  if (estado === 'closed') update.cerrado_en = ahora;

  const { data, error } = await admin
    .from('red_vacantes')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:vacantes:estado:actualizar', error, 'No se ha podido cambiar el estado de la vacante.');

  return NextResponse.json({ vacante: mapFilaAVacante(data as unknown as FilaRedVacante) });
}
