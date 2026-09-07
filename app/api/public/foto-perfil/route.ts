import { NextRequest, NextResponse } from 'next/server';
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
// La política del bucket (`avatars_path_autorizado`) sigue siendo la segunda
// cerradura, y declara sus propios `allowed_mime_types` y límite de 5 MB.

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

    // La ruta del objeto ES el id de la socia, sin prefijo — que es lo que la
    // política del bucket reconoce como «su propia foto».
    const { error: fallo } = await admin.storage
      .from('avatars')
      .upload(r.socioId, archivo, { upsert: true, contentType: archivo.type });
    if (fallo) return conCorsWidget(req, NextResponse.json({ error: 'No hemos podido guardar la foto.' }, { status: 400 }));

    const { data } = admin.storage.from('avatars').getPublicUrl(r.socioId);
    // Cache-bust: el path es siempre el mismo, así que sin esto el navegador
    // seguiría enseñando la foto anterior tras sustituirla.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    // Subir y apuntar van juntos: si la ficha no apuntara al fichero recién
    // subido, la foto existiría en el bucket y no se vería en ninguna parte.
    const res = await actualizarSociaPublica({
      studioId: r.studioId, socioId: r.socioId, authUserId: r.authUserId, cambios: { fotoUrl: url },
    });
    if ('error' in res) return conCorsWidget(req, NextResponse.json(res, { status: 400 }));

    return conCorsWidget(req, NextResponse.json({ url }));
  } catch (err) {
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
    await admin.storage.from('avatars').remove([r.socioId]);
    return conCorsWidget(req, NextResponse.json({ ok: true }));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/foto-perfil:DELETE', err, 'No hemos podido quitar la foto.'));
  }
}
