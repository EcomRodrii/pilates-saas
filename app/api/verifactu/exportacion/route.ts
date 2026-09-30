import { NextRequest, NextResponse } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { errorInterno } from '@/lib/errores-servidor';
import { csvRegistros, xmlRegistros, nombreFichero } from '@/lib/verifactu/exportacion';
import { cabeceraExportacion, contarRegistros, leerRegistrosParaExportar } from '@/lib/verifactu/exportacion-servidor';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Exportación de los registros de facturación del estudio (mandato, cláusula 8).
//
//   GET                  → { total }: el panel solo enseña la descarga si hay algo.
//   GET ?formato=csv|xml → el fichero.
//
// SOLO la propietaria, como el alta: es la obligada tributaria, y el XML lleva
// los datos de sus clientas que el cliente no lee nunca (migración 20260930030000).
//
// Los registros se leen ENTEROS antes de responder: un fallo de la base de datos
// a mitad de un stream dejaría un fichero cortado que parece completo. Lo que sí
// va por trozos es la salida, que para un estudio con años de facturas puede
// pasar de unos pocos megas.

export async function GET(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (sesion.rol !== 'PROPIETARIO') {
    return NextResponse.json({ error: 'Solo la propietaria descarga los registros de facturación.' }, { status: 403 });
  }
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor sin service-role configurada' }, { status: 503 });

  const formato = req.nextUrl.searchParams.get('formato');
  if (formato !== null && formato !== 'csv' && formato !== 'xml') {
    return NextResponse.json({ error: 'Formato no válido.' }, { status: 400 });
  }

  try {
    if (formato === null) {
      return NextResponse.json({ total: await contarRegistros(admin, sesion.studioId) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const ahora = new Date();
    const registros = await leerRegistrosParaExportar(admin, sesion.studioId, formato === 'xml');
    const partes = formato === 'csv'
      ? csvRegistros(registros)
      : xmlRegistros(registros, await cabeceraExportacion(admin, sesion.studioId, ahora));
    return new Response(comoStream(partes), {
      headers: {
        'Content-Type': formato === 'csv' ? 'text/csv; charset=utf-8' : 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreFichero(formato, ahora)}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return errorInterno('verifactu/exportacion:GET', err, 'No se han podido leer tus registros de facturación.');
  }
}

function comoStream(partes: Iterator<string>): ReadableStream<Uint8Array> {
  const cod = new TextEncoder();
  return new ReadableStream({
    pull(c) {
      const siguiente = partes.next();
      if (siguiente.done) c.close();
      else c.enqueue(cod.encode(siguiente.value));
    },
  });
}
