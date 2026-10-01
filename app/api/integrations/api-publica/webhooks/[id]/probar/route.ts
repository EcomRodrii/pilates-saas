import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit, rateLimit } from '@/lib/rate-limit';
import { SIN_ACCESO, exigirGestorWebhooks, probarWebhook } from '@/lib/api-publica/webhooks/gestion';

// POST: manda un aviso de prueba ahora y dice qué contestó el destino. Con
// límite por webhook: es nuestro servidor el que llama a una URL ajena.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-probar', { max: 20, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  if (!r.g.activada) return NextResponse.json({ error: 'La API no está activada para tu estudio.' }, { status: 403 });
  if (!r.g.conAcceso) return NextResponse.json({ error: SIN_ACCESO }, { status: 403 });
  const { id } = await params;
  const porWebhook = await rateLimit(`api-webhooks-probar:${r.g.studioId}:${id}`, { max: 5, windowSeconds: 60 });
  if (!porWebhook.allowed) return NextResponse.json({ error: 'Espera un minuto antes de volver a probarlo.' }, { status: 429 });
  const p = await probarWebhook(r.g, id);
  if (!p.ok) return NextResponse.json({ error: p.error }, { status: p.status });
  return NextResponse.json(p.resultado);
}
