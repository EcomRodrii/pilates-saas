import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getThemePublicado, getThemeBorrador, guardarBorradorTheme } from '@/lib/theme-data';
import { themeDraftSchema } from '@/lib/theme-schema';
import { featureDeEstudio } from '@/lib/billing/feature-estudio';

// GET /api/theme            → tema PUBLICADO del estudio del staff (marca del panel).
// GET /api/theme?draft=1    → tema BORRADOR (editor + preview en vivo).
// GET /api/theme?ambos=1    → los dos, en una sola llamada.
//
// ⚠️ `ambos` no es azúcar: al abrir el editor se pedían las dos variantes por
// separado, y CADA petición del panel paga su propio viaje —medido en
// producción, ~140 ms en caliente y hasta 7,8 s si la función estaba fría—.
// Las dos salen de la MISMA fila de `studio_theme`, así que separarlas era
// pagar dos veces por una lectura. Las dos rutas de antes se quedan: las usan
// el resto del panel y el portal, que solo necesitan una.
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  if (req.nextUrl.searchParams.get('ambos') === '1') {
    const [borrador, publicado] = await Promise.all([
      getThemeBorrador(sesion.studioId),
      getThemePublicado(sesion.studioId),
    ]);
    return NextResponse.json({ borrador, publicado });
  }

  const draft = req.nextUrl.searchParams.get('draft') === '1';
  const theme = draft
    ? await getThemeBorrador(sesion.studioId)
    : await getThemePublicado(sesion.studioId);
  return NextResponse.json(theme);
}

// PUT /api/theme → guarda (fusiona) un parche parcial en el BORRADOR. Solo
// PROPIETARIO. No afecta a lo publicado.
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede editar la marca' }, { status: 403 });
  // Gate de plan: la app de marca personalizada es del plan Estudio en
  // adelante (la lectura del tema publicado no se gata — el portal lo pinta).
  if (!(await featureDeEstudio(sesion.studioId, 'marca')))
    return NextResponse.json({ error: 'La app de marca personalizada está incluida a partir del plan Estudio. Mejora tu plan para editarla.' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = themeDraftSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'Tema inválido', detalles: parsed.error.issues }, { status: 400 });

  try {
    const borrador = await guardarBorradorTheme(sesion.studioId, parsed.data);
    return NextResponse.json(borrador);
  } catch (e) {
    return errorInterno('theme:guardar', e,
      'No se han podido guardar los cambios de marca. Vuelve a intentarlo.');
  }
}
