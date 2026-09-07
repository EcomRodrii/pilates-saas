import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';
import { mapFactura } from '@/lib/supabase-data';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// La factura de una venta del mostrador.
//
// Existía desde el primer día —`sellarFacturaDeRecibo` la sella al cobrar, con
// su número de serie y su cadena Veri*Factu— pero NO había forma de llegar a
// ella sin salir del TPV, entrar en Cobros → Facturas y buscar el número. Con
// una clienta delante pidiendo su factura, eso no sirve: es el momento en que
// se necesita, y es justo cuando la pantalla del mostrador no la tenía.
//
// Va por endpoint y no leyendo el StudioContext a propósito: así también
// funciona para una venta de HACE DÍAS (alguien que vuelve a pedirla), no solo
// para la que se acaba de cobrar. Y no depende de que el contexto se haya
// refrescado ya, que es una carrera que en un mostrador se pierde.
//
// NO emite nada. Solo lee. El sellado sigue siendo del camino fiscal de
// siempre — un TPV que emitiera facturas por su cuenta sería el sistema
// paralelo que este rediseño existe para no crear.
//
// GET /api/pos/factura?ventaId=vpos-123
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver las facturas' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const ventaId = req.nextUrl.searchParams.get('ventaId');
  if (!ventaId) return NextResponse.json({ error: 'Falta la venta' }, { status: 400 });

  // El estudio SIEMPRE del JWT, nunca del parámetro: si no, esto sería un
  // lector de facturas de cualquier estudio con solo cambiar un id.
  const { data: venta } = await admin.from('ventas_pos')
    .select('id, numero, recibo_id, socio_id, estado')
    .eq('id', ventaId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!venta) return NextResponse.json({ error: 'No encontramos esa venta' }, { status: 404 });

  if (venta.estado !== 'PAGADA') {
    return NextResponse.json({ factura: null, motivo: 'Esa venta no está cobrada, así que no tiene factura.' });
  }
  if (!venta.recibo_id) {
    return NextResponse.json({ factura: null, motivo: 'Esa venta no llegó a generar recibo. Avisa a soporte.' });
  }

  const { data: fila } = await admin.from('facturas')
    .select('id, studio_id, recibo_id, venta_pos_id, numero_completo, fecha_emision, receptor_nombre, receptor_nif, base_imponible, tipo_iva, cuota_iva, total, verifactu_hash, verifactu_prev_hash, verifactu_ts, verifactu_seq, fiskaly_invoice_id, verifactu_qr_url, verifactu_qr_imagen, verifactu_estado, verifactu_csv, serie, tipo, rectifica_a, tipo_rectificativa, importe_rectificacion')
    .eq('recibo_id', venta.recibo_id).eq('studio_id', sesion.studioId)
    .maybeSingle();

  if (!fila) {
    // El sellado falla a veces (la AEAT, la red) y el recibo queda marcado
    // para que el conciliador lo reintente. Decirlo es mejor que un hueco: en
    // el mostrador hay que poder responder "en unos minutos la tienes".
    const { data: recibo } = await admin.from('recibos')
      .select('factura_pendiente_sellar')
      .eq('id', venta.recibo_id).eq('studio_id', sesion.studioId)
      .maybeSingle();
    return NextResponse.json({
      factura: null,
      motivo: recibo?.factura_pendiente_sellar
        ? 'La factura se está emitiendo. Estará lista en unos minutos.'
        : 'Esa venta todavía no tiene factura emitida.',
    });
  }

  // El receptor solo si la venta tenía clienta. Una venta de mostrador sin
  // ficha se factura como SIMPLIFICADA (F2, sin receptor identificado), que es
  // exactamente lo que la norma prevé para un ticket — no es un hueco de datos.
  let receptor: { telefono: string | null; email: string | null } | null = null;
  if (venta.socio_id) {
    const { data: socio } = await admin.from('socios')
      .select('telefono, email')
      .eq('id', venta.socio_id).eq('studio_id', sesion.studioId)
      .maybeSingle();
    if (socio) receptor = { telefono: socio.telefono ?? null, email: socio.email ?? null };
  }

  return NextResponse.json({ factura: mapFactura(fila), receptor, numeroVenta: venta.numero });
}
