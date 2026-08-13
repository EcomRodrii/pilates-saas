import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaAExperiencia, type FilaRedExperiencia } from '@/lib/network/mapeo';
import { esEspecialidadValida } from '@/lib/network/catalogo';

// CRUD de experiencia laboral — docs/NETWORK-IMPLEMENTATION-PLAN.md §3/§6.
//
// `studio_id` NUNCA se fija desde aquí: enlazar una experiencia a un estudio
// Tentare real es parte del flujo de "Verificar experiencia" (Fase 7), no
// del alta. Solo POST/DELETE (sin PATCH) — editar es borrar y volver a
// crear, mismo criterio de mínimo alcance que el resto de esta fase.

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ experiencias: [] });

  const { data, error } = await admin
    .from('red_experiencias')
    .select('id, perfil_id, studio_id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion, estado_verificacion, creado_en')
    .eq('perfil_id', perfilId)
    .order('fecha_inicio', { ascending: false });
  if (error) return errorInterno('network:experiencia:GET', error, 'No se han podido cargar tus experiencias.');

  return NextResponse.json({ experiencias: (data as unknown as FilaRedExperiencia[]).map(mapFilaAExperiencia) });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil antes de añadir experiencia.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const nombreEstudio = String(body.nombreEstudio ?? '').trim();
  if (!nombreEstudio) return errorPeticion('Indica el nombre del estudio.');

  const fechaInicio = typeof body.fechaInicio === 'string' ? body.fechaInicio : '';
  if (!fechaInicio || Number.isNaN(Date.parse(fechaInicio))) return errorPeticion('La fecha de inicio no es válida.');

  const fechaFin = typeof body.fechaFin === 'string' && body.fechaFin ? body.fechaFin : null;
  if (fechaFin && Number.isNaN(Date.parse(fechaFin))) return errorPeticion('La fecha de fin no es válida.');
  if (fechaFin && fechaFin < fechaInicio) return errorPeticion('La fecha de fin no puede ser anterior a la de inicio.');

  const especialidades = Array.isArray(body.especialidades) ? body.especialidades : [];
  if (!especialidades.every(esEspecialidadValida)) return errorPeticion('Hay una especialidad no reconocida.');

  const descripcion = body.descripcion == null || body.descripcion === '' ? null : String(body.descripcion).trim();

  const { data, error } = await admin
    .from('red_experiencias')
    .insert({
      id: `redexp-${uid()}`,
      perfil_id: perfilId,
      studio_id: null,
      nombre_estudio: nombreEstudio,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      especialidades,
      descripcion,
    })
    .select('id, perfil_id, studio_id, nombre_estudio, fecha_inicio, fecha_fin, especialidades, descripcion, estado_verificacion, creado_en')
    .single();
  if (error) return errorInterno('network:experiencia:POST', error, 'No se ha podido guardar la experiencia.');

  return NextResponse.json({ experiencia: mapFilaAExperiencia(data as unknown as FilaRedExperiencia) });
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return errorPeticion('Falta el id.');

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('No tienes ningún perfil.', 404);

  const { error } = await admin
    .from('red_experiencias')
    .delete()
    .eq('id', id)
    .eq('perfil_id', perfilId); // nunca confiar en que el id venga ya acotado al perfil propio
  if (error) return errorInterno('network:experiencia:DELETE', error, 'No se ha podido eliminar la experiencia.');

  return NextResponse.json({ ok: true });
}
