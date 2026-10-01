import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, reciboPublico } from '@/lib/api-publica/serializar';

const ESTADOS = ['PENDIENTE', 'EN_CURSO', 'COBRADO', 'FALLIDO', 'DEVUELTO', 'ANULADO'];

// GET /api/v1/recibos — `pagos:leer`. Los cobros del estudio, con lo que de
// verdad entró (`importeIngresado`, neto de reembolsos) y su `situacion` (la
// misma lectura que las cifras del panel: lib/billing/situacion-recibo.ts).
//
// `?fecha=cobro` lista por fecha de cobro (solo lo cobrado: es lo que se
// contabiliza como ingreso); por defecto, por fecha de vencimiento (todo).
// Filtros: `estado`, `clientaId`, `desde`, `hasta`.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'pagos:leer', ruta: '/api/v1/recibos' }, async (ctx, admin) => {
    const sp = req.nextUrl.searchParams;
    const fecha = sp.get('fecha') ?? 'vencimiento';
    const estado = sp.get('estado');
    const clientaId = sp.get('clientaId');
    if (fecha !== 'cobro' && fecha !== 'vencimiento') return error(400, 'invalid_request', '`fecha` es `cobro` o `vencimiento`.', ctx.requestId);
    if (estado && !ESTADOS.includes(estado)) return error(400, 'invalid_request', `\`estado\` es uno de: ${ESTADOS.join(', ')}.`, ctx.requestId);
    return listar(req, admin, ctx, {
      tabla: 'recibos', columnas: COLUMNAS.recibo,
      columnaFecha: fecha === 'cobro' ? 'fecha_cobro' : 'fecha_vencimiento', tipoFecha: 'date',
      filtrar: (q) => {
        let r = q;
        if (estado) r = r.eq('estado', estado);
        if (clientaId) r = r.eq('socio_id', clientaId);
        return r;
      },
      serializar: reciboPublico,
    });
  });
}
