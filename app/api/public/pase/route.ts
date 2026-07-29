import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolveStudioIdBySlug, socioAutenticado } from '@/lib/supabase-data';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { firmarPase, codigoCorto, paseVigente, minutosParaActivarse, ventanaDelPase } from '@/lib/pase-acceso';

// POST /api/public/pase → el pase de acceso de la clienta para su próxima clase.
//
// Devuelve un token firmado que caduca en 2 minutos; la app lo vuelve a pedir
// mientras la hoja está abierta. Esa caducidad es el punto: sin ella, una
// captura reenviada por WhatsApp abre la puerta del estudio, porque validar el
// pase dispara Kisi.
//
// El pase NO marca nada. Enseñarlo no es asistir — eso lo decide el estudio al
// leerlo (POST /api/checkin/pase). Es la misma regla que obligó a ponerle token
// de dispositivo al kiosko: hacer check-in otorga créditos canjeables.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-pase', { max: 60, windowSeconds: 60 });
  if (limited) return limited;

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { slug?: string } | null;
  const slug = body?.slug?.trim();
  if (!slug) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('public/pase', new Error('sin service-role'), 'No hemos podido preparar tu pase.');

  try {
    const studioId = await resolveStudioIdBySlug(slug);
    if (!studioId) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

    // La identidad sale del JWT, nunca del body: el id de socia es público
    // (fetchPublicStudioData lo expone), así que aceptarlo del cliente sería
    // dejar que cualquiera pidiera el pase de otra persona.
    const socioId = await socioAutenticado(user.userId, studioId);
    if (!socioId) return NextResponse.json({ error: 'No eres clienta de este estudio' }, { status: 403 });

    const ahora = new Date();
    // Solo miramos hacia delante y un poco hacia atrás: una reserva de la
    // semana pasada no tiene pase, y la de dentro de tres días tampoco.
    const desde = new Date(ahora.getTime() - 60 * 60_000).toISOString();
    const hasta = new Date(ahora.getTime() + 24 * 60 * 60_000).toISOString();

    const { data: filas, error } = await admin
      .from('reservas')
      .select('id, sesion_id, estado, sesiones!inner(id, inicio, cancelada, tipo_clase_id, sala_id, instructor_id)')
      .eq('studio_id', studioId)
      .eq('socio_id', socioId)
      .in('estado', ['CONFIRMADA', 'ASISTIDA'])
      .gte('sesiones.inicio', desde)
      .lte('sesiones.inicio', hasta)
      .order('inicio', { referencedTable: 'sesiones', ascending: true })
      .limit(1);
    if (error) return errorInterno('public/pase', error, 'No hemos podido preparar tu pase.');

    // El cliente de Supabase tipa las uniones como array aunque `!inner` con
    // clave foránea única devuelva un objeto. Se pasa por `unknown` a propósito.
    const fila = filas?.[0] as unknown as
      | { id: string; estado: string; sesiones: { inicio: string; cancelada: boolean } }
      | undefined;
    if (!fila || fila.sesiones.cancelada) {
      return NextResponse.json({ hayPase: false as const });
    }

    const inicio = new Date(fila.sesiones.inicio);
    const vigente = paseVigente(inicio, ahora);

    // Fuera de la ventana se responde igual, con `vigente: false` y los minutos
    // que faltan: la app enseña "tu pase se activa a las 17:30" en vez de un
    // hueco vacío que no explica nada.
    return NextResponse.json({
      hayPase: true as const,
      vigente,
      yaAsistida: fila.estado === 'ASISTIDA',
      minutosParaActivarse: minutosParaActivarse(inicio, ahora),
      seActivaA: ventanaDelPase(inicio).desde.toISOString(),
      inicio: fila.sesiones.inicio,
      // El token solo se emite dentro de la ventana. Antes no hace falta y sería
      // regalar dos minutos de validez a quien mire el pase con antelación.
      token: vigente ? firmarPase(fila.id, studioId, ahora.getTime()) : null,
      codigo: vigente ? codigoCorto(fila.id) : null,
    });
  } catch (err) {
    return errorInterno('public/pase:POST', err, 'No hemos podido preparar tu pase.');
  }
}
