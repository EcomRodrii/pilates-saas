import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { SLUG_POPUP } from '@/lib/widgets/boton-vivo';
import { esIdPieza, PARAM_PIEZA } from '@/lib/widgets/pieza';
import { destinoDePieza, entradaDePieza } from '@/lib/widgets/pieza-destino';
import { leerPiezaPublicada } from '@/lib/widgets/pieza-servidor';

// Un código de widget pegado con su id (`/reservar/<slug>?…&w=<id>`) llega aquí
// por el rewrite de next.config.ts, y sale con un 307 a la URL completa de lo
// publicado (lib/widgets/pieza-destino.ts). La página no se entera: lee su URL
// como siempre.
//
// Caché de 60 s en navegador y CDN (más 10 min sirviendo lo anterior mientras se
// refresca), como /api/public/widget-boton: tras «Aplicar en mi web» los
// cambios tardan unos minutos en verse, no horas, y la base de datos solo se
// toca en los fallos de caché. La respuesta no depende de quién visita (no se
// leen cookies), así que la puede compartir la CDN.
//
// Sin pieza (id que no existe, de otro estudio, widget retirado) o con la base
// de datos caída: al widget por defecto, SIN caché. Lo primero, para que un
// «Aplicar» recién hecho no se quede tapado por un «no existe» guardado; lo
// segundo, para no guardar un fallo pasajero.
//
// El destino es siempre relativo y a /reservar/<slug> con el slug validado, y
// la query se reconstruye con URLSearchParams: no hay redirección abierta.

type Contexto = { params: Promise<{ slug: string }> };

const CACHE_OK = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';
const SIN_CACHE = 'no-store';

function ir(destino: string, cache: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: destino, 'Cache-Control': cache } });
}

export async function GET(req: NextRequest, ctx: Contexto) {
  const { slug } = await ctx.params;
  if (!SLUG_POPUP.test(slug)) return new NextResponse(null, { status: 404 });
  const entrante = req.nextUrl.searchParams;
  const id = entrante.get(PARAM_PIEZA);
  if (!esIdPieza(id)) return ir(destinoDePieza(null, slug, entrante), SIN_CACHE);

  // Solo lo notan los fallos de caché. El mismo límite que widget-boton.
  const limitado = await enforceRateLimit(req, 'public-widget-pieza', { max: 120, windowSeconds: 60 });
  if (limitado) return limitado;

  try {
    const pieza = await leerPiezaPublicada(slug, id);
    const entrada = pieza ? entradaDePieza(pieza, slug) : null;
    return ir(destinoDePieza(entrada, slug, entrante), entrada ? CACHE_OK : SIN_CACHE);
  } catch (e) {
    console.error('[public/widget-pieza:GET]', e);
    return ir(destinoDePieza(null, slug, entrante), SIN_CACHE);
  }
}
