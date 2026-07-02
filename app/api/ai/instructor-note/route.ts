import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres un asistente para instructores de pilates.
Tu tarea es convertir notas de texto libre (dictadas por voz o escritas rápidamente) en una nota de progreso estructurada.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "progreso": "string | null — Descripción del progreso observado en esta sesión",
  "alertas": "string | null — Lesiones, limitaciones o aspectos a tener en cuenta",
  "planProximaSesion": "string | null — Qué trabajar en la próxima sesión",
  "ejerciciosCasa": "string | null — Ejercicios que puede hacer en casa esta semana"
}

Si el texto no menciona algún campo, devuelve null para ese campo.
Responde SOLO con el JSON, sin texto adicional.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { texto, socioId, instructorId, sesionId } = body as {
      texto: string;
      socioId: string;
      instructorId: string;
      sesionId?: string;
    };

    if (!texto?.trim()) {
      return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: texto }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: {
      progreso: string | null;
      alertas: string | null;
      planProximaSesion: string | null;
      ejerciciosCasa: string | null;
    };

    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    return NextResponse.json({
      socioId,
      instructorId,
      sesionId: sesionId ?? null,
      textoLibre: texto,
      progreso: parsed.progreso ?? null,
      alertas: parsed.alertas ?? null,
      planProximaSesion: parsed.planProximaSesion ?? null,
      ejerciciosCasa: parsed.ejerciciosCasa ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
