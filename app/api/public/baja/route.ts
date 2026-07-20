import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarTokenInstructora } from '@/lib/sustituciones/token';
import { enlaceRevocado } from '@/lib/sustituciones/enlaces';
import { crearBaja } from '@/lib/sustituciones/baja';

// Endpoint PÚBLICO (sin login): la instructora llega por deep link firmado y
// avisa de que NO puede dar una de sus clases. El token ES la autorización
// (scope 'reportar_baja', ligado a instructorId+studioId). Escritura con
// service-role, pero SIEMPRE acotada al instructor_id que viaja firmado en el
// token → una instructora solo puede darse de baja de SUS propias clases.
//
// Espejo de app/api/public/disponibilidad: mismo patrón de rate-limit, misma
// validación de pertenencia al estudio, mismos códigos de error.

// Cuántas clases suyas mostramos. Ventana amplia (30 días) porque una baja se
// avisa tanto "mañana no puedo" como "la semana que viene tengo médico".
const DIAS_VENTANA = 30;
const MAX_CLASES = 40;

// Estados que se consideran "activos" (ya hay una baja en curso para esa clase).
const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

// GET ?token=... → sus próximas clases, marcando las que ya tienen baja avisada.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-baja-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const token = req.nextUrl.searchParams.get('token');
  const claim = verificarTokenInstructora(token, 'reportar_baja');
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (await enlaceRevocado(admin, claim.instructorId, 'reportar_baja', token!)) {
    return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });
  }

  const datos = await cargarClases(admin, claim.instructorId, claim.studioId);
  if (!datos) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  return NextResponse.json(datos);
}

// POST { token, sesionId, motivo? } → registra la baja y arranca el motor.
export async function POST(req: NextRequest) {
  // Más estricto que el GET: crear bajas tiene efectos (emails a candidatas).
  const limited = await enforceRateLimit(req, 'public-baja-crear', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    { token?: string; sesionId?: unknown; motivo?: unknown } | null;
  const claim = verificarTokenInstructora(body?.token, 'reportar_baja');
  if (!claim) return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });

  const sesionId = typeof body?.sesionId === 'string' ? body.sesionId : null;
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase' }, { status: 400 });
  const motivo = typeof body?.motivo === 'string' ? body.motivo : null;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  if (await enlaceRevocado(admin, claim.instructorId, 'reportar_baja', body!.token!)) {
    return NextResponse.json({ error: 'Enlace no válido o caducado' }, { status: 401 });
  }

  // Comprobación defensiva: la instructora del token pertenece a ese estudio.
  const { data: instructora } = await admin
    .from('instructores').select('id')
    .eq('id', claim.instructorId).eq('studio_id', claim.studioId).maybeSingle();
  if (!instructora) return NextResponse.json({ error: 'Instructora no encontrada' }, { status: 404 });

  // Mismo motor que el panel. `soloSiInstructorEs` es la guardia clave: la clase
  // tiene que ser suya, no vale mandar el id de la clase de otra compañera.
  const r = await crearBaja(admin, {
    studioId: claim.studioId,
    sesionId,
    motivo,
    origen: 'instructora',
    soloSiInstructorEs: claim.instructorId,
  });

  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });

  // No devolvemos la sustitución entera: contiene el ranking con nombres de
  // compañeras y sus motivos de scoring. La instructora no necesita ver eso —
  // y no es asunto suyo quién la va a cubrir hasta que el estudio lo decida.
  return NextResponse.json({ ok: true, yaAvisada: r.yaExistia });
}

async function cargarClases(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  instructorId: string,
  studioId: string,
) {
  const { data: instructora } = await admin
    .from('instructores').select('nombre, studio_id')
    .eq('id', instructorId).eq('studio_id', studioId).maybeSingle();
  if (!instructora) return null;

  const { data: estudio } = await admin
    .from('studios').select('nombre').eq('id', studioId).maybeSingle();

  const ahora = new Date();
  const hasta = new Date(ahora.getTime() + DIAS_VENTANA * 24 * 60 * 60 * 1000);

  const { data: sesiones } = await admin
    .from('sesiones')
    .select('id, inicio, fin, tipo_clase_id, cancelada')
    .eq('studio_id', studioId)
    .eq('instructor_id', instructorId)
    .eq('cancelada', false)
    .gte('inicio', ahora.toISOString())
    .lte('inicio', hasta.toISOString())
    .order('inicio', { ascending: true })
    .limit(MAX_CLASES);

  const lista = sesiones ?? [];

  // Nombres de los tipos de clase (una consulta, no una por sesión).
  const tipoIds = Array.from(new Set(lista.map((s) => s.tipo_clase_id).filter(Boolean))) as string[];
  const { data: tipos } = tipoIds.length
    ? await admin.from('tipos_clase').select('id, nombre').in('id', tipoIds)
    : { data: [] as { id: string; nombre: string }[] };
  const nombrePorTipo = new Map((tipos ?? []).map((t) => [t.id, t.nombre]));

  // Clases suyas que YA tienen una baja en curso → se muestran marcadas, no
  // ocultas: si no la ve, vuelve a avisar por WhatsApp "por si acaso", que es
  // justo el reflejo que este enlace existe para quitar.
  const sesionIds = lista.map((s) => s.id);
  const { data: activas } = sesionIds.length
    ? await admin.from('sustituciones').select('sesion_id')
        .in('sesion_id', sesionIds).not('estado', 'in', ESTADOS_INACTIVOS)
    : { data: [] as { sesion_id: string }[] };
  const yaAvisadas = new Set((activas ?? []).map((s) => s.sesion_id));

  return {
    instructorNombre: instructora.nombre,
    estudioNombre: estudio?.nombre ?? '',
    clases: lista.map((s) => ({
      id: s.id,
      inicio: s.inicio,
      fin: s.fin,
      nombre: nombrePorTipo.get(s.tipo_clase_id as string) ?? 'Clase',
      yaAvisada: yaAvisadas.has(s.id),
    })),
  };
}
