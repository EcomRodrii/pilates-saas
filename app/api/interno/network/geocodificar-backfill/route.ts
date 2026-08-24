import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { geocodificarDireccion } from '@/lib/network/geocodificar';

export const runtime = 'nodejs';
// El lote respeta 1 petición/segundo a Nominatim con margen (1100ms entre
// llamadas dentro del lote) — 20 filas tardan ~22s, así que el timeout por
// defecto de una función de Vercel (10s en el plan free, hasta 60s en el
// resto) puede cortar un lote de 20 en el plan gratuito. Se deja el LÍMITE
// configurable (tope duro 20) para que quien lance el backfill en
// producción pueda usar lotes más pequeños si hace falta — no se sube el
// tope por defecto para no tentar a nadie a saltarse el margen de 1.1s.
const LIMITE_MAXIMO = 20;
const LIMITE_DEFECTO = 20;
const PAUSA_ENTRE_LLAMADAS_MS = 1100;

function esperar(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

interface ResultadoLote {
  tabla: 'red_perfiles' | 'studios';
  procesados: number;
  geocodificados: number;
  sinResultado: number;
  restantes: number;
}

// Backfill de lat/lng para perfiles de Network y estudios — Tentare Network
// 2.0 F2 (mapa real del buscador). Nadie ha rellenado nunca estas columnas
// (nullable desde F0, migr 20260824191258); este endpoint se llama a mano,
// REPETIDAMENTE, hasta vaciar el backlog. Sin cron nuevo a propósito —
// Inngest ya está cerca del límite del plan free (.claude/tentare-os.md),
// y este backfill es un evento puntual de una sola vez, no un trabajo
// recurrente.
//
// ⚠️ Protegido igual que el resto de /api/interno/network (exigirPermiso,
// mismo permiso 'network.moderate' que ya usa el endpoint hermano de
// moderación de perfiles, app/api/interno/network/perfiles/route.ts) —
// nunca alcanzable por `anon`/`authenticated` normal. Es intencionadamente
// el ÚNICO camino que llama a Nominatim en bucle; el guardado normal del
// perfil (PUT /api/network/perfil) hace como mucho UNA llamada por
// petición, así que no necesita este mismo control de tasa.
export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'network.moderate');
  if ('error' in g) return g.error;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const tablaParam = req.nextUrl.searchParams.get('tabla');
  const tabla: 'red_perfiles' | 'studios' = tablaParam === 'studios' ? 'studios' : 'red_perfiles';

  const limiteParam = Number(req.nextUrl.searchParams.get('limite'));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0
    ? Math.min(Math.trunc(limiteParam), LIMITE_MAXIMO)
    : LIMITE_DEFECTO;

  const resultado = tabla === 'red_perfiles'
    ? await geocodificarLoteRedPerfiles(admin, limite)
    : await geocodificarLoteStudios(admin, limite);

  return NextResponse.json(resultado);
}

async function geocodificarLoteRedPerfiles(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, limite: number,
): Promise<ResultadoLote> {
  // "Ya publicados" (petición explícita): draft/en_revision/hidden/
  // suspended no se geocodifican — no aparecen en el buscador público, así
  // que gastar cuota de Nominatim en ellos es prematuro. Si se publican
  // más tarde, esta misma llamada repetida los recoge.
  const { data: filas, error: errLeer } = await admin
    .from('red_perfiles')
    .select('id, ciudad, zona')
    .eq('estado', 'published')
    .not('ciudad', 'is', null)
    .is('lat', null)
    .order('creado_en', { ascending: true })
    .limit(limite);
  if (errLeer || !filas) {
    return { tabla: 'red_perfiles', procesados: 0, geocodificados: 0, sinResultado: 0, restantes: 0 };
  }

  let geocodificados = 0;
  let sinResultado = 0;
  for (let i = 0; i < filas.length; i++) {
    if (i > 0) await esperar(PAUSA_ENTRE_LLAMADAS_MS);
    const fila = filas[i] as { id: string; ciudad: string | null; zona: string | null };
    const coords = fila.ciudad ? await geocodificarDireccion(fila.ciudad, fila.zona) : null;
    if (coords) {
      await admin.from('red_perfiles').update({ lat: coords.lat, lng: coords.lng }).eq('id', fila.id);
      geocodificados++;
    } else {
      sinResultado++;
    }
  }

  const { count: restantes } = await admin
    .from('red_perfiles')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'published')
    .not('ciudad', 'is', null)
    .is('lat', null);

  return { tabla: 'red_perfiles', procesados: filas.length, geocodificados, sinResultado, restantes: restantes ?? 0 };
}

async function geocodificarLoteStudios(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, limite: number,
): Promise<ResultadoLote> {
  // `studios` no tiene un `estado` de publicación como red_perfiles — todo
  // estudio dado de alta ya es "real" (docs/tentare-os.md: la prueba de 7
  // días también crea un estudio real). Sin columna `zona` en studios
  // (solo ciudad/direccion) — se geocodifica solo por ciudad, mismo criterio
  // de "mejor esfuerzo" que el resto.
  const { data: filas, error: errLeer } = await admin
    .from('studios')
    .select('id, ciudad')
    .not('ciudad', 'is', null)
    .is('lat', null)
    .order('creado_en', { ascending: true })
    .limit(limite);
  if (errLeer || !filas) {
    return { tabla: 'studios', procesados: 0, geocodificados: 0, sinResultado: 0, restantes: 0 };
  }

  let geocodificados = 0;
  let sinResultado = 0;
  for (let i = 0; i < filas.length; i++) {
    if (i > 0) await esperar(PAUSA_ENTRE_LLAMADAS_MS);
    const fila = filas[i] as { id: string; ciudad: string | null };
    const coords = fila.ciudad ? await geocodificarDireccion(fila.ciudad) : null;
    if (coords) {
      await admin.from('studios').update({ lat: coords.lat, lng: coords.lng }).eq('id', fila.id);
      geocodificados++;
    } else {
      sinResultado++;
    }
  }

  const { count: restantes } = await admin
    .from('studios')
    .select('id', { count: 'exact', head: true })
    .not('ciudad', 'is', null)
    .is('lat', null);

  return { tabla: 'studios', procesados: filas.length, geocodificados, sinResultado, restantes: restantes ?? 0 };
}
