import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { exigirGestorApi } from '@/lib/api-publica/gestion';

// GET: las últimas llamadas a la API del estudio (claves y apps OAuth), para
// el registro de actividad del panel: qué se pidió, con qué credencial, y si
// salió bien. Sin la IP: no hace falta para saber si una integración funciona.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-actividad-get', { max: 30, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data, error } = await g.admin.from('oauth_auditoria_accesos')
    .select('id, creado_en, metodo, ruta, status_code, scope_usado, api_clave_id, cliente_id')
    .eq('studio_id', g.studioId).order('creado_en', { ascending: false }).limit(100);
  if (error) return NextResponse.json({ error: 'No se pudo leer la actividad.' }, { status: 500 });

  return NextResponse.json({
    llamadas: (data ?? []).map((f) => ({
      id: f.id, en: f.creado_en, metodo: f.metodo, ruta: f.ruta, status: f.status_code, scope: f.scope_usado,
      claveId: f.api_clave_id, appId: f.cliente_id,
    })),
  });
}
