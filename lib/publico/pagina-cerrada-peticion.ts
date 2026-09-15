import { NextResponse, type NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { nombreCookieAcceso, puertaPublica, respuestaPuertaPublica } from '@/lib/publico/acceso-pagina';

/**
 * Cierra una puerta pública que escribe (reservar, comprar, alta…) si el
 * estudio tiene la página oculta y la petición no trae el pase de su clave
 * vigente. Devuelve la respuesta a mandar, o `null` si puede seguir.
 *
 * ⚠️ Va ANTES de la primera escritura o llamada a Stripe de cada ruta: lo
 * comprueba `lib/publico/puertas-publicas.test.ts` leyendo el código.
 *
 * El pase es la cookie HttpOnly que pone `/api/public/acceso-pagina`, así que
 * solo llega desde las páginas de Tentare (mismo origen). El calendario
 * incrustado en la web del estudio no la manda: con la página oculta, desde
 * ahí no se reserva. Es lo decidido.
 *
 * La decisión vive en `puertaPublica` (pura, probada); esto solo lee la fila y
 * la cookie.
 */
export async function paginaCerradaParaPeticion(req: NextRequest, studioId: string): Promise<NextResponse | null> {
  const admin = getSupabaseAdmin();
  // Sin cliente de administración no se puede leer: lo mismo que un fallo de
  // lectura, y ninguna de estas rutas escribe sin él.
  const lectura = admin
    ? await admin
      .from('studios')
      .select('pagina_publica_oculta, pagina_publica_clave_hash')
      .eq('id', studioId)
      .maybeSingle()
      .then((r) => ({ data: r.data, error: r.error }), (e: unknown) => ({ data: null, error: e ?? 'error' }))
    : { data: null, error: 'sin service-role' };
  const respuesta = respuestaPuertaPublica(puertaPublica({
    lectura,
    pase: req.cookies.get(nombreCookieAcceso(studioId))?.value,
    studioId,
  }));
  return respuesta ? NextResponse.json(respuesta.body, { status: respuesta.status }) : null;
}
