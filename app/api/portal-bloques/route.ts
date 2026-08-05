import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { errorInterno } from '@/lib/errores-servidor';
import { getBloquesBorrador, getBloquesPublicado, guardarBloquesBorrador } from '@/lib/layout-data';
import { bloqueHomeSchema } from '@/lib/layout-schema';
import { puedeGestionarPortalHome } from '@/lib/permisos-reglas';
import { PANTALLA_IDS, type PantallaId } from '@/lib/portal-home-bloques';
import { z } from 'zod';

function pantallaDe(req: NextRequest): PantallaId | null {
  const raw = req.nextUrl.searchParams.get('pantalla') ?? 'home';
  return (PANTALLA_IDS as readonly string[]).includes(raw) ? (raw as PantallaId) : null;
}

// GET /api/portal-bloques?pantalla=home|clases|bonos → bloques BORRADOR de esa pantalla del portal (editor).
// GET .../?publicado=1 → los PUBLICADOS (los que ve la socia ahora mismo).
//
// El opt-in es `publicado=1` y no `draft=1` como en /api/theme, al revés que
// allí: este GET nació devolviendo el BORRADOR y todos sus llamadores cuentan
// con eso. Invertir el defecto para ganar simetría rompería el editor entero.
//
// Sin gate de rol, igual que la rama del borrador: lo publicado es
// exactamente lo que el portal ya pinta a cualquier socia, así que leerlo con
// sesión de staff no expone nada nuevo. Escribir sí lo tiene (ver PUT).
export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const pantalla = pantallaDe(req);
  if (!pantalla) return NextResponse.json({ error: 'Pantalla desconocida' }, { status: 400 });
  const publicado = req.nextUrl.searchParams.get('publicado') === '1';
  return NextResponse.json(publicado
    ? await getBloquesPublicado(sesion.studioId, pantalla)
    : await getBloquesBorrador(sesion.studioId, pantalla));
}

// PUT /api/portal-bloques?pantalla=home|clases|bonos → guarda (reemplaza) el BORRADOR de esa pantalla. No publica.
export async function PUT(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarPortalHome(sesion.rol))
    return NextResponse.json({ error: 'Solo la propietaria o la gerencia pueden editar los bloques del portal' }, { status: 403 });
  const pantalla = pantallaDe(req);
  if (!pantalla) return NextResponse.json({ error: 'Pantalla desconocida' }, { status: 400 });

  const body = await req.json().catch(() => null);
  const parsed = z.array(bloqueHomeSchema).safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: 'Bloques inválidos', detalles: parsed.error.issues }, { status: 400 });

  try {
    return NextResponse.json(await guardarBloquesBorrador(sesion.studioId, pantalla, parsed.data));
  } catch (e) {
    return errorInterno('portal-bloques:guardar', e,
      'No se han podido guardar los bloques. Vuelve a intentarlo.');
  }
}
