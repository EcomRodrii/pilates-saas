import { NextRequest, NextResponse } from 'next/server';
import { documentoOpenApi } from '@/lib/api-publica/openapi';

// GET /api/v1/openapi.json — la especificación de la API, pública y sin
// credencial (no contiene datos de ningún estudio). Para Swagger UI, Postman o
// un generador de clientes.
export function GET(req: NextRequest) {
  return NextResponse.json(documentoOpenApi(req.nextUrl.origin), {
    headers: { 'Cache-Control': 'public, max-age=300', 'Access-Control-Allow-Origin': '*' },
  });
}
