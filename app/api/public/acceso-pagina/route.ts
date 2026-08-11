import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { verificarClave, firmarAcceso, nombreCookieAcceso } from '@/lib/publico/acceso-pagina';

// POST /api/public/acceso-pagina → cambia una clave correcta por un pase
// firmado, guardado en cookie, que abre /reservar/{slug} mientras está oculta.
//
// ⚠️ **Con límite de intentos, y no es opcional.** Una clave que una
// propietaria elige para enseñarle la página a una amiga va a ser corta y
// adivinable; sin límite, probarlas todas es cuestión de minutos. 10 intentos
// cada 10 minutos por IP y estudio: sobra para quien se equivoca tecleando y
// no le sirve a quien prueba a lo bruto.
const INTENTOS = { max: 10, windowSeconds: 600 };

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as { slug?: unknown; clave?: unknown } | null;
  if (!body || typeof body.slug !== 'string' || typeof body.clave !== 'string')
    return NextResponse.json({ error: 'Petición inválida' }, { status: 400 });

  const limitada = await enforceRateLimit(req, 'acceso-pagina', INTENTOS, body.slug);
  if (limitada) return limitada;

  try {
    const admin = getSupabaseAdmin();
    if (!admin) return NextResponse.json({ error: 'No disponible' }, { status: 503 });
    const { data } = await admin
      .from('studios')
      .select('id, pagina_publica_oculta, pagina_publica_clave_hash')
      .eq('slug', body.slug)
      .maybeSingle();

    // ⚠️ **La misma respuesta para «no existe», «no está oculta» y «clave
    // equivocada».** Distinguirlas convertiría este endpoint en un buscador de
    // slugs y en un chivato de qué estudios están preparando su página.
    const ok = data?.pagina_publica_oculta === true
      && verificarClave(body.clave, data.pagina_publica_clave_hash as string | null);
    if (!ok) return NextResponse.json({ error: 'La clave no es correcta.' }, { status: 401 });

    const res = NextResponse.json({ ok: true });
    res.cookies.set(nombreCookieAcceso(data.id as string), firmarAcceso(data.id as string), {
      // HttpOnly: el pase no lo necesita ningún script de la página, y así un
      // XSS en el portal no puede llevárselo.
      httpOnly: true,
      // `lax` y no `strict`: el caso normal es llegar desde el enlace que te
      // han mandado por WhatsApp, y con `strict` la primera visita desde fuera
      // no mandaría la cookie y volvería a pedir la clave.
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
    });
    return res;
  } catch (e) {
    return errorInterno('acceso-pagina:comprobar', e,
      'No se ha podido comprobar la clave. Vuelve a intentarlo.');
  }
}
