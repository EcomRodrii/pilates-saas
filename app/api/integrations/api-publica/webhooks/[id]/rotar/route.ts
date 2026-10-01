import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { exigirGestorWebhooks, rotarSecreto } from '@/lib/api-publica/webhooks/gestion';
import { HORAS_SOLAPE_SECRETO } from '@/lib/api-publica/webhooks/gestion-reglas';

// POST: secreto de firma nuevo, enseñado UNA vez. El anterior sigue firmando
// (segunda `v1` en la cabecera) durante 24 h, para cambiarlo sin perder avisos.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit(req, 'api-webhooks-rotar', { max: 10, windowSeconds: 60 });
  if (limited) return limited;
  const r = await exigirGestorWebhooks(req);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const { id } = await params;
  const rotado = await rotarSecreto(r.g, id);
  if (!rotado.ok) return NextResponse.json({ error: rotado.error }, { status: rotado.status });
  return NextResponse.json({ secreto: rotado.secreto, anteriorValeHoras: HORAS_SOLAPE_SECRETO });
}
