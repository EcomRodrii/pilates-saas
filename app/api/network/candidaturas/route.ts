import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { emitirRedCandidaturaRecibida } from '@/lib/notifications/emit';

// Aplicar a una vacante (Fase 2, "instructora → busca oportunidades").
// Exige perfil PUBLICADO — un perfil suspendido por moderación (mismo hueco
// que ya cerró red_perfiles_rls_publicacion.sql para el contacto directo)
// no puede seguir generando candidaturas activas pese a la suspensión.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { vacanteId?: unknown; mensaje?: unknown } | null;
  const vacanteId = typeof body?.vacanteId === 'string' ? body.vacanteId : null;
  const mensaje = typeof body?.mensaje === 'string' && body.mensaje.trim() ? body.mensaje.trim() : null;
  if (!vacanteId) return errorPeticion('Falta la vacante.');

  const [{ data: perfil }, { data: vacante }] = await Promise.all([
    admin.from('red_perfiles').select('id, nombre, estado').eq('auth_user_id', usuario.userId).maybeSingle(),
    admin.from('red_vacantes').select('id, studio_id, titulo, estado').eq('id', vacanteId).maybeSingle(),
  ]);
  if (!perfil) return errorPeticion('Todavía no tienes un perfil en Tentare Network.', 403);
  if (perfil.estado !== 'published') {
    return errorPeticion('Tu perfil tiene que estar publicado para poder aplicar a una vacante.', 403);
  }
  if (!vacante || vacante.estado !== 'published') {
    return errorPeticion('Esta vacante ya no está disponible.', 404);
  }

  const candidaturaId = `redcand-${uid()}`;
  const { error } = await admin.from('red_candidaturas').insert({
    id: candidaturaId,
    vacante_id: vacanteId,
    perfil_id: perfil.id,
    studio_id: vacante.studio_id,
    mensaje,
  });
  if (error) {
    if (error.code === '23505') return errorPeticion('Ya has aplicado a esta vacante.', 409);
    return errorInterno('network:candidaturas:POST', error, 'No se ha podido enviar tu candidatura.');
  }

  await emitirRedCandidaturaRecibida(admin, {
    studioId: vacante.studio_id, candidaturaId, vacanteId, vacanteTitulo: vacante.titulo, profesional: perfil.nombre,
  });

  return NextResponse.json({ ok: true });
}
