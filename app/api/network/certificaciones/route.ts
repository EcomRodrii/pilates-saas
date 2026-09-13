import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import { mapFilaACertificacion, type FilaRedCertificacion } from '@/lib/network/mapeo';
import { borrarRutas, limpiarHuerfanosTrasRegistrar } from '@/lib/network/documentos-servidor';
import { BUCKET_DOCUMENTOS_RED, ESTADOS_CERTIFICACION_RETIRABLE } from '@/lib/network/supresion-documentos';

// Paso 06 del wizard ("Formación") — CRUD de certificaciones. Mismo patrón
// que /api/network/experiencia: solo POST/DELETE (sin PATCH, no se edita
// una certificación ya enviada — se retira y se vuelve a subir). El documento
// ya está en el bucket privado antes de llamar aquí, igual que la verificación
// de identidad.

const SELECT_COLUMNAS = 'id, perfil_id, nombre, institucion, anio, duracion, documento_path, estado, motivo_rechazo, creado_en';

// Una subida de certificado se registra en el mismo clic (paso-formacion.tsx):
// cinco minutos sobran para que una subida en curso en otra pestaña no se tome
// por huérfana.
const MARGEN_HUERFANOS_MS = 5 * 60 * 1000;

async function propioPerfilId(admin: ReturnType<typeof getSupabaseAdmin>, authUserId: string): Promise<string | null> {
  const { data } = await admin!.from('red_perfiles').select('id').eq('auth_user_id', authUserId).maybeSingle();
  return data?.id ?? null;
}

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return NextResponse.json({ certificaciones: [] });

  const { data, error } = await admin
    .from('red_certificaciones')
    .select(SELECT_COLUMNAS)
    .eq('perfil_id', perfilId)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('network:certificaciones:GET', error, 'No se han podido cargar tus certificaciones.');

  return NextResponse.json({ certificaciones: (data as unknown as FilaRedCertificacion[]).map(mapFilaACertificacion) });
}

export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('Crea tu perfil (paso 1) antes de continuar.', 404);

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return errorPeticion('Petición inválida.');

  const nombre = String(body.nombre ?? '').trim();
  if (!nombre) return errorPeticion('Indica el nombre de la certificación.');
  const institucion = String(body.institucion ?? '').trim();
  if (!institucion) return errorPeticion('Indica la institución.');

  const anio = body.anio == null || body.anio === '' ? null : Number(body.anio);
  if (anio != null && (!Number.isFinite(anio) || anio < 1950 || anio > new Date().getFullYear())) {
    return errorPeticion('El año no es válido.');
  }
  const duracion = body.duracion == null || body.duracion === '' ? null : String(body.duracion).trim();

  const documentoPath = typeof body.documentoPath === 'string' ? body.documentoPath : '';
  if (!documentoPath) return errorPeticion('Falta el documento subido.');
  if (!documentoPath.startsWith(`${usuario.userId}/certificacion-`)) return errorPeticion('Ruta de documento no válida.');

  const { data, error } = await admin
    .from('red_certificaciones')
    .insert({ id: `redcert-${uid()}`, perfil_id: perfilId, nombre, institucion, anio, duracion, documento_path: documentoPath })
    .select(SELECT_COLUMNAS)
    .single();
  if (error) return errorInterno('network:certificaciones:POST', error, 'No se ha podido guardar la certificación.');

  // Un intento anterior que subió el certificado pero no llegó a registrarlo
  // dejaba el binario sin fila para siempre.
  await limpiarHuerfanosTrasRegistrar(admin, {
    authUserId: usuario.userId, perfilId, prefijo: 'certificacion', margenMs: MARGEN_HUERFANOS_MS,
  });

  return NextResponse.json({ certificacion: mapFilaACertificacion(data as unknown as FilaRedCertificacion) });
}

export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const usuario = await verificarUsuarioSupabase(req);
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : null;
  if (!id) return errorPeticion('Falta el id.');

  const perfilId = await propioPerfilId(admin, usuario.userId);
  if (!perfilId) return errorPeticion('No tienes ningún perfil.', 404);

  // Pendiente o rechazada: el wizard ofrece «Volver a subir» sobre una
  // rechazada y llamaba aquí, pero solo se aceptaba 'pendiente' — el DELETE
  // fallaba y la pantalla quitaba la tarjeta igual. Verificada no se retira
  // desde aquí (es la señal pública «formación verificada»).
  const { data: fila, error: errLeer } = await admin
    .from('red_certificaciones')
    .select('id, documento_path')
    .eq('id', id)
    .eq('perfil_id', perfilId)
    .in('estado', [...ESTADOS_CERTIFICACION_RETIRABLE])
    .maybeSingle();
  if (errLeer) return errorInterno('network:certificaciones:DELETE:leer', errLeer, 'No se ha podido eliminar la certificación.');
  if (!fila) return errorPeticion('Solo puedes retirar una certificación pendiente de revisión o rechazada.');

  // Primero el binario, después la fila (mismo orden que el portfolio): al
  // revés, un fallo de Storage dejaría el certificado sin ninguna fila que lo
  // encuentre.
  const path = (fila as { documento_path: string | null }).documento_path;
  if (path) {
    const borrado = await borrarRutas(admin, BUCKET_DOCUMENTOS_RED, [path]);
    if (!borrado.ok) {
      return errorInterno('network:certificaciones:DELETE:storage', new Error(borrado.error), 'No se ha podido eliminar la certificación.');
    }
  }

  const { error, count } = await admin
    .from('red_certificaciones')
    .delete({ count: 'exact' })
    .eq('id', id)
    .eq('perfil_id', perfilId)
    .in('estado', [...ESTADOS_CERTIFICACION_RETIRABLE]);
  if (error) return errorInterno('network:certificaciones:DELETE', error, 'No se ha podido eliminar la certificación.');
  if (!count) return errorPeticion('Esta certificación acaba de cambiar de estado. Recarga la página.', 409);

  return NextResponse.json({ ok: true });
}
