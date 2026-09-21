import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { verificarInstructoraEnEstudio, type SesionInstructoraPortal } from '@/lib/auth-instructora';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { TIPOS_FOTO_PERFIL, FOTO_PERFIL_MAX_BYTES } from '@/lib/foto-perfil-regla';

// La foto de la instructora, desde la app del estudio.
//
// El mismo camino que la de la alumna (`/api/public/foto-perfil`): esta app no
// habla con Storage ni con Postgrest, sube por aquí con su sesión.
//
// ⚠️ El objeto es `instructor-<id>`, con el id que sale del TOKEN + slug y nunca
// de la petición: aceptarlo del cliente sería dejarle elegir a quién le cambia
// la foto. Es el prefijo que la política del bucket (`avatars_path_escribible`)
// reserva a la foto de la propia instructora, y el mismo que usa el panel, así
// que la foto es una sola en los dos sitios.

type Resuelto = { ok: false; error: NextResponse } | { ok: true; sesion: SesionInstructoraPortal };

async function resolver(req: NextRequest): Promise<Resuelto> {
  const slug = req.nextUrl.searchParams.get('slug');
  if (!slug) return { ok: false, error: NextResponse.json({ error: 'Falta el estudio' }, { status: 400 }) };
  const sesion = await verificarInstructoraEnEstudio(req, slug);
  if (!sesion) return { ok: false, error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  return { ok: true, sesion };
}

export async function POST(req: NextRequest) {
  const limitada = await enforceRateLimit(req, 'portal-instructora-foto', { max: 10, windowSeconds: 60 });
  if (limitada) return limitada;

  try {
    const r = await resolver(req);
    if (!r.ok) return r.error;
    const { sesion } = r;

    const form = await req.formData().catch(() => null);
    const archivo = form?.get('foto');
    if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta la imagen' }, { status: 400 });
    // ⚠️ Se valida AQUÍ, no solo en el navegador: cualquiera con un token válido
    // puede llamar a esta ruta saltándose la comprobación del cliente.
    if (!TIPOS_FOTO_PERFIL.includes(archivo.type)) {
      return NextResponse.json({ error: 'Ese formato de imagen no vale. Usa JPG, PNG o WebP.' }, { status: 400 });
    }
    if (archivo.size > FOTO_PERFIL_MAX_BYTES) {
      return NextResponse.json({ error: 'La imagen no puede superar 5 MB.' }, { status: 400 });
    }

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const ruta = `instructor-${sesion.instructorId}`;
    const { error: fallo } = await admin.storage.from('avatars')
      .upload(ruta, archivo, { upsert: true, contentType: archivo.type });
    if (fallo) {
      Sentry.captureException(fallo, { tags: { area: 'foto-instructora', paso: 'storage-upload' }, extra: { tipo: archivo.type, bytes: archivo.size } });
      return errorInterno('portal/instructora/foto:POST:storage', fallo, 'No hemos podido guardar la foto.');
    }

    const { data } = admin.storage.from('avatars').getPublicUrl(ruta);
    // Cache-bust: la ruta es siempre la misma, así que sin esto el navegador
    // seguiría enseñando la foto anterior tras sustituirla.
    const url = `${data.publicUrl}?v=${Date.now()}`;

    // Subir y apuntar van juntos: si la ficha no apuntara al fichero recién
    // subido, la foto existiría en el bucket y no se vería en ninguna parte.
    const { error } = await admin.from('instructores').update({ foto_url: url })
      .eq('id', sesion.instructorId).eq('studio_id', sesion.studioId);
    if (error) throw error;

    return NextResponse.json({ url });
  } catch (err) {
    Sentry.captureException(err, { tags: { area: 'foto-instructora', paso: 'POST' } });
    return errorInterno('portal/instructora/foto:POST', err, 'No hemos podido guardar la foto.');
  }
}

export async function DELETE(req: NextRequest) {
  const limitada = await enforceRateLimit(req, 'portal-instructora-foto', { max: 10, windowSeconds: 60 });
  if (limitada) return limitada;

  try {
    const r = await resolver(req);
    if (!r.ok) return r.error;
    const { sesion } = r;

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    // Primero se deja de apuntar y DESPUÉS se borra el fichero. Al revés, un fallo
    // al actualizar la ficha dejaría la foto apuntando a un objeto que ya no existe.
    const { error } = await admin.from('instructores').update({ foto_url: null })
      .eq('id', sesion.instructorId).eq('studio_id', sesion.studioId);
    if (error) throw error;

    // Si falla el borrado del objeto ya no se ve en ninguna parte: queda un
    // fichero huérfano, que es mucho menos malo que una foto que no se puede quitar.
    // A ella no se le devuelve error (ya no la ve), pero SÍ queda en el log: el
    // fichero sigue en un bucket público justo cuando ha pedido quitarlo.
    const { error: sinBorrar } = await admin.storage.from('avatars').remove([`instructor-${sesion.instructorId}`]);
    if (sinBorrar) {
      console.error('[portal/instructora/foto:DELETE] la ficha ya no apunta a la foto, pero el fichero no se ha borrado', sinBorrar.message);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorInterno('portal/instructora/foto:DELETE', err, 'No hemos podido quitar la foto.');
  }
}
