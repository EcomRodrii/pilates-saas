import { NextRequest, NextResponse } from 'next/server';
import { fetchAforoPublico } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// Aforo en vivo de las clases próximas. Existe para que el tic de 5s del portal
// (REFRESCO_ACTIVO_MS) deje de pedir /api/public/studio-data, que devuelve el
// catálogo COMPLETO del estudio más el histórico financiero de la socia — de
// varios MB — doce veces por minuto y por pantalla abierta.
//
// GET y no POST, a diferencia de studio-data, precisamente para poder cachear:
// la respuesta no lleva NINGÚN dato personal (`id, sesion_id, estado, spot_id`,
// lo mismo que ya es público hoy) y es idéntica para cualquier visitante del
// mismo estudio. Con `s-maxage=5` el sondeo de N socias del mismo estudio
// colapsa en una sola lectura al origen cada 5 segundos, así que el coste deja
// de crecer con el número de socias conectadas.
//
// El desfase máximo que introduce la caché es de 5s, el mismo periodo con el
// que ya se sondea — no empeora la frescura que el usuario percibe.
//
// ⚠️ Si algún día esta respuesta pasara a llevar algo por socia, hay que quitar
// la caché compartida ANTES: serviría los datos de una socia a otra. Es el
// mismo motivo por el que /api/theme y /api/layout no se cachean (son de
// sesión y por estudio).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-aforo', { max: 120, windowSeconds: 60 });
  if (limited) return limited;

  const slug = req.nextUrl.searchParams.get('slug')?.trim();
  if (!slug) {
    return NextResponse.json({ error: 'Falta el slug del estudio' }, { status: 400 });
  }

  try {
    const data = await fetchAforoPublico(slug);
    if (!data) {
      return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    }
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10' },
    });
  } catch (err) {
    return errorInterno('public/aforo:GET', err, 'No se ha podido actualizar el aforo.');
  }
}
