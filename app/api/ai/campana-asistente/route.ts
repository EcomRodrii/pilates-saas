import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { errorInterno } from '@/lib/errores-servidor';

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres un asistente de marketing para un estudio de Pilates.
Recibes un objetivo en lenguaje natural (ej. "recordar a las que se les acaba el bono") y una lista de segmentos de audiencia disponibles con cuántas socias tiene cada uno.

Tu tarea:
1. Elige el segmento (el "value" exacto de la lista, ninguno inventado) que mejor encaja con el objetivo.
2. Escribe un nombre corto para la campaña.
3. Escribe un asunto y el contenido del mensaje (tono cercano, profesional, nunca infantil — como Apple Fitness o Strava, no como un chiringuito). Usa variables {nombre}, {fecha}, {plan} donde tenga sentido.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "nombre": "string",
  "destinatariosSugeridos": "string — uno de los values recibidos, exacto",
  "razonSegmento": "string — una frase explicando por qué ese segmento encaja con el objetivo",
  "asunto": "string",
  "contenido": "string"
}
Responde SOLO con el JSON, sin texto adicional.`;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;
  try {
    const body = await req.json();
    const { objetivo, tipo, segmentos } = body as {
      objetivo: string;
      tipo: string;
      segmentos: { value: string; label: string; count: number }[];
    };

    if (!objetivo?.trim()) {
      return NextResponse.json({ error: 'Objetivo requerido' }, { status: 400 });
    }

    const contexto = `Objetivo de la campaña: ${objetivo}\nTipo de mensaje: ${tipo}\nSegmentos disponibles:\n${segmentos.map(s => `- value="${s.value}" (${s.label}): ${s.count} socias`).join('\n')}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contexto }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: {
      nombre: string;
      destinatariosSugeridos: string;
      razonSegmento: string;
      asunto: string;
      contenido: string;
    };

    try {
      parsed = parseJsonIA(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    const segmentoValido = segmentos.some(s => s.value === parsed.destinatariosSugeridos);

    return NextResponse.json({
      nombre: parsed.nombre,
      destinatariosSugeridos: segmentoValido ? parsed.destinatariosSugeridos : 'TODAS',
      razonSegmento: parsed.razonSegmento,
      asunto: parsed.asunto,
      contenido: parsed.contenido,
    });
  } catch (err: unknown) {
    return errorInterno('ai/campana-asistente:POST', err, 'No se ha podido generar la campaña con IA.');
  }
}
