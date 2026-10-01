import { NextRequest } from 'next/server';
import { conApiPublica } from '@/lib/api-publica/servidor';
import { listar } from '@/lib/api-publica/listado';
import { COLUMNAS, devolucionPublica } from '@/lib/api-publica/serializar';

// GET /api/v1/devoluciones — `pagos:leer`. Reembolsos (totales o parciales) y
// contracargos detectados, uno por hecho (un mismo cobro puede tener varios).
// El acumulado devuelto de cada recibo está también en /v1/recibos
// (`importeDevuelto`); aquí está cada devolución con su fecha.
export async function GET(req: NextRequest) {
  return conApiPublica(req, { scope: 'pagos:leer', ruta: '/api/v1/devoluciones' }, async (ctx, admin) =>
    listar(req, admin, ctx, {
      tabla: 'devoluciones', columnas: COLUMNAS.devolucion, columnaFecha: 'detectada_en', tipoFecha: 'timestamp',
      serializar: devolucionPublica,
    }),
  );
}
