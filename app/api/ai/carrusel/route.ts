import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import { errorInterno } from '@/lib/errores-servidor';

const client = new Anthropic();

const SYSTEM_PROMPT = `Eres un creador experto de carruseles para Instagram/LinkedIn de un negocio de fitness/wellness (estudio de pilates y gimnasio).
Recibes un TEMA y un número de diapositivas de contenido deseado. Generas un carrusel completo.

Estructura obligatoria:
- 1 diapositiva "portada" con un gancho potente que detenga el scroll.
- N diapositivas "contenido" (según se pida), cada una con un punto claro y accionable.
- 1 diapositiva "cta" final con llamada a la acción (guardar, seguir, reservar…).

Tono: cercano, profesional y motivador. Texto breve (las diapositivas no son párrafos).

Responde SIEMPRE con un JSON válido, sin texto adicional, con esta estructura exacta:
{
  "slides": [
    { "tipo": "portada",  "titulo": "string", "cuerpo": "string" },
    { "tipo": "contenido","titulo": "string", "cuerpo": "string" },
    { "tipo": "cta",      "titulo": "string", "cuerpo": "string" }
  ]
}`;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;

  try {
    const { tema, slides } = (await req.json()) as { tema?: string; slides?: number };
    if (!tema?.trim()) return NextResponse.json({ error: 'Tema requerido' }, { status: 400 });
    const nContenido = Math.min(8, Math.max(2, Number(slides) || 4));

    const contexto = `Tema del carrusel: ${tema}\nDiapositivas de contenido deseadas: ${nContenido} (además de la portada y la de CTA).`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1100,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contexto }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed: { slides?: { tipo?: string; titulo?: string; cuerpo?: string }[] };
    try { parsed = parseJsonIA(raw); } catch { return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 502 }); }

    const tiposValidos = ['portada', 'contenido', 'cta'];
    const slidesLimpias = (parsed.slides ?? [])
      .filter((s) => s && s.titulo)
      .map((s) => ({
        tipo: tiposValidos.includes(s.tipo ?? '') ? s.tipo : 'contenido',
        titulo: String(s.titulo ?? ''),
        cuerpo: String(s.cuerpo ?? ''),
      }));

    if (slidesLimpias.length === 0) return NextResponse.json({ error: 'La IA no devolvió diapositivas', raw }, { status: 502 });

    return NextResponse.json({ slides: slidesLimpias });
  } catch (err: unknown) {
    return errorInterno('ai/carrusel:POST', err, 'No se ha podido generar el carrusel con IA.');
  }
}
