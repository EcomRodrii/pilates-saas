import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowSocioCompaneras } from '@/lib/db-types';

// Social graph "compañeras de clase" — Community & Messaging OS, última pieza
// de P2. Sin política RLS para `authenticated` (la migración en paralelo no
// añade ninguna): toda esta ruta usa service-role y comprueba a mano, igual
// que el resto de `app/api/public/mensajeria/`, que la socia de la sesión es
// quien dice ser antes de leer o escribir nada.

// Busca la fila entre dos socias sin importar quién fue `solicitante_id` la
// primera vez — mismo criterio least/greatest que la migración usa para el
// índice único, para no depender de qué lado del par consulta cada llamada.
async function buscarRelacion(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  studioId: string, socioA: string, socioB: string,
): Promise<RowSocioCompaneras | null> {
  const { data } = await admin
    .from('socio_companeras')
    .select('*')
    .eq('studio_id', studioId)
    .or(
      `and(solicitante_id.eq.${socioA},destinataria_id.eq.${socioB}),`
      + `and(solicitante_id.eq.${socioB},destinataria_id.eq.${socioA})`,
    )
    .maybeSingle();
  return (data as RowSocioCompaneras | null) ?? null;
}

// Envía una solicitud de "compañeras". `solicitanteSocioId` sale SIEMPRE de
// `socioAutenticado`, nunca del body — mismo criterio que abrir conversación
// o marcar favorito.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-social-companeras', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as {
    studioId?: string; destinatariaSocioId?: string;
  } | null;
  if (!body?.studioId || !body?.destinatariaSocioId) {
    return errorPeticion('Faltan datos para enviar la solicitud.');
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const solicitanteId = await socioAutenticado(user.userId, body.studioId);
  if (!solicitanteId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (body.destinatariaSocioId === solicitanteId) {
    return errorPeticion('No puedes enviarte una solicitud a ti misma.');
  }

  // La destinataria tiene que ser una socia real del MISMO estudio — sin esta
  // comprobación, el id del body podría apuntar a una socia de otro estudio.
  const { data: destinataria } = await admin
    .from('socios')
    .select('id')
    .eq('id', body.destinatariaSocioId)
    .eq('studio_id', body.studioId)
    .maybeSingle();
  if (!destinataria) return errorPeticion('Esa socia no existe en este estudio.', 404);

  const existente = await buscarRelacion(admin, body.studioId, solicitanteId, body.destinatariaSocioId);
  if (existente) {
    // Bloqueada por la otra parte: mensaje genérico, sin revelar que hay un
    // bloqueo explícito detrás — mismo principio que el resto de esta pieza.
    if (existente.estado === 'bloqueada') {
      return errorPeticion('No se puede enviar la solicitud.', 403);
    }
    // pendiente/aceptada ya existe: no duplicar, devolver el estado actual.
    return NextResponse.json({ id: existente.id, estado: existente.estado, yaExistia: true });
  }

  const { data: creada, error } = await admin
    .from('socio_companeras')
    .insert({
      studio_id: body.studioId,
      solicitante_id: solicitanteId,
      destinataria_id: body.destinatariaSocioId,
      estado: 'pendiente',
    })
    .select('id, estado')
    .single();
  if (error) return errorInterno('public/social/companeras:POST', error, 'No se ha podido enviar la solicitud.');

  return NextResponse.json({ id: creada.id as string, estado: creada.estado as string, yaExistia: false });
}

// Lista las relaciones de la socia autenticada, separadas por estado. Una
// relación `bloqueada` por la OTRA parte no debe aparecer aquí en absoluto
// (ni como pendiente ni de ninguna forma) para no revelar el bloqueo; una
// bloqueada POR MÍ sí se lista, para poder desbloquear en el futuro si se
// construye esa pieza. `bloqueada_por` es quien ejecutó el bloqueo —
// `solicitante_id`/`destinataria_id` NUNCA cambian de significado, son fijos
// desde el alta de la solicitud original.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { data, error } = await admin
    .from('socio_companeras')
    .select('*')
    .eq('studio_id', studioId)
    .or(`solicitante_id.eq.${socioId},destinataria_id.eq.${socioId}`);
  if (error) return errorInterno('public/social/companeras:GET', error, 'No se han podido cargar tus compañeras.');

  const filas = (data ?? []) as RowSocioCompaneras[];

  // Resuelto en SERVIDOR, nunca por el cliente: la socia del portal no tiene
  // JWT `authenticated` de Postgres (su sesión vive en `supabasePortal.auth`,
  // nunca sincronizada con el cliente `supabase` normal), así que
  // `useStudio().socios` está vacío para ella — RLS de `socios_lectura`
  // devuelve cero filas sin `current_studio_id()` resuelto. Mismo criterio ya
  // aplicado en `clase/[sesionId]/route.ts` (nombre resuelto server-side).
  const otrasPartesIds = Array.from(new Set(
    filas.map(f => (f.solicitante_id === socioId ? f.destinataria_id : f.solicitante_id)),
  ));
  const { data: otrasPartes } = otrasPartesIds.length > 0
    ? await admin.from('socios').select('id, nombre, apellidos').in('id', otrasPartesIds)
    : { data: [] as { id: string; nombre: string; apellidos: string | null }[] };
  const nombrePorId = new Map((otrasPartes ?? []).map(s => [s.id, `${s.nombre} ${s.apellidos ?? ''}`.trim()]));

  const conNombre = filas.map(f => {
    const otraId = f.solicitante_id === socioId ? f.destinataria_id : f.solicitante_id;
    return { ...f, otraParteNombre: nombrePorId.get(otraId) ?? 'Una socia' };
  });

  const pendientesRecibidas = conNombre.filter(f => f.estado === 'pendiente' && f.destinataria_id === socioId);
  const pendientesEnviadas = conNombre.filter(f => f.estado === 'pendiente' && f.solicitante_id === socioId);
  const aceptadas = conNombre.filter(f => f.estado === 'aceptada');
  // Solo bloqueos que YO decidí (soy quien puede desbloquear) — un bloqueo de
  // la otra parte sobre mí queda fuera por completo, ni siquiera como
  // categoría vacía visible.
  const bloqueadasPorMi = conNombre.filter(f => f.estado === 'bloqueada' && f.bloqueada_por === socioId);

  return NextResponse.json({ pendientesRecibidas, pendientesEnviadas, aceptadas, bloqueadasPorMi });
}
