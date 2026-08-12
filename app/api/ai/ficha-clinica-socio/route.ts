import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { FICHA_CLINICA_SOCIO_SYSTEM_PROMPT, buildFichaClinicaSocioUserPrompt } from '@/lib/ai/ficha-clinica-socio-prompt';
import type { CondicionSalud } from '@/lib/types';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFichaClinica(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para ver la ficha clínica' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'ai-ficha-clinica-socio', { max: 20, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;
  try {
    // El cliente envía las condiciones ACTIVAS ya cargadas bajo RLS. Nunca
    // llega el nombre de la socia — la IA solo redacta (§9).
    const body = (await req.json()) as { condiciones?: CondicionSalud[] };
    if (!Array.isArray(body?.condiciones) || body.condiciones.length === 0) {
      return NextResponse.json({ error: 'Faltan condiciones de salud' }, { status: 400 });
    }

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: FICHA_CLINICA_SOCIO_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildFichaClinicaSocioUserPrompt(body.condiciones) }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';

    let parsed: { resumen: string; evitar: string[]; variantes: string[] };
    try {
      parsed = parseJsonIA(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 500 });
    }

    return NextResponse.json({
      resumen: parsed.resumen ?? '',
      evitar: Array.isArray(parsed.evitar) ? parsed.evitar : [],
      variantes: Array.isArray(parsed.variantes) ? parsed.variantes : [],
    });
  } catch (err: unknown) {
    return errorInterno('ai/ficha-clinica-socio:POST', err, 'No se ha podido generar la adaptación con IA.');
  }
}
