import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uid } from '@/lib/utils';
import { generarClaveApi } from '@/lib/api-publica/claves';
import { exigirGestorApi, listarClaves, clavePanel, COLUMNAS_CLAVE } from '@/lib/api-publica/gestion';
import { MAX_CLAVES_ACTIVAS, caducidadDesde, validarNuevaClave } from '@/lib/api-publica/gestion-reglas';

// GET: las claves del estudio (nunca su valor) y si la API está activada.
// POST: crea una clave. Devuelve la clave en claro UNA vez; después solo queda
// su hash (lib/api-publica/claves.ts). Solo PROPIETARIO (`puedeGestionarClavesApi`).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-claves-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const claves = await listarClaves(g.admin, g.studioId);
  if (!claves) return NextResponse.json({ error: 'No se pudieron leer las claves.' }, { status: 500 });
  return NextResponse.json({ activada: g.activada, permitidos: g.permitidos, claves });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-claves-post', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });
  if (!g.activada) {
    return NextResponse.json({ error: 'La API no está activada para tu estudio. Escríbenos y la activamos.' }, { status: 403 });
  }

  const v = validarNuevaClave(await req.json().catch(() => null), g.permitidos);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  // Solo las que AÚN valen: una caducada sin revocar no ocupa sitio.
  const { count } = await g.admin.from('api_claves').select('id', { count: 'exact', head: true })
    .eq('studio_id', g.studioId).is('revocada_en', null)
    .or(`expira_en.is.null,expira_en.gt.${new Date().toISOString()}`);
  if ((count ?? 0) >= MAX_CLAVES_ACTIVAS) {
    return NextResponse.json({ error: `Tienes ${MAX_CLAVES_ACTIVAS} claves activas: revoca alguna antes de crear otra.` }, { status: 409 });
  }

  const nueva = generarClaveApi();
  const { data, error } = await g.admin.from('api_claves').insert({
    id: `apik-${uid()}`, studio_id: g.studioId, nombre: v.valor.nombre, prefijo: nueva.prefijo, hash: nueva.hash,
    scopes: v.valor.scopes, creada_por: g.userId, expira_en: caducidadDesde(new Date(), v.valor.caducaEnDias),
  }).select(COLUMNAS_CLAVE).single();
  if (error || !data) return NextResponse.json({ error: 'No se pudo crear la clave.' }, { status: 500 });

  return NextResponse.json({ clave: nueva.clave, detalle: clavePanel(data) }, { status: 201 });
}
