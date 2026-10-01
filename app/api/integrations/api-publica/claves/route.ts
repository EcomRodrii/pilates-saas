import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { uid } from '@/lib/utils';
import { generarClaveApi } from '@/lib/api-publica/claves';
import { exigirGestorApi, listarClaves, clavePanel, sedesDeLaCadena, COLUMNAS_CLAVE } from '@/lib/api-publica/gestion';
import { MAX_CLAVES_ACTIVAS, caducidadDesde, estadoClave, filtroClaves, validarNuevaClave } from '@/lib/api-publica/gestion-reglas';

// GET: las claves del estudio (nunca su valor), si la API está activada y, a la
// dueña de una cadena, sus sedes (para las claves de cadena: cadena.ts).
// POST: crea una clave. Devuelve la clave en claro UNA vez; después solo queda
// su hash (lib/api-publica/claves.ts). Solo PROPIETARIO (`puedeGestionarClavesApi`);
// una clave de cadena, solo la dueña de la cadena (`g.cadenaId`).
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-claves-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const g = await exigirGestorApi(req);
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const [claves, sedes] = await Promise.all([listarClaves(g), sedesDeLaCadena(g)]);
  if (!claves) return NextResponse.json({ error: 'No se pudieron leer las claves.' }, { status: 500 });
  // Una «cadena» de una sola sede no necesita claves de cadena: no se ofrecen.
  return NextResponse.json({ activada: g.activada, permitidos: g.permitidos, claves, sedesCadena: sedes.length > 1 ? sedes : null });
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
  if (v.valor.alcance === 'cadena' && !g.cadenaId) {
    return NextResponse.json({ error: 'Solo la dueña de la cadena puede crear una clave para todas sus sedes.' }, { status: 403 });
  }

  // Solo las que AÚN valen: una caducada sin revocar no ocupa sitio. La
  // caducidad se mira aquí y no con otro `.or()`: el filtro de alcance ya es uno.
  const { data: vivas, error: errVivas } = await g.admin.from('api_claves').select('revocada_en, expira_en')
    .or(filtroClaves(g)).is('revocada_en', null);
  if (errVivas) return NextResponse.json({ error: 'No se pudo crear la clave.' }, { status: 500 });
  const ahora = new Date();
  if ((vivas ?? []).filter((c) => estadoClave(c, ahora) === 'activa').length >= MAX_CLAVES_ACTIVAS) {
    return NextResponse.json({ error: `Tienes ${MAX_CLAVES_ACTIVAS} claves activas: revoca alguna antes de crear otra.` }, { status: 409 });
  }

  const nueva = generarClaveApi();
  const { data, error } = await g.admin.from('api_claves').insert({
    id: `apik-${uid()}`, studio_id: g.studioId, nombre: v.valor.nombre, prefijo: nueva.prefijo, hash: nueva.hash,
    scopes: v.valor.scopes, creada_por: g.userId, expira_en: caducidadDesde(ahora, v.valor.caducaEnDias),
    cadena_id: v.valor.alcance === 'cadena' ? g.cadenaId : null,
  }).select(COLUMNAS_CLAVE).single();
  if (error || !data) return NextResponse.json({ error: 'No se pudo crear la clave.' }, { status: 500 });

  return NextResponse.json({ clave: nueva.clave, detalle: clavePanel(data) }, { status: 201 });
}
