import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';

// RLS-1: Genera URLs firmadas para fotos de personas en bucket privado.
// Rutas válidas (path): <socio_id>, instructor-<id>, network-<perfil>
// La política de bucket private evita acceso directo; solo esta ruta puede crear URLs.
const BUCKET = 'avatars-privadas';
const DURACION_SEGUNDOS = 3600;  // 1 hora

export interface FotoSignedUrlResponse {
  url: string;
  expiresIn: number;
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'foto-signed-url', { max: 100, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');
  const studioId = searchParams.get('studioId');

  if (!path) return errorPeticion('Falta el path de la foto.');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  // Verificar permisos según el tipo de path
  let autorizado = false;

  if (path === user.userId) {
    // Socia leyendo su propia foto
    autorizado = true;
  } else if (path.startsWith('instructor-')) {
    // Instructora leyendo su propia foto, o staff del estudio
    const instructorId = path.substring('instructor-'.length);
    const { data: instructor } = await admin
      .from('instructores')
      .select('auth_user_id, studio_id')
      .eq('id', instructorId)
      .single();

    if (instructor && (instructor.auth_user_id === user.userId || instructor.studio_id === studioId)) {
      autorizado = true;
    }
  } else if (path.startsWith('network-')) {
    // Persona leyendo su propio perfil de red
    const perfilId = path.substring('network-'.length);
    const { data: perfil } = await admin
      .from('red_perfiles')
      .select('auth_user_id')
      .eq('id', perfilId)
      .single();

    if (perfil && perfil.auth_user_id === user.userId) {
      autorizado = true;
    }
  } else {
    // Path sin prefijo: debe ser socia del estudio
    const socioId = await socioAutenticado(user.userId, studioId);
    if (socioId === path) {
      autorizado = true;
    }
  }

  if (!autorizado) {
    return NextResponse.json({ error: 'No tienes permiso para esta foto' }, { status: 403 });
  }

  // Generar URL firmada
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, DURACION_SEGUNDOS);

  if (error || !data) {
    return errorInterno('api/foto/signed-url', error ?? new Error('sin URL firmada'), 'No se ha podido cargar la foto.');
  }

  return NextResponse.json({
    url: data.signedUrl,
    expiresIn: DURACION_SEGUNDOS,
  } as FotoSignedUrlResponse);
}
