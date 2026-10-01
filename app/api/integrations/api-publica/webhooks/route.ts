import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { SIN_ACCESO, comprobarDestino, crearWebhook, exigirGestorWebhooks, listarWebhooks } from '@/lib/api-publica/webhooks/gestion';
import { MAX_WEBHOOKS, validarNuevoWebhook } from '@/lib/api-publica/webhooks/gestion-reglas';

// GET: los webhooks del estudio (nunca su secreto) y qué avisos se pueden activar.
// POST: crea uno. Devuelve el secreto de firma UNA vez; después solo queda
// cifrado. Solo PROPIETARIO y con la API activada.
export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-webhooks-get', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const webhooks = await listarWebhooks(r.g.admin, r.g.studioId);
  if (!webhooks) return NextResponse.json({ error: 'No se pudieron leer los webhooks.' }, { status: 500 });
  return NextResponse.json({ activada: r.g.activada, tipos: r.g.tipos, webhooks });
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'api-webhooks-post', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { g } = r;
  if (!g.activada) return NextResponse.json({ error: 'La API no está activada para tu estudio. Escríbenos y la activamos.' }, { status: 403 });
  if (!g.conAcceso) return NextResponse.json({ error: SIN_ACCESO }, { status: 403 });

  const v = validarNuevoWebhook(await req.json().catch(() => null), g.tipos);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const destino = await comprobarDestino(v.valor.url);
  if (!destino.ok) return NextResponse.json({ error: destino.error }, { status: 400 });

  // Los borrados no cuentan (se guardan como rastro, no como webhooks).
  const { count } = await g.admin.from('api_webhooks').select('id', { count: 'exact', head: true })
    .eq('studio_id', g.studioId).is('borrado_en', null);
  if ((count ?? 0) >= MAX_WEBHOOKS) {
    return NextResponse.json({ error: `Tienes ${MAX_WEBHOOKS} webhooks: borra alguno antes de crear otro.` }, { status: 409 });
  }

  const creado = await crearWebhook(g, v.valor);
  if (!creado.ok) return NextResponse.json({ error: creado.error }, { status: creado.status });
  return NextResponse.json({ id: creado.id, secreto: creado.secreto }, { status: 201 });
}
