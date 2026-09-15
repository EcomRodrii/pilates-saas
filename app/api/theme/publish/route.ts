import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getThemeBorrador, getThemePublicado, publicarCamposTheme, publicarTheme } from '@/lib/theme-data';
import { validarContrasteTheme } from '@/lib/theme-runtime';
import { themeDraftSchema } from '@/lib/theme-schema';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';

// POST /api/theme/publish → publica la marca. Solo PROPIETARIO y con la marca
// incluida en su plan. Gate de accesibilidad: re-verifica el contraste WCAG en
// el servidor (no confiar en el cliente); si falla, 422 con los errores.
//
//   · Sin cuerpo: copia el BORRADOR entero → publicado (el editor del portal).
//   · Con `{ campos }` (el color o el favicon, desde Configuración › Marca):
//     publica SOLO esos campos encima de lo publicado y los deja en el borrador
//     sin tocar nada más de él (lib/theme-publicar-campos.ts). Sin esto el
//     favicon se quedaba en el borrador para siempre, y guardar el color lo
//     borraba.
const camposSchema = themeDraftSchema.pick({ primary: true, secondary: true, faviconUrl: true }).strict();

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede publicar la marca' }, { status: 403 });
  // Gate de plan (mismo criterio que el PUT del borrador).
  if (!(await featureDeEstudio(sesion.studioId, 'marca')))
    return NextResponse.json({ error: 'La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para publicarla.' }, { status: 403 });

  const cuerpo = (await req.json().catch(() => null)) as { campos?: unknown } | null;
  if (cuerpo && typeof cuerpo === 'object' && 'campos' in cuerpo) {
    const parsed = camposSchema.safeParse(cuerpo.campos);
    if (!parsed.success || Object.keys(parsed.data).length === 0)
      return NextResponse.json({ error: 'Los cambios de marca no son válidos.' }, { status: 400 });
    const contraste = validarContrasteTheme({ ...(await getThemePublicado(sesion.studioId)), ...parsed.data });
    if (!contraste.ok)
      return NextResponse.json({ error: 'Contraste insuficiente', errores: contraste.errores }, { status: 422 });
    try {
      return NextResponse.json(await publicarCamposTheme(sesion.studioId, parsed.data));
    } catch (e) {
      return errorInterno('theme:publicar-campos', e,
        'No se han podido publicar los cambios de marca. Vuelve a intentarlo.');
    }
  }

  const borrador = await getThemeBorrador(sesion.studioId);
  const contraste = validarContrasteTheme(borrador);
  if (!contraste.ok)
    return NextResponse.json({ error: 'Contraste insuficiente', errores: contraste.errores }, { status: 422 });

  try {
    const publicado = await publicarTheme(sesion.studioId);
    return NextResponse.json(publicado);
  } catch (e) {
    return errorInterno('theme:publicar', e,
      'No se han podido publicar los cambios de marca. Vuelve a intentarlo.');
  }
}
