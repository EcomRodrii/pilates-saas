import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeGestionarClientas, puedeVerFichaClinica } from '@/lib/permisos-reglas';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno } from '@/lib/errores-servidor';
import { exportarDatosSocia, nombreArchivoExportacion, type LectorBd } from '@/lib/socios/exportar-datos-socia';

// «Descargar sus datos» desde la ficha de la clienta: el estudio atiende el
// derecho de acceso/portabilidad de UNA socia (arts. 15 y 20 RGPD) — p. ej.
// cuando se lo pide en el mostrador. La misma función que usa la alumna en su
// app, para que las dos exportaciones no puedan divergir.
//
// Permisos, en servidor y no solo en la UI:
//   · `puedeGestionarClientas` para exportar (mismo rol que edita y suprime);
//   · la sección de salud solo si además `puedeVerFichaClinica` Y la socia tiene
//     el consentimiento de salud vigente — espejo de la RLS de esas tablas, que
//     aquí no protege nada porque se lee con service-role.
//
// Si sale salud, se registra en `lecturas_ficha_salud` como cualquier lectura
// de la ficha — y si ese registro falla, no se entrega (fail-closed: una
// descarga de datos de salud sin traza es justo lo que la auditoría pide evitar).
export const maxDuration = 60;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'socios-exportar-datos', { max: 20, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeGestionarClientas(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para exportar los datos de una clienta' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const { id: socioId } = await params;
  const ahora = new Date();
  try {
    const datos = await exportarDatosSocia(admin as unknown as LectorBd, {
      studioId: sesion.studioId, socioId,
      incluirSalud: puedeVerFichaClinica(sesion.rol), saludSoloConConsentimiento: true, ahora,
    });
    if (!datos) return NextResponse.json({ error: 'Socia no encontrada' }, { status: 404 });

    if (datos.secciones.salud) {
      const { error: eLectura } = await admin.from('lecturas_ficha_salud').insert({
        studio_id: sesion.studioId, socio_id: socioId,
        leido_por_user_id: sesion.userId, leido_por_nombre: sesion.nombre, leido_por_rol: sesion.rol,
      });
      if (eLectura) return errorInterno('socios/exportar:lectura-salud', eLectura, 'No se ha podido registrar el acceso a su ficha de salud. Inténtalo de nuevo.');
    }

    const etiqueta = `datos-${datos.socia.nombre ?? ''}-${datos.socia.apellidos ?? ''}`;
    return new NextResponse(JSON.stringify(datos, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreArchivoExportacion(etiqueta, ahora)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e) {
    return errorInterno('socios/exportar:GET', e, 'No se han podido preparar sus datos.');
  }
}
