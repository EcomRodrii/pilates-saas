import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';

// Retirar una candidatura — solo la dueña del perfil, y solo desde un
// estado no terminal (una vez aceptada/rechazada, retirarla no tendría
// ningún efecto real y confundiría el historial).
const ESTADOS_TERMINALES = new Set(['aceptada', 'rechazada', 'retirada']);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: fila, error: errLeer } = await admin
    .from('red_candidaturas')
    .select('id, estado, red_perfiles ( auth_user_id )')
    .eq('id', id)
    .maybeSingle();
  if (errLeer) return errorInterno('network:candidaturas:retirar:leer', errLeer, 'No se ha podido leer la candidatura.');

  const perfil = fila?.red_perfiles as unknown as { auth_user_id: string } | null;
  if (!fila || perfil?.auth_user_id !== usuario.userId) {
    return NextResponse.json({ error: 'Candidatura no encontrada.' }, { status: 404 });
  }
  if (ESTADOS_TERMINALES.has(fila.estado)) return errorPeticion('Esta candidatura ya no se puede retirar.');

  const { error } = await admin
    .from('red_candidaturas')
    .update({ estado: 'retirada', resuelto_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
    .eq('id', id);
  if (error) return errorInterno('network:candidaturas:retirar:POST', error, 'No se ha podido retirar la candidatura.');

  return NextResponse.json({ ok: true });
}
