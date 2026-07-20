import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getThemeBorrador, publicarTheme } from '@/lib/theme-data';
import { validarContrasteTheme } from '@/lib/theme-runtime';

// POST /api/theme/publish → publica el BORRADOR (copia draft → published). Solo
// PROPIETARIO. Gate de accesibilidad: re-verifica el contraste WCAG en el
// servidor (no confiar en el cliente); si falla, 422 con los errores.
export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO')
    return NextResponse.json({ error: 'Solo el propietario puede publicar la marca' }, { status: 403 });

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
