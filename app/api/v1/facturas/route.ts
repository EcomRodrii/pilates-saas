import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, facturaPublica } from '@/lib/api-publica/serializar';

const TIPOS = ['F1', 'F2', 'R1', 'R2', 'R3', 'R4', 'R5'];

// GET /api/v1/facturas — `facturas:leer`. Las facturas emitidas desde Tentare
// (rectificativas incluidas, con `rectificaA`), por fecha de emisión. Importes
// en céntimos con su base, tipo y cuota de IVA tal como se sellaron.
//
// ⚠️ Un estudio en `modoFacturacion: sin_facturas` (ver /v1/estudio) no emite
// facturas desde Tentare: su contabilidad sale de /v1/recibos.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'facturas:leer', ruta: '/api/v1/facturas' }, async (ctx, admin) => {
    const tipo = req.nextUrl.searchParams.get('tipo');
    if (tipo && !TIPOS.includes(tipo)) return error(400, 'invalid_request', `\`tipo\` es uno de: ${TIPOS.join(', ')}.`, ctx.requestId);
    return listar(req, admin, ctx, {
      tabla: 'facturas', columnas: COLUMNAS.factura, columnaFecha: 'fecha_emision', tipoFecha: 'date',
      filtrar: (q) => (tipo ? q.eq('tipo', tipo) : q),
      serializar: facturaPublica,
    });
  });
}
