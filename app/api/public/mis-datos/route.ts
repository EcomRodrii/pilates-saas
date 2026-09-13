import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { resolverStudioPorSlug, socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import { exportarDatosSocia, nombreArchivoExportacion, type LectorBd } from '@/lib/socios/exportar-datos-socia';

// «Descargar mis datos» — derecho de acceso y portabilidad (arts. 15 y 20 RGPD)
// de la ALUMNA, desde su app. Al momento, sin pasar por el estudio (decisión de
// producto cerrada; la supresión, en cambio, sí es una solicitud).
//
// Identidad: la del JWT verificado + `socioAutenticado` con el estudio del
// slug — nunca un id que venga en la petición. Con service-role porque la
// socia no tiene policies propias en estas tablas; por eso el filtro por
// socia y estudio lo hace `exportarDatosSocia` en cada lectura (y lo prueba
// su test).
//
// Incluye su salud: son sus datos. No confundir con `app/api/exportar/mis-datos`,
// que es la exportación del estudio entero para la propietaria.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  // Estricto: arma un JSON con todo su historial (decenas de lecturas).
  const limited = await enforceRateLimit(req, 'public-mis-datos', { max: 10, windowSeconds: 600 });
  if (limited) return limited;

  const slug = req.nextUrl.searchParams.get('slug')?.trim();
  if (!slug) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const estudio = await resolverStudioPorSlug(admin as never, slug);
  if (!estudio) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
  const studioId = String(estudio.row.id);

  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const ahora = new Date();
  try {
    const datos = await exportarDatosSocia(admin as unknown as LectorBd, {
      studioId, socioId, incluirSalud: true, saludSoloConConsentimiento: false, ahora,
    });
    if (!datos) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    return new NextResponse(JSON.stringify(datos, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreArchivoExportacion(`mis-datos-${slug}`, ahora)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorInterno('public/mis-datos:GET', e, 'No hemos podido preparar tus datos. Inténtalo de nuevo en un rato.');
  }
}
