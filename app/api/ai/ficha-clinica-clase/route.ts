import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { FICHA_CLINICA_CLASE_SYSTEM_PROMPT, buildFichaClinicaClaseUserPrompt } from '@/lib/ai/ficha-clinica-clase-prompt';
import type { ResumenClaseSalud } from '@/lib/ficha-clinica';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;
  try {
    // El cliente envía el agregado ANÓNIMO ya calculado (resumenSaludClase).
    // No llegan nombres ni datos personales — la IA solo redacta (§9).
    const resumen = (await req.json()) as ResumenClaseSalud;
    if (typeof resumen?.totalAlumnas !== 'number') {
      return NextResponse.json({ error: 'Resumen inválido' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: FICHA_CLINICA_CLASE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildFichaClinicaClaseUserPrompt(resumen) }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: { resumen: string; evitar: string[]; variantes: string[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    return NextResponse.json({
      resumen: parsed.resumen ?? '',
      evitar: Array.isArray(parsed.evitar) ? parsed.evitar : [],
      variantes: Array.isArray(parsed.variantes) ? parsed.variantes : [],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
