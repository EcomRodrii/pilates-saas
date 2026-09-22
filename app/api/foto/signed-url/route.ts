import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase, verificarSesionStaff } from '@/lib/auth-server';
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

  // ⚠️ Auditoría 2026-09-22: aquí había un `if (path === user.userId)` con el
  // comentario «socia leyendo su propia foto». El path de una socia es su
  // `socios.id` (la ficha), no su `auth.users.id`: son dos espacios de id
  // distintos y la comparación no se cumplía nunca. Una comprobación que
  // APARENTA autorizar y no autoriza es la misma forma exacta del IDOR que se
  // acaba de cerrar tres líneas más abajo, así que se retira en vez de dejarla
  // de adorno. El caso lo resuelve, bien, la rama `else` con
  // `socioAutenticado(user.userId, studioId)`.
  if (path.startsWith('instructor-')) {
    // Instructora leyendo su propia foto, o staff del MISMO estudio.
    //
    // ⚠️ Auditoría 2026-09-21: aquí se comparaba `instructor.studio_id ===
    // studioId`, con `studioId` llegando CRUDO del query string. Eso no
    // autoriza, solo comprueba que quien llama ACIERTA el estudio — y los
    // paths son predecibles (lo dice la propia migración del bucket). Con
    // cualquier JWT válido (una socia de otro estudio, una cuenta de Network)
    // se obtenía la URL firmada de la foto privada de cualquier instructora.
    // El estudio tiene que salir de la SESIÓN, nunca de la petición: es el
    // mismo criterio que ya usaba la rama de socia con `socioAutenticado`.
    const instructorId = path.substring('instructor-'.length);
    const { data: instructor } = await admin
      .from('instructores')
      .select('auth_user_id, studio_id')
      .eq('id', instructorId)
      .single();

    if (instructor) {
      if (instructor.auth_user_id === user.userId) {
        autorizado = true;
      } else {
        const sesion = await verificarSesionStaff(req);
        if (sesion && sesion.studioId === instructor.studio_id) autorizado = true;
      }
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
