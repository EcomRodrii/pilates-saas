import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { RECOMENDACION_SYSTEM_PROMPT, buildRecomendacionUserPrompt, type RecomendacionInput } from '@/lib/ai/recomendacion-prompt';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { errorInterno } from '@/lib/errores-servidor';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;
  try {
    const body = await req.json() as RecomendacionInput;
    if (body.tipo !== 'REACTIVACION' && body.tipo !== 'CLASE_LLENA' && body.tipo !== 'CROSS_SELL') {
      return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: RECOMENDACION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildRecomendacionUserPrompt(body) }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: { asunto: string; mensaje: string };
    try {
      parsed = parseJsonIA(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    return NextResponse.json({ asunto: parsed.asunto ?? '', mensaje: parsed.mensaje ?? '' });
  } catch (err: unknown) {
    return errorInterno('ai/recomendacion:POST', err, 'No se ha podido generar la recomendación con IA.');
  }
}
