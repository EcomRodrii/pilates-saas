import { NextRequest } from 'next/server';
import { conApiPublica } from '@/lib/api-publica/servidor';
import { obtener } from '@/lib/api-publica/listado';
import { COLUMNAS, facturaPublica } from '@/lib/api-publica/serializar';

// GET /api/v1/facturas/{id} — `facturas:leer`. 404 si no es de este estudio.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return conApiPublica(req, { scope: 'facturas:leer', ruta: '/api/v1/facturas/{id}' }, (ctx, admin) =>
    obtener(admin, ctx, { tabla: 'facturas', columnas: COLUMNAS.factura, id, nombre: 'Factura', serializar: facturaPublica }),
  );
}
