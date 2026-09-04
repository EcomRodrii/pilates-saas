import { NextRequest, NextResponse } from 'next/server';
import { verificarUsuarioSupabase } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { socioAutenticado } from '@/lib/db/supabase-data-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { errorInterno, errorPeticion } from '@/lib/errores-servidor';
import type { RowDocumentosSocio } from '@/lib/db-types';

// Buzón de documentos — lado SOCIA. Mismo criterio que
// app/api/public/mensajeria/conversaciones (GET): la socia no tiene JWT
// `authenticated` de Postgres con fila propia de negocio, así que esta ruta
// usa service-role y filtra EXPLÍCITAMENTE por su socio_id (derivado del JWT
// verificado, NUNCA de un query param) — nunca fiándose de que RLS lo haría
// por ella (de hecho no podría: la tabla no tiene ninguna policy para ella).
//
// El bucket `documentos-socio` no tiene policy de SELECT para NADIE —ni
// staff ni socia (migración 20260826200010)— así que la única forma de leer
// un documento es una URL firmada generada aquí con service-role, después de
// comprobar caducidad/soft-delete en la tabla.
const BUCKET = 'documentos-socio';
const CADUCIDAD_URL_SEGUNDOS = 60;

export interface DocumentoSociaView {
  id: string;
  categoria: RowDocumentosSocio['categoria'];
  titulo: string;
  creadoEn: string;
  url: string;
}

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-documentos-socio', { max: 30, windowSeconds: 60 });
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const studioId = searchParams.get('studioId');
  if (!studioId) return errorPeticion('Falta el estudio.');

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const user = await verificarUsuarioSupabase(req);
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const socioId = await socioAutenticado(user.userId, studioId);
  if (!socioId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const ahora = new Date().toISOString();
  const { data, error } = await admin
    .from('documentos_socio')
    .select('id, categoria, titulo, storage_path, caduca_en, creado_en')
    .eq('studio_id', studioId)
    .eq('socio_id', socioId)
    .is('borrado_en', null)
    // Un documento caducado no debe ser descargable por la socia, aunque el
    // staff lo siga viendo en su lista (histórico) — filtrado aquí, no
    // después en TS, para no traer/firmar nada que no se va a devolver.
    .or(`caduca_en.is.null,caduca_en.gt.${ahora}`)
    .order('creado_en', { ascending: false });
  if (error) return errorInterno('public/documentos-socio:GET', error, 'No se han podido cargar tus documentos.');

  const filas = (data ?? []) as Pick<RowDocumentosSocio, 'id' | 'categoria' | 'titulo' | 'storage_path' | 'caduca_en' | 'creado_en'>[];
  if (filas.length === 0) return NextResponse.json({ documentos: [] });

  const { data: firmadas, error: errorFirma } = await admin.storage
    .from(BUCKET)
    .createSignedUrls(filas.map(f => f.storage_path), CADUCIDAD_URL_SEGUNDOS);
  if (errorFirma || !firmadas) {
    return errorInterno('public/documentos-socio:GET:firma', errorFirma ?? new Error('sin URLs firmadas'), 'No se han podido cargar tus documentos.');
  }

  // createSignedUrls devuelve un resultado por path EN EL MISMO ORDEN que se
  // pidió (mismo criterio que app/api/network/portfolio) — por índice, nunca
  // buscando el path de vuelta.
  const documentos: DocumentoSociaView[] = filas
    .map((f, i) => (firmadas[i]?.signedUrl
      ? { id: f.id, categoria: f.categoria, titulo: f.titulo, creadoEn: f.creado_en, url: firmadas[i].signedUrl }
      : null))
    .filter((d): d is DocumentoSociaView => d !== null);

  return NextResponse.json({ documentos });
}
