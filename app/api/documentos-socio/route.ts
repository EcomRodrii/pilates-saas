import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { uid } from '@/lib/utils';
import { emitirDocumentoSocioNuevo } from '@/lib/notifications/emit';
import type { RowDocumentosSocio } from '@/lib/db-types';

// Buzón de documentos (Community & Messaging OS, P2) — lado STAFF.
//
// Flujo de subida elegido: el CLIENTE sube el archivo DIRECTO al bucket
// privado `documentos-socio` con su propia sesión `authenticated` (la RLS de
// `storage.objects`, migración 20260826200010, ya exige
// `puede_gestionar_clientas()` + que el primer segmento del path sea
// `current_studio_id()` — el mismo candado que esta ruta comprueba en TS).
// Esta ruta SOLO inserta la fila de metadatos una vez la subida ha
// terminado, igual que `app/api/network/portfolio` (POST) con
// `red-documentos-identidad`: evita mandar el binario dos veces (cliente→
// servidor→Storage) sin ganar nada en seguridad, porque la policy de INSERT
// del bucket ya hace el trabajo de acotar quién puede escribir dónde.
//
// El path SIEMPRE se valida contra `${studioId}/` antes de insertar —
// defensa en profundidad: la fila la crea un body que controla el cliente,
// nunca fiarse de que el path que dice haber subido es el que la RLS de
// verdad le dejó escribir.
const CATEGORIAS = ['PLAN', 'FACTURA', 'CONTRATO', 'OTRO'] as const;
type Categoria = (typeof CATEGORIAS)[number];

function esCategoriaValida(v: unknown): v is Categoria {
  return typeof v === 'string' && (CATEGORIAS as readonly string[]).includes(v);
}

async function socioDeEsteEstudio(
  admin: ReturnType<typeof getSupabaseAdmin> & {}, socioId: string, studioId: string,
): Promise<boolean> {
  const { data } = await admin.from('socios').select('id').eq('id', socioId).eq('studio_id', studioId).maybeSingle();
  return Boolean(data);
}

// Crea la fila de metadatos tras confirmar la subida directa a Storage.
export async function POST(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para subir documentos a una socia.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as {
    socioId?: unknown; categoria?: unknown; titulo?: unknown; path?: unknown; caducaEn?: unknown;
  } | null;

  const socioId = typeof body?.socioId === 'string' ? body.socioId : '';
  const titulo = typeof body?.titulo === 'string' ? body.titulo.trim() : '';
  const path = typeof body?.path === 'string' ? body.path : '';
  if (!socioId || !titulo || !path) return errorPeticion('Faltan datos del documento.');
  if (!esCategoriaValida(body?.categoria)) return errorPeticion('Categoría no válida.');
  // Nunca de la BD del cliente sin comprobar: aunque el titulo se renderiza
  // como TEXTO PLANO en cualquier UI futura (nunca HTML/Markdown crudo), no
  // hace daño acotar su tamaño para no reventar una tarjeta.
  if (titulo.length > 200) return errorPeticion('El título es demasiado largo.');

  const caducaEn = typeof body?.caducaEn === 'string' && body.caducaEn ? body.caducaEn : null;
  if (caducaEn && Number.isNaN(Date.parse(caducaEn))) return errorPeticion('Fecha de caducidad no válida.');

  // Defensa en profundidad: la RLS de storage ya obliga a que el primer
  // segmento del path sea el estudio de quien sube, pero esta fila la crea
  // el cliente con datos que él controla — nunca fiarse a ciegas.
  if (!path.startsWith(`${sesion.studioId}/`)) return errorPeticion('El documento no es válido.');

  if (!(await socioDeEsteEstudio(admin, socioId, sesion.studioId))) {
    return errorPeticion('Esa socia no pertenece a tu estudio.', 404);
  }

  const id = `docsocio-${uid()}`;
  const { data, error } = await admin
    .from('documentos_socio')
    .insert({
      id,
      studio_id: sesion.studioId,
      socio_id: socioId,
      categoria: body!.categoria,
      titulo,
      storage_path: path,
      subido_por: sesion.userId,
      caduca_en: caducaEn,
    })
    .select('id, studio_id, socio_id, categoria, titulo, storage_path, subido_por, caduca_en, creado_en, borrado_en')
    .single();
  if (error) return errorInterno('documentos-socio:POST', error, 'No se ha podido guardar el documento.');

  // Best-effort: nunca bloquea ni revierte la creación del documento.
  emitirDocumentoSocioNuevo(admin, { studioId: sesion.studioId, documentoId: id, socioId, titulo })
    .catch(e => console.error('[documentos-socio:POST] notificación:', e instanceof Error ? e.message : e));

  return NextResponse.json({ documento: data as RowDocumentosSocio });
}

// Lista los documentos de UNA socia (ficha de clienta). Nunca todo el buzón
// del estudio de golpe — se pinta dentro de la ficha, igual que
// `dbListComunicacionesSocio`.
export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver los documentos de esta socia.' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const socioId = searchParams.get('socioId');
  if (!socioId) return errorPeticion('Falta la socia.');

  const { data, error } = await admin
    .from('documentos_socio')
    .select('id, studio_id, socio_id, categoria, titulo, storage_path, subido_por, caduca_en, creado_en, borrado_en')
    .eq('studio_id', sesion.studioId)
    .eq('socio_id', socioId)
    .is('borrado_en', null)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('documentos-socio:GET', error, 'No se han podido cargar los documentos.');

  // El staff SÍ ve documentos caducados (histórico) — a diferencia de la
  // vista de la socia (app/api/public/documentos-socio), que los oculta.
  return NextResponse.json({ documentos: (data ?? []) as RowDocumentosSocio[] });
}

// Soft-delete. La tabla no tiene policy de UPDATE/DELETE para `authenticated`
// (migración de esquema, comentario de tabla) — la baja SIEMPRE pasa por aquí,
// con service-role, nunca por un UPDATE libre desde el cliente. El archivo en
// Storage NO se borra: `borrado_en` basta para dejar de listarlo/servirlo, y
// conserva el histórico igual que el resto de soft-deletes del repo.
export async function DELETE(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para borrar documentos de una socia.' }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) return errorPeticion('Falta el documento.');

  // Acotado a studio_id de la sesión: nunca fiarse de un id suelto que pueda
  // pertenecer a otro estudio.
  const { data, error } = await admin
    .from('documentos_socio')
    .update({ borrado_en: new Date().toISOString() })
    .eq('id', id)
    .eq('studio_id', sesion.studioId)
    .is('borrado_en', null)
    .select('id')
    .maybeSingle();
  if (error) return errorInterno('documentos-socio:DELETE', error, 'No se ha podido borrar el documento.');
  if (!data) return errorPeticion('Ese documento no existe o ya se ha borrado.', 404);

  return NextResponse.json({ ok: true });
}
