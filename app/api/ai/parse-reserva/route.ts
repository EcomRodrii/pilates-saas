import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres un asistente que interpreta peticiones en lenguaje natural de socias de un estudio de pilates que quieren reservar (o cancelar) una clase.

Responde SIEMPRE con un JSON válido con esta estructura exacta:
{
  "intencion": "RESERVAR" | "CANCELAR" | "DESCONOCIDA",
  "tipoClase": "string | null — nombre aproximado del tipo de clase mencionado (ej. \\"reformer\\", \\"mat\\"), tal cual lo dice el usuario",
  "diaSemana": "LUNES" | "MARTES" | "MIERCOLES" | "JUEVES" | "VIERNES" | "SABADO" | "DOMINGO" | null,
  "fechaRelativa": "HOY" | "MANANA" | null,
  "hora": "string | null — hora en formato HH:mm 24h, ej \\"18:00\\"",
  "instructor": "string | null — nombre aproximado del instructor mencionado"
}

Reglas:
- Si el texto menciona un día relativo ("hoy", "mañana") usa "fechaRelativa" y deja "diaSemana" en null.
- Si menciona un día de la semana ("el martes") usa "diaSemana" y deja "fechaRelativa" en null.
- Si no hay ninguna referencia de fecha, deja ambos en null.
- Si el texto no es una petición de reserva o cancelación de clase, "intencion" es "DESCONOCIDA".
- Responde SOLO con el JSON, sin texto adicional ni explicaciones.`;

export interface ParsedReserva {
  intencion: 'RESERVAR' | 'CANCELAR' | 'DESCONOCIDA';
  tipoClase: string | null;
  diaSemana: 'LUNES' | 'MARTES' | 'MIERCOLES' | 'JUEVES' | 'VIERNES' | 'SABADO' | 'DOMINGO' | null;
  fechaRelativa: 'HOY' | 'MANANA' | null;
  hora: string | null;
  instructor: string | null;
}

export async function POST(req: NextRequest) {
  try {
    const { texto } = (await req.json()) as { texto: string };

    if (!texto?.trim()) {
      return NextResponse.json({ error: 'Texto requerido' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: texto }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: ParsedReserva;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
