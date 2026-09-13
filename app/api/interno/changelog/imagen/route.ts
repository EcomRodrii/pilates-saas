import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { registrar } from '@/lib/interno/auditoria';
import { BUCKET_CHANGELOG, MAX_BYTES_IMAGEN_CAMBIO, TIPOS_IMAGEN_CAMBIO, tipoRealDeBytes } from '@/lib/interno/changelog-imagen';

export const runtime = 'nodejs';

// La subida de la captura de un cambio del changelog.
//
// ⚠️ Va por el SERVIDOR y no por `supabase.storage` desde el navegador, a
// diferencia de las fotos del portal. El bucket `changelog-media` no tiene
// NINGUNA política de RLS a propósito (ver su migración): quien escribe es
// Tentare, con `service_role`, nunca un cliente. Subir desde el navegador
// exigiría abrirle una política a `authenticated` — y `authenticated` aquí es
// cualquier persona con cuenta en cualquier estudio, no solo quien administra.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'content.write');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Falta la imagen.' }, { status: 400 });
  if (!TIPOS_IMAGEN_CAMBIO.includes(file.type)) {
    return NextResponse.json({ error: 'Formato no admitido. Usa PNG, JPG o WEBP.' }, { status: 400 });
  }
  if (file.size > MAX_BYTES_IMAGEN_CAMBIO) {
    return NextResponse.json({ error: 'La imagen no puede superar 2 MB.' }, { status: 400 });
  }

  // M-4 (auditoría 58ª pasada): hasta aquí solo se ha comprobado `file.type`
  // -lo que el NAVEGADOR dice-, y de ahí sale tanto la extensión como el
  // `contentType` con el que se guarda. Los bytes reales se miran ahora,
  // antes de decidir nada de eso.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const tipoReal = tipoRealDeBytes(bytes);
  if (tipoReal === null || tipoReal !== file.type) {
    return NextResponse.json({ error: 'El archivo no es una imagen PNG, JPG o WEBP válida.' }, { status: 400 });
  }

  // Nombre nuevo en cada subida, nunca `upsert` sobre un path fijo. Una versión
  // ya publicada está EN PANTALLA en los estudios: sobrescribir el fichero le
  // cambiaría la captura a una actualización que ya se leyó, y encima sin que
  // la caché del navegador se entere. Lo viejo se queda; el coste es unos KB.
  const ext = tipoReal === 'image/png' ? 'png' : tipoReal === 'image/webp' ? 'webp' : 'jpg';
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await db.storage.from(BUCKET_CHANGELOG)
    .upload(path, bytes, { contentType: tipoReal, upsert: false });
  if (error) return NextResponse.json({ error: 'No se ha podido subir la imagen.' }, { status: 500 });

  const { data } = db.storage.from(BUCKET_CHANGELOG).getPublicUrl(path);

  await registrar(db, req, {
    actor: g.admin,
    accion: 'changelog.imagen.subida',
    objetivoTipo: 'changelog_imagen', objetivoId: path,
    resumen: `Imagen subida (${Math.round(file.size / 1024)} KB)`,
    antes: null, despues: { path },
  });

  return NextResponse.json({ ok: true, url: data.publicUrl });
}
