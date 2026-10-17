import { NextRequest } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { elegirOrigen } from '@/lib/widgets/web-real/servicio';
import { cabecerasDelMarco, htmlDelMarco } from '@/lib/widgets/web-real/marco-html';
import { verificarPermisoWebReal } from '@/lib/widgets/web-real/token';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// El documento que enseña la web REAL de un estudio en la vista previa de «Tu
// web» v2: su web a pantalla completa en un iframe, y nada más. Lo enmarca el
// propio panel (mismo origen), con el widget dibujado encima.
//
// Se pide con un permiso firmado (`?t=`) y no con la sesión porque un <iframe src>
// no puede mandar el `Authorization: Bearer` (lib/widgets/web-real/token.ts). Y
// se sirve aparte de cualquier pantalla del panel a propósito: su `frame-src`
// lo fija ESTE servidor para esta petición, con el origen autorizado del estudio,
// y no toca ninguna cabecera del resto del panel (lib/widgets/web-real/marco-html.ts).
//
// Queda FUERA del `matcher` de proxy.ts, como tema-publicado: el proxy pondría
// `frame-ancestors 'none'` y el panel no podría enmarcarlo; esta ruta pone la suya.
// ─────────────────────────────────────────────────────────────────────────────

/** Una página de error que solo puede enmarcar el panel (nunca una web ajena). */
function prohibido(): Response {
  return new Response('Esta vista previa ha caducado. Vuelve a abrir la vista previa desde el panel.', {
    status: 403,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Security-Policy': "frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  const permiso = verificarPermisoWebReal(req.nextUrl.searchParams.get('t'));
  if (!permiso) return prohibido();

  const admin = getSupabaseAdmin();
  if (!admin) return prohibido();
  // Que esa web SIGA siendo la autorizada del estudio: si la propietaria la quitó o la cambió después de pedir el
  // permiso, el permiso ya no vale. El origen que se enmarca sale de la base de datos, no del navegador.
  const { data: studio } = await admin
    .from('studios').select('widget_dominios_autorizados').eq('id', permiso.studioId).maybeSingle();
  const dominios = Array.isArray(studio?.widget_dominios_autorizados)
    ? (studio.widget_dominios_autorizados as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];
  if (elegirOrigen(dominios) !== permiso.origen) return prohibido();

  return new Response(htmlDelMarco(permiso.origen), { status: 200, headers: cabecerasDelMarco(permiso.origen) });
}
