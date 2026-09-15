import { NextRequest, NextResponse } from 'next/server';
import { verificarInstructoraEnEstudio } from '@/lib/auth-instructora';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { leerCambiosPerfil } from '@/lib/portal-instructora/editar-perfil';

// Sus datos en la app del estudio: leerlos (POST) y cambiar su nombre, su
// descripción y su teléfono (PATCH). La foto va por `/api/portal/instructora/foto`.
//
// ⚠️ Con service-role, así que la RLS no protege nada. La ficha sale del TOKEN
// + slug (`verificarInstructoraEnEstudio`), nunca del cuerpo, y la escritura va
// filtrada por SU id y SU estudio, con SOLO las columnas que devuelve
// `leerCambiosPerfil`. Una clave de más en el JSON no llega a la base.
//
// Solo su ficha de ESTE estudio: con varias sedes tiene una por sede (P2-14) y
// no se sincronizan entre sí.

const COLUMNAS = 'nombre, telefono, bio, foto_url';

type Fila = { nombre: string | null; telefono: string | null; bio: string | null; foto_url: string | null };

function vista(fila: Fila, email: string | null) {
  return { nombre: fila.nombre ?? '', email, telefono: fila.telefono, bio: fila.bio, fotoUrl: fila.foto_url };
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-perfil-datos', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const { data, error } = await admin.from('instructores').select(COLUMNAS)
      .eq('id', sesion.instructorId).eq('studio_id', sesion.studioId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'No encontramos tu ficha en este estudio.' }, { status: 404 });
    return NextResponse.json(vista(data as Fila, sesion.email));
  } catch (err) {
    return errorInterno('portal/instructora/perfil/datos:POST', err, 'No hemos podido cargar tus datos.');
  }
}

export async function PATCH(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'portal-instructora-perfil-editar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { slug?: unknown; cambios?: unknown } | null;
  const slug = typeof body?.slug === 'string' ? body.slug : '';
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  try {
    const sesion = await verificarInstructoraEnEstudio(req, slug);
    if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const lectura = leerCambiosPerfil(body?.cambios);
    if (!lectura.ok) return NextResponse.json({ error: lectura.error, campo: lectura.campo }, { status: 400 });

    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

    const { data, error } = await admin.from('instructores')
      .update(lectura.cambios)
      .eq('id', sesion.instructorId).eq('studio_id', sesion.studioId)
      .select(COLUMNAS)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'No encontramos tu ficha en este estudio.' }, { status: 404 });
    return NextResponse.json(vista(data as Fila, sesion.email));
  } catch (err) {
    return errorInterno('portal/instructora/perfil/datos:PATCH', err, 'No hemos podido guardar tus datos.');
  }
}
