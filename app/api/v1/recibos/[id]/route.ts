import { NextRequest } from 'next/server';
import { conApiPublica } from '@/lib/api-publica/servidor';
import { obtener } from '@/lib/api-publica/listado';
import { COLUMNAS, reciboPublico } from '@/lib/api-publica/serializar';

// GET /api/v1/recibos/{id} — `pagos:leer`. 404 si no es de este estudio.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return conApiPublica(req, { scope: 'pagos:leer', ruta: '/api/v1/recibos/{id}' }, (ctx, admin) =>
    obtener(admin, ctx, { tabla: 'recibos', columnas: COLUMNAS.recibo, id, nombre: 'Recibo', serializar: reciboPublico }),
  );
}
