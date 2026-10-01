import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { COLUMNAS_ENTREGA_PANEL, entregaPanel, exigirGestorWebhooks, webhookDelEstudio } from '@/lib/api-publica/webhooks/gestion';

// GET: las últimas 30 entregas de un webhook (qué se mandó, cuándo y qué contestó).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-entregas', { max: 60, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { id } = await params;
  const w = await webhookDelEstudio(r.g.admin, r.g.studioId, id);
  if (!w) return NextResponse.json({ error: 'Webhook no encontrado' }, { status: 404 });
  const { data, error } = await r.g.admin.from('api_webhook_entregas').select(COLUMNAS_ENTREGA_PANEL)
    .eq('webhook_id', id).eq('studio_id', r.g.studioId)
    .order('creada_en', { ascending: false }).limit(30);
  if (error) return NextResponse.json({ error: 'No se pudieron leer las entregas.' }, { status: 500 });
  return NextResponse.json({ entregas: ((data ?? []) as unknown as Record<string, unknown>[]).map(entregaPanel) });
}
