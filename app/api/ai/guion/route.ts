import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { verificarSesionStaff } from '@/lib/auth-server';
import { bloqueoPorFeature } from '@/lib/billing/billing-guard';
import { parseJsonIA } from '@/lib/ai/parse-ia';

const client = new Anthropic();

const PLATAFORMAS_VALIDAS = ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', 'twitter'];

const SYSTEM_PROMPT = `Eres un guionista experto en contenido para redes sociales de un negocio de fitness/wellness (estudio de pilates y gimnasio).
Recibes un TEMA y opcionalmente una plataforma objetivo. Generas un guion de vídeo corto listo para grabar.

Tono: cercano, profesional y motivador — como Apple Fitness o Nike Training, nunca infantil ni "chiringuito".

Responde SIEMPRE con un JSON válido, sin texto adicional, con esta estructura exacta:
{
  "titulo": "string — título del vídeo, con gancho",
  "gancho": "string — primeros 3 segundos, frase que detiene el scroll",
  "desarrollo": "string — cuerpo del guion, 2-4 frases con el valor principal",
  "cta": "string — llamada a la acción final",
  "descripcion": "string — descripción/caption para publicar",
  "hashtags": ["#tag1", "#tag2", "#tag3", "#tag4", "#tag5"],
  "duracionSegundos": number (entre 15 y 90),
  "plataforma": "string — una de: instagram, tiktok, youtube, facebook, linkedin, twitter — la más adecuada"
}`;

export async function POST(req: NextRequest) {
  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  const bloqueoIA = await bloqueoPorFeature(sesion.studioId, 'ia');
  if (bloqueoIA) return bloqueoIA;

  try {
    const { tema, plataforma } = (await req.json()) as { tema?: string; plataforma?: string };
    if (!tema?.trim()) return NextResponse.json({ error: 'Tema requerido' }, { status: 400 });

    const contexto = `Tema del contenido: ${tema}${plataforma ? `\nPlataforma preferida: ${plataforma}` : ''}`;

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 900,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: contexto }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed: Record<string, unknown>;
    try { parsed = parseJsonIA(raw); } catch { return NextResponse.json({ error: 'Respuesta IA inválida', raw }, { status: 502 }); }

    const plat = typeof parsed.plataforma === 'string' && PLATAFORMAS_VALIDAS.includes(parsed.plataforma)
      ? parsed.plataforma : (plataforma && PLATAFORMAS_VALIDAS.includes(plataforma) ? plataforma : 'instagram');
    const dur = Number(parsed.duracionSegundos);

    return NextResponse.json({
      titulo: String(parsed.titulo ?? tema),
      gancho: String(parsed.gancho ?? ''),
      desarrollo: String(parsed.desarrollo ?? ''),
      cta: String(parsed.cta ?? ''),
      descripcion: String(parsed.descripcion ?? ''),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.map(String).slice(0, 10) : [],
      duracionSegundos: Number.isFinite(dur) ? Math.min(90, Math.max(15, dur)) : 45,
      plataforma: plat,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
