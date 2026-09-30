import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { SLUG_POPUP } from '@/lib/widgets/boton-vivo';
import { esIdPieza } from '@/lib/widgets/pieza';
import { entradaDePieza, paresDePiezaNativa } from '@/lib/widgets/pieza-destino';
import { leerPiezaPublicada } from '@/lib/widgets/pieza-servidor';

// Lo publicado de un widget pegado SIN MARCO con su id (`data-widget="<id>"`):
// los `data-*` que el bundle (app/widget-bundle/main.tsx) pone encima de los
// suyos antes de montarse (`datasetConPares`, lib/widgets/pieza.ts). Los otros
// métodos no pasan por aquí: van por el 307 de ./[slug]/route.ts.
//
// Solo sale lo que ya llevaría el código congelado de ese widget (ids de
// catálogo, colores, la etiqueta), nunca el jsonb guardado.
//
// ⚠️ CORS `*` y sin credenciales, como /api/public/widget-boton: lo pide la web
// del estudio, y una lista blanca dejaría sin lo publicado a cualquier web que
// no esté autorizada (el widget se pintaría con su contenido por defecto). Es
// un GET simple, sin cabeceras propias: no hay preflight.
//
// Caché: la misma que el 307, por el mismo motivo. Los errores y el «no
// existe» no se guardan.

const PUBLICO = { 'Access-Control-Allow-Origin': '*' } as const;
const CACHE_OK = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';
const SIN_CACHE = 'no-store';

function json(cuerpo: unknown, status: number, cache: string): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { ...PUBLICO, 'Cache-Control': cache } });
}

export async function GET(req: NextRequest) {
  const limitado = await enforceRateLimit(req, 'public-widget-pieza', { max: 120, windowSeconds: 60 });
  if (limitado) return limitado;

  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  const id = req.nextUrl.searchParams.get('id');
  if (!SLUG_POPUP.test(slug) || !esIdPieza(id)) return json({ error: 'Petición no válida' }, 400, SIN_CACHE);

  try {
    const pieza = await leerPiezaPublicada(slug, id);
    const entrada = pieza ? entradaDePieza(pieza, slug) : null;
    if (!entrada) return json({ error: 'Widget no encontrado' }, 404, SIN_CACHE);
    return json({ pares: paresDePiezaNativa(entrada) }, 200, CACHE_OK);
  } catch (e) {
    const res = errorInterno('public/widget-pieza:GET', e, 'No se ha podido leer el widget.');
    res.headers.set('Cache-Control', SIN_CACHE);
    for (const [k, v] of Object.entries(PUBLICO)) res.headers.set(k, v);
    return res;
  }
}
