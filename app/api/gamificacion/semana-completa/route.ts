import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { rachaUnicaEncendida } from '@/lib/interruptor-por-estudio';
import { pagarSemanaCompletaUnica } from '@/lib/db/supabase-data-admin';

export const dynamic = 'force-dynamic';

// «Semana completa» al pasar lista desde el PANEL (racha única, PR 3.3-B).
//
// Antes el navegador calculaba la racha y pedía el crédito; ahora lo decide el servidor con la MISMA
// función que la app de la alumna y el motor de logros. El navegador solo avisa «he marcado esta
// asistencia» y este endpoint contesta si la racha única está encendida para el estudio:
//   { unica: false }                → el panel sigue con su camino de siempre (interruptor apagado)
//   { unica: true, completa: bool } → el servidor ya ha decidido y pagado si tocaba
// Así la decisión no depende de lo que el navegador sepa del interruptor cuando carga.
//
// Seguridad: sesión de personal con rol de mostrador (los mismos que gestionan clientas); el estudio
// sale de la sesión, la socia de la RESERVA (del estudio, ya `ASISTIDA`), nunca del cuerpo. Una reserva
// ajena o sin marcar responde igual que una que no existe. No concede nada por sí misma: el RPC
// `otorgar_credito_disparador` revalida la asistencia y su UNIQUE impide pagar la semana dos veces.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'gamificacion-semana-completa', { max: 120, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = await req.json().catch(() => null) as { reservaId?: unknown } | null;
  const reservaId = typeof body?.reservaId === 'string' ? body.reservaId : '';
  if (!reservaId) return NextResponse.json({ error: 'Falta la reserva' }, { status: 400 });

  if (!rachaUnicaEncendida(sesion.studioId)) return NextResponse.json({ unica: false });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  try {
    const { data } = await admin.from('reservas').select('socio_id, estado')
      .eq('id', reservaId).eq('studio_id', sesion.studioId).maybeSingle();
    const socioId = (data as { socio_id: string | null; estado: string } | null)?.socio_id ?? null;
    if (!data || !socioId || (data as { estado: string }).estado !== 'ASISTIDA') {
      return NextResponse.json({ error: 'No encontramos esa asistencia.' }, { status: 404 });
    }
    const completa = await pagarSemanaCompletaUnica(admin, sesion.studioId, socioId);
    return NextResponse.json({ unica: true, completa });
  } catch (err) {
    return errorInterno('gamificacion/semana-completa:POST', err, 'No hemos podido revisar la semana. Vuelve a intentarlo.');
  }
}
