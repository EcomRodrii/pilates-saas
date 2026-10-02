import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';

export const dynamic = 'force-dynamic';

// Encender o apagar Veri*Factu (factura siempre; el envío a la AEAT, aparte —
// decisión del fundador, 2-oct-2026).
//
// SOLO la propietaria: es la obligada tributaria. El navegador ya no escribe
// `studios.modo_facturacion` (REVOKE de la columna + trigger), así que esta ruta
// es la única puerta. Lo que se elige es CON o SIN envío; «sin facturas» no se
// ofrece. Encender exige el envío activo con poder vigente, y eso lo comprueba
// la base de datos (trigger `studios_facturas_exigen_envio_activo`), no esta ruta.

const MODOS = new Set(['facturas', 'verifactu']);

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria decide si las facturas se envían a la AEAT.' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });

  const body = (await req.json().catch(() => null)) as { modo?: unknown } | null;
  const modo = typeof body?.modo === 'string' ? body.modo : '';
  if (!MODOS.has(modo)) return NextResponse.json({ error: 'Modo de facturación no válido' }, { status: 400 });

  try {
    const { data, error } = await admin
      .from('studios').update({ modo_facturacion: modo })
      .eq('id', sesion.studioId)
      .select('modo_facturacion')
      .maybeSingle();
    if (error) {
      if (error.message?.includes('VERIFACTU_SIN_ACTIVAR')) {
        return NextResponse.json({ error: 'Se podrá activar cuando tu envío a la AEAT esté activo.' }, { status: 409 });
      }
      throw error;
    }
    if (!data) return NextResponse.json({ error: 'Estudio no encontrado' }, { status: 404 });
    return NextResponse.json({ modo: data.modo_facturacion });
  } catch (err) {
    return errorInterno('facturacion/modo:POST', err, 'No se ha podido cambiar el envío a la AEAT.');
  }
}
