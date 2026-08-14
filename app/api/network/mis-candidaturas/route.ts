import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { mapFilaACandidatura, type FilaRedCandidatura } from '@/lib/network/mapeo';

// Mis candidaturas (lado instructora) — nunca incluye notas_estudio (mismo
// criterio que email_contacto/telefono_contacto en red_perfiles: dato
// privado del otro lado, no se expone aquí).
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data: perfil } = await admin.from('red_perfiles').select('id').eq('auth_user_id', usuario.userId).maybeSingle();
  if (!perfil) return NextResponse.json({ candidaturas: [] });

  const { data, error } = await admin
    .from('red_candidaturas')
    .select('id, vacante_id, perfil_id, mensaje, notas_estudio, estado, solicitud_id, creado_en, actualizado_en, resuelto_en, red_vacantes ( titulo, studios ( nombre ) )')
    .eq('perfil_id', perfil.id)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:mis-candidaturas:GET', error, 'No se han podido cargar tus candidaturas.');

  type Fila = FilaRedCandidatura & { red_vacantes: { titulo: string | null; studios: { nombre: string | null } | null } | null };
  const candidaturas = ((data ?? []) as unknown as Fila[]).map(f => mapFilaACandidatura(f, {
    vacanteTitulo: f.red_vacantes?.titulo ?? null,
    estudioNombre: f.red_vacantes?.studios?.nombre ?? null,
    ocultarNotasEstudio: true,
  }));

  return NextResponse.json({ candidaturas });
}
