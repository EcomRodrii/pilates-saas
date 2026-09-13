import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';
import { comprobarAccesoSaludSocia } from '@/lib/datos-salud/acceso-servidor';

const client = new Anthropic();

// El texto que llega aquí es dato de salud de una socia (progreso, lesiones,
// limitaciones) y sale hacia un proveedor externo. Las mismas cerraduras que la
// RLS de `notas_progreso` (migr 20260913214116): rol clínico, consentimiento de
// salud vigente de ESA socia en ESTE estudio y, si es instructora, que sea su
// alumna. Con service-role la RLS no se aplica, así que la regla va en TS
// (`lib/datos-salud/acceso-servidor.ts`).

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
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  if (!puedeVerFichaClinica(sesion.rol)) {
    return NextResponse.json({ error: 'No tienes permiso para crear notas de salud' }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, 'ai-instructor-note', { max: 20, windowSeconds: 60 }, sesion.studioId);
  if (limited) return limited;
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;
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
    // Las dos pantallas que llaman aquí mandan siempre la socia: una nota de
    // sesión sin socia no pasaría la RLS de `notas_progreso` al guardarla.
    if (typeof socioId !== 'string' || !socioId) {
      return NextResponse.json({ error: 'Falta la clienta de la nota' }, { status: 400 });
    }
    const acceso = await comprobarAccesoSaludSocia(sesion, socioId, { exigirConsentimiento: true });
    if (!acceso.ok) return NextResponse.json({ error: acceso.error }, { status: acceso.status });

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
      parsed = parseJsonIA(raw);
    } catch {
      return NextResponse.json({ error: 'Respuesta IA inválida' }, { status: 500 });
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
    return errorInterno('ai/instructor-note:POST', err, 'No se ha podido generar la nota con IA.');
  }
}
