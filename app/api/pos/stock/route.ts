import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { puedeMoverDinero, puedeVerFinanzas } from '@/lib/permisos-reglas';
import { errorInterno } from '@/lib/errores-servidor';
import { codigoDeErrorPg, mensajeErrorVenta } from '@/lib/pos/tipos';

export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// Existencias: moverlas, y poder explicar por qué están donde están.
//
// GET  /api/pos/stock?productoId=…  → historial de ese artículo
// POST /api/pos/stock               → entrada, merma o ajuste de recuento
//
// ⚠️ El historial es una UNIÓN de dos fuentes, y a propósito:
//   · `movimientos_stock` — lo que alguien hizo a mano (entradas, mermas,
//     ajustes).
//   · `ventas_pos_lineas` — lo que se vendió y lo que se devolvió, DERIVADO de
//     la venta en vez de copiado.
//
// Copiar las ventas al libro habría obligado a tocar otra vez las dos RPC de
// dinero ya auditadas, para acabar con dos versiones del mismo hecho que pueden
// separarse. Un historial derivado no puede contradecir a la venta.
//
// El GET pide `puedeVerFinanzas` y el POST `puedeMoverDinero`: mirar cuántas
// quedan y cambiar cuántas hay no son la misma decisión.
// ─────────────────────────────────────────────────────────────────────────────

interface Movimiento {
  id: string;
  fecha: string;
  tipo: 'ENTRADA' | 'MERMA' | 'AJUSTE' | 'VENTA' | 'DEVOLUCION';
  cantidad: number;          // con signo
  stockResultante: number | null;
  detalle: string | null;
  quien: string | null;
}

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFinanzas(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede ver el stock' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const productoId = req.nextUrl.searchParams.get('productoId');
  if (!productoId) return NextResponse.json({ error: 'Falta el artículo' }, { status: 400 });

  const { data: producto } = await admin.from('productos_pos')
    .select('id, nombre, stock, stock_minimo')
    .eq('id', productoId).eq('studio_id', sesion.studioId)
    .maybeSingle();
  if (!producto) return NextResponse.json({ error: 'No encontramos ese artículo' }, { status: 404 });

  // ⚠️ Dos consultas, no un `embed`. `ventas_pos_lineas` NO tiene `creado_en`
  // —su fecha es la de la venta— así que no se puede ordenar por ella, y
  // ordenar por una columna de la tabla incrustada depende de la versión de
  // PostgREST. Se juntan en JS, que aquí es determinista y no depende de nada.
  const [manuales, lineas] = await Promise.all([
    admin.from('movimientos_stock')
      .select('id, tipo, cantidad, stock_resultante, motivo, creado_por_nombre, creado_en')
      .eq('studio_id', sesion.studioId).eq('producto_id', productoId)
      .order('creado_en', { ascending: false }).limit(100),
    admin.from('ventas_pos_lineas')
      .select('id, cantidad, devuelta_cantidad, venta_id')
      .eq('studio_id', sesion.studioId).eq('referencia_id', productoId).eq('tipo', 'PRODUCTO')
      .limit(300),
  ]);

  const ventaIds = [...new Set((lineas.data ?? []).map((l) => l.venta_id))];
  const ventasPorId = new Map<string, { numero: number; estado: string; realizada_en: string }>();
  if (ventaIds.length > 0) {
    const { data: ventas } = await admin.from('ventas_pos')
      .select('id, numero, estado, realizada_en')
      .eq('studio_id', sesion.studioId).in('id', ventaIds);
    for (const v of ventas ?? []) {
      ventasPorId.set(v.id, { numero: v.numero, estado: v.estado, realizada_en: v.realizada_en });
    }
  }

  const movimientos: Movimiento[] = [];

  for (const m of manuales.data ?? []) {
    movimientos.push({
      id: m.id,
      fecha: m.creado_en,
      tipo: m.tipo as Movimiento['tipo'],
      cantidad: m.cantidad,
      stockResultante: m.stock_resultante,
      detalle: m.motivo,
      quien: m.creado_por_nombre,
    });
  }

  for (const l of lineas.data ?? []) {
    const venta = ventasPorId.get(l.venta_id);
    // Una venta ANULADA nunca llegó a descontar stock (`fallar_pago_venta_pos`
    // lo devuelve), así que no tiene sitio en el libro: aparecería como una
    // salida que no ocurrió.
    if (!venta || venta.estado === 'ANULADA') continue;
    const numero = `#${String(venta.numero).padStart(6, '0')}`;
    movimientos.push({
      id: `venta-${l.id}`,
      fecha: venta.realizada_en,
      tipo: 'VENTA',
      cantidad: -l.cantidad,
      stockResultante: null,
      detalle: `Venta ${numero}`,
      quien: null,
    });
    if ((l.devuelta_cantidad ?? 0) > 0) {
      movimientos.push({
        id: `dev-${l.id}`,
        fecha: venta.realizada_en,
        tipo: 'DEVOLUCION',
        cantidad: l.devuelta_cantidad,
        stockResultante: null,
        detalle: `Devolución de la venta ${numero}`,
        quien: null,
      });
    }
  }

  movimientos.sort((a, b) => b.fecha.localeCompare(a.fecha));

  return NextResponse.json({
    producto: {
      id: producto.id, nombre: producto.nombre,
      stock: producto.stock, stockMinimo: producto.stock_minimo ?? 0,
    },
    movimientos: movimientos.slice(0, 100),
  });
}

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeMoverDinero(sesion.rol)) {
    return NextResponse.json({ error: 'Tu rol no puede mover existencias' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  let body: { productoId?: unknown; tipo?: unknown; cantidad?: unknown; motivo?: unknown; costeUnitario?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Petición mal formada' }, { status: 400 });
  }

  const productoId = typeof body.productoId === 'string' ? body.productoId : '';
  const tipo = typeof body.tipo === 'string' ? body.tipo : '';
  const cantidad = Number(body.cantidad);
  if (!productoId || !['ENTRADA', 'MERMA', 'AJUSTE'].includes(tipo)) {
    return NextResponse.json({ error: 'Falta el artículo o el tipo de movimiento' }, { status: 400 });
  }
  if (!Number.isInteger(cantidad) || cantidad < 0) {
    return NextResponse.json({ error: 'Esa cantidad no es válida.' }, { status: 400 });
  }

  const coste = body.costeUnitario == null || body.costeUnitario === ''
    ? null
    : Number(body.costeUnitario);
  if (coste !== null && (!Number.isFinite(coste) || coste < 0)) {
    return NextResponse.json({ error: 'Ese coste no es válido.' }, { status: 400 });
  }

  try {
    const { data, error } = await admin.rpc('mover_stock', {
      p_studio_id: sesion.studioId,
      p_producto_id: productoId,
      p_tipo: tipo,
      p_cantidad: cantidad,
      p_motivo: typeof body.motivo === 'string' ? body.motivo.slice(0, 200) : null,
      p_coste_unitario: coste,
      p_por: sesion.userId,
      p_por_nombre: sesion.nombre,
    });

    if (error) {
      const codigo = codigoDeErrorPg(error.message);
      if (codigo) return NextResponse.json({ error: mensajeErrorStock(codigo), codigo }, { status: 409 });
      return errorInterno('[pos/stock] la RPC falló', error, 'No se ha podido mover el stock.');
    }

    const fila = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({
      ok: true,
      stockAnterior: fila?.r_stock_anterior ?? null,
      stock: fila?.r_stock_resultante ?? null,
      delta: fila?.r_delta ?? 0,
    });
  } catch (e) {
    return errorInterno('[pos/stock] excepción', e, 'No se ha podido mover el stock.');
  }
}

/**
 * Los códigos propios del stock; el resto los traduce `mensajeErrorVenta`, que
 * ya conoce `ARTICULO_NO_ENCONTRADO` y `CANTIDAD_INVALIDA`.
 */
function mensajeErrorStock(codigo: string): string {
  const [clave, ...partes] = codigo.split(':');
  const a = partes[0] ?? '';
  const b = partes[1] ?? '';
  switch (clave) {
    case 'SIN_CONTROL_DE_STOCK':
      return `«${a}» no lleva control de existencias. Actívalo en el artículo antes de mover stock.`;
    case 'STOCK_NEGATIVO':
      return `No puedes quitar tantas: de «${a}» solo hay ${b}.`;
    case 'AJUSTE_SIN_CAMBIO':
      return `Ya hay ${a}: no hay nada que ajustar.`;
    case 'TIPO_MOVIMIENTO_INVALIDO':
      return 'Ese tipo de movimiento no existe.';
    default:
      return mensajeErrorVenta(codigo);
  }
}
