import { NextRequest, NextResponse } from 'next/server';
import { getStudioSeoResultado, slugActualDeDireccionAntigua } from '@/lib/studio-seo';
import { leerWidgetWeb } from '@/lib/reservar/estilo-web-tipos';
import { baseEstiloWeb, botonDeLaVentana } from '@/lib/reservar/estilo-web';
import { SLUG_POPUP, leerBotonVivo } from '@/lib/widgets/boton-vivo';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';

// El botón que abre la ventana de un estudio, como se ve HOY (Fase D del
// constructor de widgets). Lo pide `widget-popup.js` desde la web del estudio
// para pintar el botón del método «Popup» con el estilo de sus widgets, sin
// volver a pegar el código (lib/widgets/boton-vivo.ts).
//
// Solo sale lo que ya es público: dos hex y el nombre de unas esquinas, los
// mismos que pinta el CSS de /reservar/<slug> para cualquiera. Ni el id del
// estudio ni nada suyo; y la salida pasa por `leerBotonVivo`, el MISMO
// validador que usa el script antes de escribir CSS en su web.
//
// ⚠️ CORS `*` y sin credenciales, a diferencia de /api/public/studio-data (lista
// blanca de lib/cors-widget.ts): el popup no pide autorizar la web en la que se
// pega, así que una lista blanca dejaría el botón con su respaldo en casi todas.
// Es un GET simple, sin cabeceras propias: no hay preflight ni hace falta OPTIONS.
//
// Caché de 60 s en navegador y CDN (más 10 min sirviendo lo anterior mientras
// se refresca): tras «Aplicar» el botón tarda unos minutos, no horas, y la base
// de datos solo se toca en los fallos de caché. Los errores no se guardan: un
// 404 cacheado dejaría el respaldo después de crear el estudio o arreglar un
// fallo. La misma respuesta sirve a cualquier visitante, así que nada por
// persona puede entrar aquí sin quitar antes la caché compartida.
//
// Aceptado a propósito: si falla la lectura de su tema, `getThemePublicado` cae
// al tema por defecto sin decirlo, y esto puede servir (y cachear) durante ese
// minuto el botón por defecto en vez del suyo. Es un color; lo demás lo cubre
// el respaldo que lleva el propio código.

const PUBLICO = { 'Access-Control-Allow-Origin': '*' } as const;
const CACHE_OK = 'public, max-age=60, s-maxage=60, stale-while-revalidate=600';
const SIN_CACHE = 'no-store';

function json(cuerpo: unknown, status: number, cache: string): NextResponse {
  return NextResponse.json(cuerpo, { status, headers: { ...PUBLICO, 'Cache-Control': cache } });
}

export async function GET(req: NextRequest) {
  // El mismo límite que /api/public/aforo. Solo lo notan los fallos de caché, y
  // su 429 va sin CORS a propósito: el script lo trata como cualquier otro fallo
  // y deja el respaldo.
  const limitado = await enforceRateLimit(req, 'public-widget-boton', { max: 120, windowSeconds: 60 });
  if (limitado) return limitado;

  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  if (!SLUG_POPUP.test(slug)) return json({ error: 'Slug no válido' }, 400, SIN_CACHE);

  try {
    let r = await getStudioSeoResultado(slug);
    // Una dirección que el estudio ya cambió sigue sirviendo, como en
    // /reservar (su layout redirige): el código pegado lleva la de entonces.
    if (r.estudio === null && r.causa === 'no-existe') {
      const actual = await slugActualDeDireccionAntigua(slug);
      if (actual) r = await getStudioSeoResultado(actual);
    }
    if (r.estudio === null) {
      return r.causa === 'no-existe'
        ? json({ error: 'Estudio no encontrado' }, 404, SIN_CACHE)
        : json({ error: 'No se ha podido leer el botón.' }, 503, SIN_CACHE);
    }
    // La misma base que /reservar (app/reservar/[slug]/layout.tsx): no hay dos
    // caminos que puedan separarse.
    const base = baseEstiloWeb(r.estudio.colorPrimario, r.estudio.aparienciaApp);
    const boton = leerBotonVivo(botonDeLaVentana(leerWidgetWeb(r.estudio.widgetWeb), base));
    // No debería pasar (lo ata lib/reservar/estilo-web.test.ts); si pasa, mejor
    // el respaldo que un botón a medias.
    if (!boton) return json({ error: 'No se ha podido leer el botón.' }, 500, SIN_CACHE);
    return json(boton, 200, CACHE_OK);
  } catch (e) {
    const res = errorInterno('public/widget-boton:GET', e, 'No se ha podido leer el botón.');
    res.headers.set('Cache-Control', SIN_CACHE);
    for (const [k, v] of Object.entries(PUBLICO)) res.headers.set(k, v);
    return res;
  }
}
