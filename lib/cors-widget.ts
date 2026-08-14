import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// CORS para los endpoints públicos que el bundle embebible (Modo B, script+div
// sin iframe) llama desde el dominio del ESTUDIO, no desde el de Tentare — sin
// iframe no hay same-origin gratis. Nunca un wildcard: se refleja el Origin
// solo si está en la lista blanca del estudio (studios.widget_dominios_autorizados).
//
// El preflight OPTIONS no lleva el body JSON (solo cabeceras + la URL), así
// que el identificador del estudio para resolver la lista blanca tiene que
// venir SIEMPRE por query param (?slug=... o ?studioId=...) en las llamadas
// del bundle — nunca solo en el body, o el preflight no podría saber a qué
// estudio pertenece la petición real.
export async function origenPermitido(
  identificador: { slug?: string | null; studioId?: string | null },
  origin: string | null,
): Promise<string | null> {
  if (!origin) return null;
  const admin = getSupabaseAdmin();
  if (!admin) return null;
  let query = admin.from('studios').select('widget_dominios_autorizados');
  if (identificador.slug) query = query.eq('slug', identificador.slug);
  else if (identificador.studioId) query = query.eq('id', identificador.studioId);
  else return null;
  const { data } = await query.maybeSingle();
  const dominios = (data?.widget_dominios_autorizados ?? []) as string[];
  return dominios.includes(origin) ? origin : null;
}

export function corsHeadersWidget(origenValido: string | null): HeadersInit {
  if (!origenValido) return {};
  return {
    'Access-Control-Allow-Origin': origenValido,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '600',
  };
}

// Handler compartido para las respuestas OPTIONS (preflight) de los endpoints
// públicos que el bundle puede llamar cross-origin. Un origen no autorizado
// recibe 204 sin cabeceras CORS — el navegador bloqueará la petición real por
// su cuenta, sin que el servidor tenga que distinguir "no autorizado" de
// "estudio inexistente" en el propio preflight.
export async function respuestaPreflightWidget(req: NextRequest): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get('slug');
  const studioId = req.nextUrl.searchParams.get('studioId');
  const origin = req.headers.get('origin');
  const origenValido = await origenPermitido({ slug, studioId }, origin);
  return new NextResponse(null, { status: 204, headers: corsHeadersWidget(origenValido) });
}

// Envuelve la respuesta REAL (no solo el preflight) con las cabeceras CORS —
// el navegador exige Access-Control-Allow-Origin en la respuesta de verdad
// para poder leerla, en cualquier código de estado, no solo en el 204 del
// preflight. El identificador de estudio para CORS se lee siempre de la URL
// (query param), independiente de qué use la lógica de negocio del body.
export async function conCorsWidget(req: NextRequest, respuesta: NextResponse): Promise<NextResponse> {
  const slug = req.nextUrl.searchParams.get('slug');
  const studioId = req.nextUrl.searchParams.get('studioId');
  if (!slug && !studioId) return respuesta;
  const origin = req.headers.get('origin');
  const origenValido = await origenPermitido({ slug, studioId }, origin);
  for (const [k, v] of Object.entries(corsHeadersWidget(origenValido))) respuesta.headers.set(k, v);
  return respuesta;
}
