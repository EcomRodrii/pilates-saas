import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { modoAutonomiaEfectivo, type RankingItem } from '@/lib/sustituciones/contacto';
import { filtrarYaRechazadas } from '@/lib/sustituciones/recalculo';

// GET /api/sustituciones/clase?sesionId=… — lo que la ficha de UNA clase del
// Calendario necesita para buscarle sustituta (maqueta aprobada, 1-oct-2026):
// el modo con el que trabaja el motor, la búsqueda abierta (si la hay) con a
// quién se ha avisado, y el orden en que se avisa.
//
// El listado de /api/sustituciones (GET) es para la pantalla de Sustituciones y
// trae las últimas 50 con su diagnóstico de equipo y Network: demasiado para
// abrir una clase. Esto lee una.
//
// Sin búsqueda abierta, el orden es una PREVISUALIZACIÓN con la misma función
// que congela el ranking al crear la baja (`rankear_candidatas`): lo que se
// enseña antes de pulsar es lo que el motor va a hacer al pulsar.
//
// Mismo acceso que el listado: el staff, no INSTRUCTOR (ella pide su baja desde
// la app del estudio y nunca ve candidatas ni traza de otras clases).

const ESTADOS_INACTIVOS = '(sin_sustituta,resuelta_fuera,cancelada)';

export async function GET(req: NextRequest) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol === 'INSTRUCTOR') return NextResponse.json({ error: 'No tienes permiso para esto' }, { status: 403 });

  const sesionId = req.nextUrl.searchParams.get('sesionId');
  if (!sesionId) return NextResponse.json({ error: 'Falta la clase (sesionId)' }, { status: 400 });

  const { data: clase, error: errClase } = await admin
    .from('sesiones').select('id').eq('id', sesionId).eq('studio_id', sesion.studioId).maybeSingle();
  if (errClase) return errorInterno('sustituciones:clase:sesion', errClase, 'No se ha podido cargar la clase. Recarga la página.');
  if (!clase) return NextResponse.json({ error: 'Clase no encontrada' }, { status: 404 });

  const [modo, { data: activa, error: errActiva }] = await Promise.all([
    modoAutonomiaEfectivo(admin, sesion.studioId),
    admin.from('sustituciones')
      .select('id, estado, ranking, candidata_actual, instructor_original_id')
      .eq('sesion_id', sesionId).eq('studio_id', sesion.studioId)
      .not('estado', 'in', ESTADOS_INACTIVOS).maybeSingle(),
  ]);
  if (errActiva) return errorInterno('sustituciones:clase:activa', errActiva, 'No se ha podido cargar la búsqueda de sustituta. Recarga la página.');

  let ranking: RankingItem[] = [];
  if (activa) {
    ranking = (Array.isArray(activa.ranking) ? activa.ranking : []) as RankingItem[];
  } else {
    const { data, error } = await admin.rpc('rankear_candidatas', { p_sesion_id: sesionId });
    // Sin previsualización la ficha sigue sirviendo («Buscar sustituta» calcula
    // el orden al pulsar): no se tumba la respuesta por un extra.
    if (error) console.error('[sustituciones:clase:rankear]', error.message);
    else ranking = (Array.isArray(data) ? data : []) as RankingItem[];
  }

  // A quién se ha avisado ya y qué contestó (la traza de la búsqueda abierta).
  // Best-effort, como en el listado: sin traza la ficha sigue funcionando.
  let contactos: { instructorId: string; canal: string | null; estado: string | null; enviadoEn: string | null; respondidoEn: string | null }[] = [];
  if (activa) {
    const { data, error } = await admin.from('sustitucion_contactos')
      .select('instructor_id, canal, estado, enviado_en, respondido_en')
      .eq('studio_id', sesion.studioId).eq('sustitucion_id', activa.id)
      .order('enviado_en', { ascending: true });
    if (error) console.error('[sustituciones:clase:contactos]', error.message);
    else contactos = (data ?? []).map(c => ({
      instructorId: c.instructor_id as string,
      canal: (c.canal as string | null) ?? null,
      estado: (c.estado as string | null) ?? null,
      enviadoEn: (c.enviado_en as string | null) ?? null,
      respondidoEn: (c.respondido_en as string | null) ?? null,
    }));
  }

  // La cola de verdad: sin quien ya dijo que no para esta clase (volver a
  // escribirle es la forma más rápida de que deje de leer los avisos) y sabiendo
  // quién no tiene email (el motor se la salta: no se le puede avisar).
  const rechazadas = contactos.filter(c => c.estado === 'rechazado').map(c => c.instructorId);
  const contactadas = new Set(contactos.map(c => c.instructorId));
  const cola = filtrarYaRechazadas(ranking, rechazadas);
  const ids = cola.map(c => c.instructor_id);
  const conEmail = new Set<string>();
  if (ids.length > 0) {
    const { data } = await admin.from('instructores').select('id, email').eq('studio_id', sesion.studioId).in('id', ids);
    for (const i of data ?? []) if (typeof i.email === 'string' && i.email.trim()) conEmail.add(i.id as string);
  }
  // El primer motivo es siempre «está disponible»: se enseña el primero que
  // diga algo más («ya ha dado esta clase 12 veces»).
  const motivoDe = (r: RankingItem) => r.motivos?.find(m => m !== 'está disponible') ?? r.motivos?.[0] ?? null;
  const siguiente = cola.find(c => !contactadas.has(c.instructor_id) && conEmail.has(c.instructor_id)) ?? null;

  return NextResponse.json({
    modo,
    sustitucion: activa ? {
      id: activa.id as string,
      estado: activa.estado as string,
      instructorOriginalId: (activa.instructor_original_id as string | null) ?? null,
    } : null,
    // Lo que la ficha enseña: nombre y un motivo. Las probabilidades y la
    // compatibilidad se quedan en la pantalla de Sustituciones.
    cola: cola.slice(0, 5).map(r => ({
      instructorId: r.instructor_id,
      nombre: r.nombre ?? null,
      motivo: motivoDe(r),
      sinEmail: !conEmail.has(r.instructor_id),
      avisada: contactadas.has(r.instructor_id),
    })),
    /** A quién se avisaría ahora (con email, sin haber contestado que no ni estar ya avisada). */
    siguienteId: siguiente?.instructor_id ?? null,
    contactos,
  });
}
