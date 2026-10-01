import { NextRequest } from 'next/server';
import { conApiPublica, error } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, suscripcionPublica } from '@/lib/api-publica/serializar';

const ESTADOS = ['ACTIVA', 'PAUSADA', 'CANCELADA', 'EXPIRADA'];

// GET /api/v1/suscripciones — `planes:leer`. Cuotas y bonos de las clientas
// (un bono es una suscripción con `tipoPlan: BONO` y `sesionesRestantes`), por
// fecha de inicio. Filtros: `estado`, `clientaId`, `desde`, `hasta`.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'planes:leer', ruta: '/api/v1/suscripciones' }, async (ctx, admin) => {
    const sp = req.nextUrl.searchParams;
    const estado = sp.get('estado');
    const clientaId = sp.get('clientaId');
    if (estado && !ESTADOS.includes(estado)) return error(400, 'invalid_request', `\`estado\` es uno de: ${ESTADOS.join(', ')}.`, ctx.requestId);
    return listar(req, admin, ctx, {
      tabla: 'suscripciones', columnas: COLUMNAS.suscripcion, columnaFecha: 'fecha_inicio', tipoFecha: 'date',
      filtrar: (q) => {
        let r = q;
        if (estado) r = r.eq('estado', estado);
        if (clientaId) r = r.eq('socio_id', clientaId);
        return r;
      },
      serializar: suscripcionPublica,
    });
  });
}
