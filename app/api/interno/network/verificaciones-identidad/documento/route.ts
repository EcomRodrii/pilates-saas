import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';

export const runtime = 'nodejs';

// URL firmada de corta caducidad para el documento de identidad — el
// bucket red-documentos-identidad no tiene NINGUNA policy de SELECT para
// anon/authenticated (verificado en vivo al diseñar el esquema), así que
// esta es la ÚNICA forma de que un documento se vea, y solo desde aquí
// (exigirPermiso, service-role). 5 minutos: suficiente para revisar un
// documento, corto para que un enlace copiado deje de funcionar enseguida.
const CADUCIDAD_SEGUNDOS = 300;
const BUCKET = 'red-documentos-identidad';

export async function GET(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const id = req.nextUrl.searchParams.get('id');
  const tipo = req.nextUrl.searchParams.get('tipo'); // 'identidad' | 'certificacion'
  if (!id || (tipo !== 'identidad' && tipo !== 'certificacion')) {
    return NextResponse.json({ error: 'Parámetros no válidos.' }, { status: 400 });
  }

  const tabla = tipo === 'identidad' ? 'red_verificaciones_identidad' : 'red_certificaciones';
  const { data: fila, error: errLeer } = await db.from(tabla).select('documento_path').eq('id', id).maybeSingle();
  if (errLeer) return NextResponse.json({ error: 'No se ha podido leer el documento.' }, { status: 500 });
  if (!fila) return NextResponse.json({ error: 'Documento no encontrado.' }, { status: 404 });

  const { data: firmada, error: errFirma } = await db.storage
    .from(BUCKET)
    .createSignedUrl(fila.documento_path as string, CADUCIDAD_SEGUNDOS);
  if (errFirma || !firmada) return NextResponse.json({ error: 'No se ha podido generar el enlace del documento.' }, { status: 500 });

  return NextResponse.json({ url: firmada.signedUrl });
}
