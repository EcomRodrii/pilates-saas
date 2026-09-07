import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeVerFinanzas } from '@/lib/permisos-reglas';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Historial de ventas: la lista, y el detalle de una.
//
// PAGINADO, a diferencia del TPV anterior, que cargaba `ventas_pos` ENTERA en
// el navegador al arrancar el panel (supabase-data.ts, `fetchAllRows`). Un
// estudio con años de histórico descargaba miles de filas para pintar la cifra
// del día.
//
// GET /api/pos/ventas             → últimas 50 (o `?desde=` / `?limite=`)
// GET /api/pos/ventas?id=vpos-123 → una venta con sus líneas, para devolverla
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver las ventas' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const id = req.nextUrl.searchParams.get('id');

  // ── Detalle ───────────────────────────────────────────────────────────────
  if (id) {
    const { data: venta } = await admin.from('ventas_pos')
      .select('id, numero, socio_id, subtotal, descuento, base_imponible, iva_total, total, metodo_pago, estado, pago_estado, realizada_en, vendido_por_nombre, importe_devuelto, devuelta_en, notas, recibo_id, efectivo_recibido, cambio')
      .eq('id', id).eq('studio_id', sesion.studioId)
      .maybeSingle();
    if (!venta) return NextResponse.json({ error: 'No encontramos esa venta' }, { status: 404 });

    const { data: lineas } = await admin.from('ventas_pos_lineas')
      .select('id, tipo, referencia_id, nombre, precio_unitario, cantidad, iva_pct, descuento, base_imponible, iva_importe, total, devuelta_cantidad, suscripcion_id')
      .eq('venta_id', id).eq('studio_id', sesion.studioId)
      .order('orden');

    return NextResponse.json({
      venta: {
        id: venta.id, numero: venta.numero, socioId: venta.socio_id,
        subtotal: Number(venta.subtotal), descuento: Number(venta.descuento ?? 0),
        baseImponible: Number(venta.base_imponible ?? 0), ivaTotal: Number(venta.iva_total ?? 0),
        total: Number(venta.total), metodoPago: venta.metodo_pago,
        estado: venta.estado, pagoEstado: venta.pago_estado,
        realizadaEn: venta.realizada_en, vendidoPor: venta.vendido_por_nombre,
        importeDevuelto: Number(venta.importe_devuelto ?? 0), devueltaEn: venta.devuelta_en,
        notas: venta.notas, reciboId: venta.recibo_id,
        efectivoRecibido: venta.efectivo_recibido == null ? null : Number(venta.efectivo_recibido),
        cambio: venta.cambio == null ? null : Number(venta.cambio),
      },
      lineas: (lineas ?? []).map((l) => ({
        id: l.id, tipo: l.tipo, referenciaId: l.referencia_id, nombre: l.nombre,
        precioUnitario: Number(l.precio_unitario), cantidad: l.cantidad,
        ivaPct: Number(l.iva_pct), descuento: Number(l.descuento),
        baseImponible: Number(l.base_imponible), ivaImporte: Number(l.iva_importe),
        total: Number(l.total), devueltaCantidad: l.devuelta_cantidad,
        // Si la línea era un bono, esto prueba que creó una suscripción real.
        suscripcionId: l.suscripcion_id,
      })),
    });
  }

  // ── Lista ─────────────────────────────────────────────────────────────────
  const limite = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get('limite') ?? 50)));
  const desde = req.nextUrl.searchParams.get('desde');

  let q = admin.from('ventas_pos')
    .select('id, numero, socio_id, total, metodo_pago, estado, realizada_en, vendido_por_nombre, importe_devuelto')
    .eq('studio_id', sesion.studioId)
    // Las ANULADAS quedan en la base (nada se borra) pero no en esta lista: son
    // cobros que no llegaron a existir, y mezclarlos con las ventas reales
    // haría que el histórico no cuadre a ojo con la caja.
    .neq('estado', 'ANULADA')
    .order('realizada_en', { ascending: false })
    .limit(limite);
  if (desde) q = q.gte('realizada_en', desde);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: 'No se han podido cargar las ventas' }, { status: 500 });

  return NextResponse.json({
    ventas: (data ?? []).map((v) => ({
      id: v.id, numero: v.numero, socioId: v.socio_id, total: Number(v.total),
      metodoPago: v.metodo_pago, estado: v.estado, realizadaEn: v.realizada_en,
      vendidoPor: v.vendido_por_nombre, importeDevuelto: Number(v.importe_devuelto ?? 0),
    })),
  });
}
