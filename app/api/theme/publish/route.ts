import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import {
  ConflictoTheme,
  MENSAJE_CONFLICTO_THEME,
  MENSAJE_FAVICON_AJENO,
  faviconPermitido,
  publicarCamposTheme,
  publicarTheme,
  type ResultadoPublicacion,
} from '@/lib/theme-data';
import { soloLoEnviado, type CamposPublicables } from '@/lib/theme-publicar-campos';
import { themeDraftSchema } from '@/lib/theme-schema';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';

// POST /api/theme/publish → publica la marca. Solo PROPIETARIO y con la marca
// incluida en su plan. Gate de accesibilidad: el contraste WCAG se re-verifica
// en el servidor (no confiar en el cliente) y sobre el tema EXACTO que se
// escribe, dentro de publicarTheme/publicarCamposTheme — no sobre una lectura
// previa aquí, que otra pestaña podía dejar vieja. Si falla, 422 con los errores.
//
//   · Sin cuerpo: copia el BORRADOR entero → publicado (el editor del portal).
//   · Con `{ campos }` (el color o el favicon, desde Configuración › Marca):
//     publica SOLO esos campos encima de lo publicado y los deja en el borrador
//     sin tocar nada más de él (lib/theme-publicar-campos.ts). Sin esto el
//     favicon se quedaba en el borrador para siempre, y guardar el color lo
//     borraba.
//
// 409 si otra escritura del tema gana todos los reintentos (lib/theme-data.ts).
const camposSchema = themeDraftSchema.pick({ primary: true, secondary: true, faviconUrl: true, appAlumna: true }).strict();

function responder(resultado: ResultadoPublicacion): NextResponse {
  return resultado.ok
    ? NextResponse.json(resultado.theme)
    : NextResponse.json({ error: 'Contraste insuficiente', errores: resultado.errores }, { status: 422 });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede publicar la marca' }, { status: 403 });
  // Gate de plan (mismo criterio que el PUT del borrador).
  if (!(await featureDeEstudio(sesion.studioId, 'marca')))
    return NextResponse.json({ error: 'La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para publicarla.' }, { status: 403 });

  const cuerpo = (await req.json().catch(() => null)) as { campos?: unknown } | null;
  let campos: CamposPublicables | null = null;
  if (cuerpo && typeof cuerpo === 'object' && 'campos' in cuerpo) {
    const parsed = camposSchema.safeParse(cuerpo.campos);
    // Solo lo que ha llegado: zod rellenaría `faviconUrl: null` al publicar los
    // colores y lo quitaría (ver `soloLoEnviado`).
    const enviados = parsed.success ? soloLoEnviado(cuerpo.campos, parsed.data) : {};
    if (!parsed.success || Object.keys(enviados).length === 0)
      return NextResponse.json({ error: 'Los cambios de marca no son válidos.' }, { status: 400 });
    if (!faviconPermitido(enviados.faviconUrl, sesion.studioId))
      return NextResponse.json({ error: MENSAJE_FAVICON_AJENO }, { status: 400 });
    campos = enviados;
  }

  try {
    return responder(campos
      ? await publicarCamposTheme(sesion.studioId, campos)
      : await publicarTheme(sesion.studioId));
  } catch (e) {
    if (e instanceof ConflictoTheme)
      return NextResponse.json({ error: MENSAJE_CONFLICTO_THEME }, { status: 409 });
    return errorInterno(campos ? 'theme:publicar-campos' : 'theme:publicar', e,
      'No se han podido publicar los cambios de marca. Vuelve a intentarlo.');
  }
}
