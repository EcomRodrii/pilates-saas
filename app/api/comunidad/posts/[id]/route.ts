import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeModerarComunidad } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { BUCKET_COMUNIDAD, rutaFotoComunidad } from '@/lib/comunidad/foto';

// Borrar una publicación del tablón, con su foto.
//
// El bucket `comunidad-media` es público: si la fila se borraba por RLS desde el
// navegador (como hasta ahora), la foto se quedaba servida en su URL para
// siempre. Ahora el borrado es SOLO de servidor (migr
// 20261005150400_posts_comunidad_borrar_y_foto_solo_servidor, que quita al
// navegador el DELETE de `posts_comunidad` y el UPDATE de `imagen_url`).
//
// Orden: primero la foto y después la fila. Al revés, si fallara la foto, la fila
// ya no existiría para saber qué objeto quitar (huérfano sin arreglo). Así, si
// falla la foto, el post se queda y se puede reintentar; si falla la fila, queda
// el post con la imagen rota hasta reintentar, y el reintento no vuelve a fallar
// (borrar un objeto que ya no está no da error).
//
// ⚠️ La CDN puede seguir sirviendo la foto hasta una hora: ningún texto promete
// que desaparece al instante.
//
// Permisos: quien la escribió o quien modera el tablón (PROPIETARIO, MANAGER,
// RECEPCION), el mismo criterio que tenía la política `posts_comunidad_borrar`.
// Con service-role: la comprobación va aquí, en el servidor.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id } = await params;
  const { data: post, error: errPost } = await admin
    .from('posts_comunidad')
    .select('id, autor_id, imagen_url')
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (errPost) return errorInterno('comunidad/posts:DELETE', errPost, 'No se ha podido borrar la publicación. Inténtalo otra vez.');
  if (!post) return NextResponse.json({ error: 'Publicación no encontrada.' }, { status: 404 });
  if (post.autor_id !== sesion.userId && !puedeModerarComunidad(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para borrar esta publicación.' }, { status: 403 });
  }

  const imagenUrl = (post.imagen_url as string | null) ?? null;
  const ruta = rutaFotoComunidad(imagenUrl, sesion.studioId, process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (imagenUrl && !ruta) {
    // Una URL que no es una foto de este estudio en el bucket: no se adivina qué
    // borrar. Que se vea, porque desde el alta del post no debería pasar.
    Sentry.captureMessage('comunidad: publicación con una imagen que no es del bucket del estudio', {
      level: 'warning', tags: { area: 'comunidad', paso: 'borrar-foto' }, extra: { postId: id },
    });
  }

  if (ruta) {
    // Una foto que comparte otra publicación del estudio no se borra.
    const { count, error: errOtras } = await admin
      .from('posts_comunidad')
      .select('id', { count: 'exact', head: true })
      .eq('studio_id', sesion.studioId)
      .eq('imagen_url', imagenUrl)
      .neq('id', id);
    if (errOtras) return errorInterno('comunidad/posts:DELETE:otras', errOtras, 'No se ha podido borrar la publicación. Inténtalo otra vez.');
    if ((count ?? 0) === 0) {
      const { error: errFoto } = await admin.storage.from(BUCKET_COMUNIDAD).remove([ruta]);
      if (errFoto) {
        return errorInterno('comunidad/posts:DELETE:foto', errFoto, 'No se ha podido borrar la publicación. Inténtalo otra vez.', 502);
      }
    }
  }

  const { error: errBorrar } = await admin
    .from('posts_comunidad')
    .delete()
    .eq('id', id)
    .eq('studio_id', sesion.studioId);
  if (errBorrar) return errorInterno('comunidad/posts:DELETE:fila', errBorrar, 'No se ha podido borrar la publicación. Inténtalo otra vez.');

  return new NextResponse(null, { status: 204 });
}
