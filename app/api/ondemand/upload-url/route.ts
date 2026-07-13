import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { crearSubidaDirecta, streamConfigurado } from '@/lib/stream';

// Emite una URL de subida directa de Cloudflare Stream de un solo uso. Solo el
// PROPIETARIO del estudio (subir contenido es acción de gestión). El navegador
// nunca ve el token de Stream: sube el fichero directo a la URL devuelta. 503 si
// Stream no está configurado (la UI degrada a "solo metadatos").
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'Solo el propietario puede subir vídeos' }, { status: 403 });

  if (!streamConfigurado()) {
    return NextResponse.json(
      { error: 'Cloudflare Stream no configurado. Añade CLOUDFLARE_STREAM_TOKEN (y R2_ACCOUNT_ID) en las variables de entorno.' },
      { status: 503 },
    );
  }

  const body = (await req.json().catch(() => null)) as { nombre?: unknown } | null;
  const nombre = typeof body?.nombre === 'string' && body.nombre.trim() ? body.nombre.trim() : 'Vídeo';

  const r = await crearSubidaDirecta({ nombre });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 500 });
  return NextResponse.json(r.data); // { uid, uploadURL }
}
