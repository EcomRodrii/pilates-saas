import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { errorInterno } from '@/lib/errores-servidor';
import { enforceRateLimit } from '@/lib/rate-limit';
import { puedeVerFichaClinica } from '@/lib/permisos-reglas';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

const client = new Anthropic();

// El texto que llega aquí es dato de salud de una socia (progreso, lesiones,
// limitaciones) y sale hacia un proveedor externo. Dos cerraduras, las mismas
// que la RLS de `notas_progreso`: el rol que puede ver la ficha clínica y el
// consentimiento de salud vigente de ESA socia, en ESTE estudio.
//
// ⚠️ El consentimiento se lee de las columnas, no con la RPC
// `tiene_consentimiento_salud`: con service-role `auth.uid()` es NULL y la RPC
// se salta el filtro de estudio.
async function motivoSinConsentimiento(studioId: string, socioId: string): Promise<string | null> {
  const admin = getSupabaseAdmin();
  if (!admin) return 'No se ha podido comprobar el consentimiento de salud de esta clienta.';
  const { data, error } = await admin.from('socios')
    .select('consentimiento_salud_fecha, consentimiento_salud_revocado_en')
    .eq('id', socioId)
    .eq('studio_id', studioId)
    .is('borrado_en', null)
    .maybeSingle();
  if (error || !data) return 'No encontramos a esta clienta en tu estudio.';
  if (!data.consentimiento_salud_fecha || data.consentimiento_salud_revocado_en) {
    return 'Registra primero el consentimiento de salud de esta clienta.';
  }
  return null;
}

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
    const motivo = await motivoSinConsentimiento(sesion.studioId, socioId);
    if (motivo) return NextResponse.json({ error: motivo }, { status: 403 });

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
    return errorInterno('ai/instructor-note:POST', err, 'No se ha podido generar la nota con IA.');
  }
}
