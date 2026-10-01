import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, ventaPublica } from '@/lib/api-publica/serializar';

const ESTADOS = ['PENDIENTE_PAGO', 'PAGADA', 'ANULADA'];

// GET /api/v1/ventas — `pagos:leer`. Las ventas de la caja (TPV), con sus
// líneas y el IVA de cada una. ⚠️ Cada venta pagada tiene su recibo
// (`reciboId`) y ese recibo YA está en /v1/recibos: para contabilizar ingresos,
// usa los recibos; esto es el detalle de lo vendido. Sumar las dos cosas
// contaría cada venta dos veces. Una venta pagada SIN `reciboId` no está en
// ningún recibo (ventas antiguas de la caja): es dinero que entró y no tiene
// apunte en Tentare.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'pagos:leer', ruta: '/api/v1/ventas' }, async (ctx, admin) => {
    const estado = req.nextUrl.searchParams.get('estado');
    if (estado && !ESTADOS.includes(estado)) return error(400, 'invalid_request', `\`estado\` es uno de: ${ESTADOS.join(', ')}.`, ctx.requestId);
    return listar(req, admin, ctx, {
      tabla: 'ventas_pos', columnas: COLUMNAS.venta, columnaFecha: 'realizada_en', tipoFecha: 'timestamp',
      filtrar: (q) => (estado ? q.eq('estado', estado) : q),
      serializar: ventaPublica,
    });
  });
}
