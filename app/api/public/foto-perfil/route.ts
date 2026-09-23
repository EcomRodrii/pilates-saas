import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { socioAutenticado, actualizarSociaPublica } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { TIPOS_FOTO_PERFIL, FOTO_PERFIL_MAX_BYTES } from '@/lib/foto-perfil-regla';

// La foto de perfil de la socia, desde SU app.
//
// ⚠️ POR QUÉ UNA RUTA DE SERVIDOR Y NO UNA SUBIDA DIRECTA. `lib/portal-storage.ts`
// ya tiene `subirFotoPerfil`/`eliminarFotoPerfil`… pero suben con el cliente
// del PANEL (`lib/db/supabase`), y la app de la alumna se autentica con otro
// (`supabasePortal`), que además es SOLO un cliente de auth: se salta
// Postgrest, Realtime y Storage a propósito. Llamarlas desde aquí subiría sin
// sesión y la RLS lo rechazaría.
//
// La app de la alumna no habla nunca con Storage ni con Postgrest: escribe
// siempre por `/api/public/*` con su cabecera de sesión. Esto sigue esa misma
// arquitectura en vez de introducir un segundo cliente con una segunda sesión.
//
// ⚠️ EL `socioId` SALE DEL TOKEN, NUNCA DEL CUERPO. Es lo que impide que una
// alumna escriba sobre la foto de otra: la ruta del objeto en el bucket es el
// id de la socia, así que aceptarlo del cliente sería dejarle elegir a quién
// le cambia la foto.
//
// ⚠️ SEC-01 (auditoría 23-sep): sube a `avatars-privadas` (bucket PRIVADO,
// RLS-1), no a `avatars` (público) — antes la foto quedaba servida sin
// autenticación en una URL predecible. La política del bucket es la segunda
// cerradura para quien intente subir directo sin pasar por aquí (esta ruta,
// con service-role, ya la salta a propósito); declara sus propios
// `allowed_mime_types` y límite de 5 MB.

export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

// Unión DISCRIMINADA y anotada a mano: sin el tipo explícito, TypeScript
// fusiona las dos formas de retorno en un objeto con todo opcional y el
// `'error' in r` de abajo deja de estrechar — el error salía como
// `NextResponse | undefined` en los dos usos.
type Resuelto =
  | { ok: false; error: NextResponse }
  | { ok: true; studioId: string; socioId: string; authUserId: string };

async function resolver(req: NextRequest): Promise<Resuelto> {
  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return { ok: false, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!studioId) return { ok: false, error: NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }) };
  // El id de la socia sale del TOKEN, nunca del cuerpo ni de la query.
  const socioId = await socioAutenticado(usuario.userId, studioId);
  if (!socioId) return { ok: false, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  return { ok: true, studioId, socioId, authUserId: usuario.userId };
}

export async function POST(req: NextRequest) {
  const limitada = await enforceRateLimit(req, 'foto-perfil', { max: 10, windowSeconds: 60 });
  if (limitada) return limitada;

  const r = await resolver(req);
  if (!r.ok) return conCorsWidget(req, r.error);

  try {
    const form = await req.formData().catch(() => null);
    const archivo = form?.get('foto');
    if (!(archivo instanceof File)) {
      return conCorsWidget(req, NextResponse.json({ error: 'Falta la imagen' }, { status: 400 }));
    }
    // ⚠️ Se valida AQUÍ, no solo en el navegador. El cliente ya comprueba tipo y
    // tamaño, pero esa comprobación es un adorno: cualquiera puede llamar a esta
    // ruta con un token válido y saltársela.
    if (!TIPOS_FOTO_PERFIL.includes(archivo.type)) {
      return conCorsWidget(req, NextResponse.json({ error: 'Ese formato de imagen no vale. Usa JPG, PNG o WebP.' }, { status: 400 }));
    }
    if (archivo.size > FOTO_PERFIL_MAX_BYTES) {
      return conCorsWidget(req, NextResponse.json({ error: 'La imagen no puede superar 5 MB.' }, { status: 400 }));
    }

    const admin = getSupabaseAdmin();
    if (!admin) return conCorsWidget(req, NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }));

    // ⚠️ SEC-01 (auditoría 23-sep): antes subía a `avatars` (bucket PÚBLICO) —
    // la foto de la socia quedaba servida sin autenticación en una URL
    // predecible (`/object/public/avatars/<socio_id>`). Ahora va a
    // `avatars-privadas` (RLS-1, ya existía sin consumidor real) — la ruta del
    // objeto sigue siendo el id de la socia, sin prefijo, que es lo que
    // `app/api/foto/signed-url` reconoce como «su propia foto».
    const { error: fallo } = await admin.storage
      .from('avatars-privadas')
      .upload(r.socioId, archivo, { upsert: true, contentType: archivo.type });
    if (fallo) {
      Sentry.captureException(fallo, { tags: { area: 'foto-perfil', paso: 'storage-upload' }, extra: { tipo: archivo.type, bytes: archivo.size } });
      return conCorsWidget(req, errorInterno('public/foto-perfil:POST:storage', fallo, 'No hemos podido guardar la foto.'));
    }

    // `socios.foto_url` pasa a guardar el PATH desnudo, no una URL pública —
    // ya no hay ninguna URL pública que construir. Todo lector pasa por
    // `useFotoUrl`/`obtenerUrlFoto`, que piden una firmada cada vez (1h de
    // validez), así que no hace falta cache-busting aquí: cada resolución es
    // ya una URL nueva.
    const res = await actualizarSociaPublica({
      studioId: r.studioId, socioId: r.socioId, authUserId: r.authUserId, cambios: { fotoUrl: r.socioId },
    });
    if ('error' in res) {
      Sentry.captureMessage(`foto-perfil: la ficha no se actualizó tras subir: ${String(res.error)}`, { level: 'error', tags: { area: 'foto-perfil', paso: 'ficha' } });
      return conCorsWidget(req, NextResponse.json(res, { status: 400 }));
    }

    // El cliente (`FotoPerfil.tsx`) pinta `url` directo en un
    // `background-image`, así que necesita algo que cargue en el navegador YA
    // — se le da una firmada de una vez, para la previsualización optimista;
    // la próxima vez que se pinte la cabecera/perfil, pedirá la suya propia.
    const { data: firmada, error: errorFirma } = await admin.storage
      .from('avatars-privadas')
      .createSignedUrl(r.socioId, 3600);
    if (errorFirma || !firmada) {
      Sentry.captureException(errorFirma ?? new Error('sin URL firmada tras subir'), { tags: { area: 'foto-perfil', paso: 'firmar-tras-subir' } });
      return conCorsWidget(req, errorInterno('public/foto-perfil:POST:firma', errorFirma ?? new Error('sin URL'), 'La foto se guardó, pero no se pudo mostrar. Recarga la página.'));
    }

    return conCorsWidget(req, NextResponse.json({ url: firmada.signedUrl }));
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'foto-perfil', paso: 'POST' } });
    return conCorsWidget(req, errorInterno('public/foto-perfil:POST', err, 'No hemos podido guardar la foto.'));
  }
}

export async function DELETE(req: NextRequest) {
  const limitada = await enforceRateLimit(req, 'foto-perfil', { max: 10, windowSeconds: 60 });
  if (limitada) return limitada;

  const r = await resolver(req);
  if (!r.ok) return conCorsWidget(req, r.error);

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return conCorsWidget(req, NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 }));

    // Primero se deja de apuntar y DESPUÉS se borra el fichero. Al revés, un
    // fallo al actualizar la ficha dejaría la foto apuntando a un objeto que ya
    // no existe: un hueco roto en todas las pantallas.
    const res = await actualizarSociaPublica({
      studioId: r.studioId, socioId: r.socioId, authUserId: r.authUserId, cambios: { fotoUrl: null },
    });
    if ('error' in res) return conCorsWidget(req, NextResponse.json(res, { status: 400 }));

    // Si el borrado del objeto falla, la socia YA no lo ve: queda un fichero
    // huérfano, que es mucho menos malo que una foto que no se puede quitar.
    await admin.storage.from('avatars-privadas').remove([r.socioId]);
    return conCorsWidget(req, NextResponse.json({ ok: true }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/foto-perfil:DELETE', err, 'No hemos podido quitar la foto.'));
  }
}
