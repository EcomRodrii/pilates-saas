import { NextRequest, NextResponse } from 'next/server';
import { fetchPublicStudioData } from '@/lib/db/supabase-data-admin';
import { usuarioSupabaseConPaso } from '@/lib/auth-server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { respuestaPreflightWidget, conCorsWidget } from '@/lib/cors-widget';
import { nombreCookieAcceso } from '@/lib/publico/acceso-pagina';
import { getThemePublicado } from '@/lib/theme-data';
import { datosEstiloNativaDeTema } from '@/lib/widget/estilo-nativa';

// Datos para las páginas públicas (reserva/portal/kiosk): catálogo público del
// estudio + (si hay socia autenticada) SUS datos.
// SEGURIDAD: la identidad de la socia se deriva del JWT de Supabase Auth, NUNCA
// de {socioId,email} del body. Sin token válido se devuelve solo el catálogo
// (clases, salas, planes…), sin ningún dato personal/financiero.
//
// CORS: solo importa cuando llama el bundle embebible desde el dominio del
// estudio (?slug= en la URL además del body) — el iframe existente es
// same-origin y estas cabeceras no le afectan.
//
// `estiloWidget: true` en el cuerpo (Fase E del constructor de widgets): lo pide
// la integración sin marco en su primera carga, para pintarse con el estilo de
// los widgets de su web en el mismo fotograma que las clases. Se lee aquí, con
// una función pura (`datosEstiloNativaDeTema`), y no dentro de
// `fetchPublicStudioData`: nadie más lo necesita. Sale solo lo que ya pinta
// /reservar para cualquiera: un hex del tema y ids de catálogo, validados.
export async function OPTIONS(req: NextRequest) {
  return respuestaPreflightWidget(req);
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-studio-data', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const body = await req.json().catch(() => null) as { slug?: unknown; liviano?: unknown; estiloWidget?: unknown } | null;
  // Un `slug` que no es texto es un 400, no un 500: el cuerpo lo escribe cualquiera.
  const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';
  if (!slug) {
    return conCorsWidget(req, NextResponse.json({ error: 'Falta el slug del estudio' }, { status: 400 }));
  }
  const liviano = body?.liviano === true;
  const conEstilo = body?.estiloWidget === true;

  // La resolución de estudio por slug (y la comprobación de si este JWT
  // pertenece a una socia de ese estudio) vive DENTRO de fetchPublicStudioData
  // — antes se resolvía aquí Y otra vez ahí, dos round-trips por el mismo
  // slug en cada visita autenticada (auditoría integral 2026-08-21, P0-1).
  // Sin el segundo paso (quien lo tiene activado y aún no lo ha pasado), lo
  // mismo que a una visitante: el catálogo público, que `/reservar` y el widget
  // necesitan igual, y nada personal. `segundoPasoPendiente` es para que la app
  // no lo pinte como «sin sesión».
  const conPaso = await usuarioSupabaseConPaso(req);
  const user = conPaso?.paso === 'ok' ? conPaso.usuario : null;
  const segundoPasoPendiente = conPaso?.paso === 'doble_factor';

  try {
    const data = await fetchPublicStudioData(
      slug,
      user ? { authUserId: user.userId, email: user.email } : undefined,
      // Con la página oculta, sin este pase solo se devuelve el aviso (ver
      // `catalogoPaginaOculta`). Desde la web del estudio no llega nunca.
      { liviano, paseAcceso: (studioId) => req.cookies.get(nombreCookieAcceso(studioId))?.value },
    );
    if (!data) {
      return conCorsWidget(req, NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 }));
    }
    // Con la página oculta no hay `studio` (`catalogoPaginaOculta`): tampoco estilo.
    const studio = (data as { studio?: { id?: unknown; colorPrimario?: unknown } }).studio;
    if (conEstilo && typeof studio?.id === 'string') {
      // Aparte y sin tumbar nada: si el tema no se puede leer, la nativa se
      // pinta como siempre, con las clases igual.
      const tema = await getThemePublicado(studio.id).catch(() => null);
      if (tema) {
        return conCorsWidget(req, NextResponse.json({ ...data, estiloWidget: datosEstiloNativaDeTema(tema, studio.colorPrimario), ...(segundoPasoPendiente ? { segundoPasoPendiente } : {}) }));
      }
    }
    return conCorsWidget(req, NextResponse.json(segundoPasoPendiente ? { ...data, segundoPasoPendiente } : data));
  } catch (err) {
    return conCorsWidget(req, errorInterno('public/studio-data:POST', err, 'No se han podido cargar los datos del estudio.'));
  }
}
