import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { uid } from '@/lib/utils';
import type { RowSocioCompaneras } from '@/lib/db-types';
import {
  ESTADOS_CLASE_COMPARTIDA, compartenClase, esIdSociaValido, inicioVentanaClaseCompartida,
  nombreOtraParte, puedeSolicitarCompanera,
} from '@/lib/social-companeras-reglas';

// Social graph "compañeras de clase" — Community & Messaging OS, última pieza
// de P2. Sin política RLS para `authenticated` (la migración en paralelo no
// añade ninguna): toda esta ruta usa service-role y comprueba a mano, igual
// que el resto de `app/api/public/mensajeria/`, que la socia de la sesión es
// quien dice ser antes de leer o escribir nada.
//
// A quién se puede solicitar y qué nombre se devuelve lo deciden las reglas de
// `lib/social-companeras-reglas.ts`.

// Una sola respuesta para "no existe", "no es elegible" y "hay un bloqueo":
// distinguirlas convierte el POST en un buscador de socias del estudio.
const NO_SE_PUEDE = 'No se puede enviar la solicitud.';

// Busca la fila entre dos socias sin importar quién fue `solicitante_id` la
// primera vez — mismo criterio least/greatest que la migración usa para el
// índice único, para no depender de qué lado del par consulta cada llamada.
// `socioB` tiene que llegar validado (`esIdSociaValido`): va dentro del `.or()`.
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

type FilaReservaCompartida = {
  socio_id: string | null;
  sesion_id: string | null;
  estado: string;
  sesiones: { fin: string | null } | { fin: string | null }[] | null;
};

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
  if (!esIdSociaValido(body.destinatariaSocioId)) return errorPeticion(NO_SE_PUEDE, 403);
  const destinatariaId = body.destinatariaSocioId;

  // La destinataria tiene que ser una socia real del MISMO estudio. Si no lo
  // es, la misma negativa que a una socia no elegible.
  const { data: destinataria, error: errorDestinataria } = await admin
    .from('socios')
    .select('id, visible_en_clase')
    .eq('id', destinatariaId)
    .eq('studio_id', body.studioId)
    .maybeSingle();
  if (errorDestinataria) {
    return errorInterno('public/social/companeras:POST', errorDestinataria, 'No se ha podido enviar la solicitud.');
  }
  if (!destinataria) return errorPeticion(NO_SE_PUEDE, 403);

  const existente = await buscarRelacion(admin, body.studioId, solicitanteId, destinatariaId);
  if (existente) {
    // Bloqueada por la otra parte: mensaje genérico, sin revelar que hay un
    // bloqueo explícito detrás — mismo principio que el resto de esta pieza.
    if (existente.estado === 'bloqueada') return errorPeticion(NO_SE_PUEDE, 403);
    // pendiente/aceptada ya existe (las dos son parte): no duplicar, devolver
    // el estado actual.
    return NextResponse.json({ id: existente.id, estado: existente.estado, yaExistia: true });
  }

  const visibleEnClase = destinataria.visible_en_clase === true;
  let comparten = false;
  if (!visibleEnClase) {
    const ahora = new Date();
    const { data: reservas, error: errorReservas } = await admin
      .from('reservas')
      .select('socio_id, sesion_id, estado, sesiones!inner(fin)')
      .eq('studio_id', body.studioId)
      .in('socio_id', [solicitanteId, destinatariaId])
      .in('estado', [...ESTADOS_CLASE_COMPARTIDA])
      .gte('sesiones.fin', inicioVentanaClaseCompartida(ahora));
    if (errorReservas) {
      return errorInterno('public/social/companeras:POST', errorReservas, 'No se ha podido enviar la solicitud.');
    }
    comparten = compartenClase(
      ((reservas ?? []) as unknown as FilaReservaCompartida[]).map(fila => {
        const sesion = Array.isArray(fila.sesiones) ? fila.sesiones[0] : fila.sesiones;
        return { socioId: fila.socio_id, sesionId: fila.sesion_id, estado: fila.estado, finSesion: sesion?.fin ?? null };
      }),
      solicitanteId, destinatariaId, ahora,
    );
  }

  if (!puedeSolicitarCompanera({
    solicitanteId,
    destinataria: { id: destinatariaId, visibleEnClase },
    compartenClase: comparten,
  })) {
    return errorPeticion(NO_SE_PUEDE, 403);
  }

  const { data: creada, error } = await admin
    .from('socio_companeras')
    .insert({
      // `socio_companeras.id` es `text primary key` SIN default en la BD (ver
      // 20260826203011_socio_companeras_esquema_rls.sql): el id lo genera
      // siempre el servidor, igual que `com-${uid()}` en comunidad/comentarios
      // o `msg-${...}` en mensajería. Sin esta línea el INSERT muere con 23502
      // y la pieza entera de compañeras es inalcanzable.
      id: `comp-${uid()}`,
      studio_id: body.studioId,
      solicitante_id: solicitanteId,
      destinataria_id: destinatariaId,
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
  const limited = await enforceRateLimit(req, 'public-social-companeras-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

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
    ? await admin.from('socios').select('id, nombre, apellidos, visible_en_clase').eq('studio_id', studioId).in('id', otrasPartesIds)
    : { data: [] as { id: string; nombre: string; apellidos: string | null; visible_en_clase: boolean | null }[] };
  const sociaPorId = new Map((otrasPartes ?? []).map(s => [s.id as string, s]));

  const conNombre = filas.map(f => {
    const otraEsSolicitante = f.solicitante_id !== socioId;
    const otra = sociaPorId.get(otraEsSolicitante ? f.solicitante_id : f.destinataria_id);
    return {
      ...f,
      otraParteNombre: nombreOtraParte({
        estado: f.estado,
        otraEsSolicitante,
        otra: otra
          ? { nombre: otra.nombre as string | null, apellidos: otra.apellidos as string | null, visibleEnClase: otra.visible_en_clase === true }
          : null,
      }),
    };
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
