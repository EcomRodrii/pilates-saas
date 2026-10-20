import { NextRequest, NextResponse } from 'next/server';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { rachaUnicaEncendida } from '@/lib/interruptor-por-estudio';
import { cargarRachaUnica } from '@/lib/gamificacion/racha-unica-servidor';

// La racha de la alumna con la FUNCIÓN ÚNICA (PR 3.3): la misma que usan el motor de logros y, en
// el PR siguiente, el pago de «semana completa». Con `RACHA_UNICA` apagado para ese estudio contesta
// `{ unica: false }` sin leer nada y la app sigue como siempre.
//
// Misma puerta que `/api/public/historial`: sesión real de socia, identidad del token verificado
// (nunca del cuerpo: la racha cuenta a qué clases va una persona). POST para que el `studioId` no
// viaje en la URL. No muta nada.
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-racha', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const body = await req.json().catch(() => null) as { studioId?: string } | null;
  if (!body?.studioId) return NextResponse.json({ error: 'Falta el estudio' }, { status: 400 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const socioId = await socioAutenticado(user.userId, body.studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (!rachaUnicaEncendida(body.studioId)) return NextResponse.json({ unica: false });

  const admin = getSupabaseAdmin();
  if (!admin) return errorInterno('public/racha:POST', new Error('Service role no configurada'), 'No hemos podido cargar tu racha.');

  try {
    const r = await cargarRachaUnica(admin, body.studioId, socioId);
    // Lo que la app necesita pintar; el detalle semana a semana no sale del servidor.
    return NextResponse.json({
      unica: true,
      semanas: r.semanas,
      mejor: r.mejor,
      esMejor: r.esMejor,
      respiroDisponible: r.respiroDisponible,
      haciaRespiro: r.haciaRespiro,
      semanaEnCurso: r.semanaEnCurso,
    });
  } catch (err) {
    return errorInterno('public/racha:POST', err, 'No hemos podido cargar tu racha. Vuelve a intentarlo.');
  }
}
