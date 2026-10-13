import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// «Facturar automáticamente» (9-oct-2026): si Tentare emite la factura sola al
// cobrar (salvo en efectivo) o solo cuando alguien la pide. Es un ajuste del
// estudio y NO tiene nada que ver con Veri*Factu (`modo_facturacion`, que tiene
// su ruta aparte): ni lo lee ni lo cambia.
//
// Solo la propietaria, como el resto de lo fiscal. `authenticated` no tiene
// GRANT de UPDATE sobre la columna: esta ruta (service-role) es la única puerta.

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria decide si las facturas salen solas.' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { activo?: unknown } | null;
  if (typeof body?.activo !== 'boolean') {
    return NextResponse.json({ error: 'Valor no válido' }, { status: 400 });
  }
  const activo = body.activo;

  try {
    const { data, error } = await admin
      .from('studios').update({ facturar_automatico: activo })
      .eq('id', sesion.studioId)
      .select('facturar_automatico')
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });

    // Al apagarlo, las facturas AUTOMÁTICAS que esperaban a sellarse (p. ej. por
    // falta del NIF) dejan de esperar: ya no se van a emitir solas. Las de
    // efectivo con «Hacerle factura» siguen: alguien las pidió. No es retroactivo
    // con lo ya emitido (una factura numerada solo se corrige con una rectificativa).
    if (!activo) {
      const { error: errLimpiar } = await admin.from('recibos')
        .update({ factura_pendiente_sellar: false })
        .eq('studio_id', sesion.studioId).eq('factura_pendiente_sellar', true)
        .or('metodo_cobro.is.null,metodo_cobro.neq.EFECTIVO');
      if (errLimpiar) throw errLimpiar;
    }
    return NextResponse.json({ activo: data.facturar_automatico === true });
  } catch (err) {
    return errorInterno('facturacion/automatica:POST', err, 'No se ha podido cambiar el ajuste de facturas automáticas.');
  }
}
