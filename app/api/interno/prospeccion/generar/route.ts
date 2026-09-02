import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { exigirPermiso } from '@/lib/interno/auth';
import { parseJsonIA } from '@/lib/ai/parse-ia';
import {
  PROSPECCION_EMAIL_SYSTEM_PROMPT, buildProspeccionEmailUserPrompt,
} from '@/lib/ai/prospeccion-email-prompt';
import { errorInterno } from '@/lib/errores-servidor';
import { aBorrador } from '@/lib/interno/prospeccion';

export const runtime = 'nodejs';

// Genera el borrador de UN prospecto. Uno por llamada, no el lote entero en una
// sola petición: así un fallo del modelo con un estudio raro no tumba los otros
// 99, la pantalla puede ir enseñando el progreso, y ninguna invocación se
// acerca al límite de tiempo del runtime.
//
// El cliente itera. Es más chatty, pero es la diferencia entre "han salido 63
// de 64" y "ha fallado la generación".

const client = new Anthropic();

export async function POST(req: NextRequest) {
  const g = await exigirPermiso(req, 'marketing.send');
  if ('error' in g) return g.error;

  const db = getSupabaseAdmin();
  if (!db) return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 });

  const cuerpo = (await req.json().catch(() => null)) as { leadId?: string } | null;
  const leadId = cuerpo?.leadId;
  if (!leadId) return NextResponse.json({ error: 'Falta el prospecto' }, { status: 400 });

  const { data: lead } = await db
    .from('plataforma_lead')
    .select('id, estudio, ciudad, web, instagram, software_actual, origen')
    .eq('id', leadId)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Ese prospecto no existe.' }, { status: 404 });

  // Nunca se generan correos en frío para un lead que llegó por su propio pie:
  // a quien pidió una demo se le contesta, no se le mete en una campaña.
  if (lead.origen !== 'IMPORT_PROSPECTOS') {
    return NextResponse.json({ error: 'Ese lead no es de prospección en frío.' }, { status: 400 });
  }

  // Si ya se le escribió, no hay nada que generar. Es la primera de las dos
  // barreras contra el doble envío; la otra es el índice único de la tabla.
  const { data: previos } = await db
    .from('plataforma_prospeccion_email')
    .select('id, estado').eq('lead_id', leadId);
  if ((previos ?? []).some(p => p.estado === 'ENVIADO')) {
    return NextResponse.json({ error: 'A ese estudio ya se le ha escrito.' }, { status: 409 });
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 900,
      system: PROSPECCION_EMAIL_SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: buildProspeccionEmailUserPrompt({
          estudio: (lead.estudio as string | null) ?? 'el estudio',
          ciudad: (lead.ciudad as string | null) ?? null,
          web: (lead.web as string | null) ?? null,
          instagram: (lead.instagram as string | null) ?? null,
          softwareActual: (lead.software_actual as string | null) ?? null,
        }),
      }],
    });

    const raw = message.content[0].type === 'text' ? message.content[0].text : '';
    let parsed: { asunto?: string; cuerpo?: string };
    try {
      parsed = parseJsonIA(raw);
    } catch {
      return NextResponse.json({ error: 'La IA ha devuelto algo que no es un correo.' }, { status: 502 });
    }
    const asunto = (parsed.asunto ?? '').trim();
    const texto = (parsed.cuerpo ?? '').trim();
    if (!asunto || !texto) {
      return NextResponse.json({ error: 'La IA ha devuelto un correo incompleto.' }, { status: 502 });
    }

    // Un borrador anterior sin aprobar se reemplaza en vez de acumularse: si no,
    // regenerar tres veces dejaría tres versiones fantasma en la cola y habría
    // que elegir entre ellas sin saber cuál es la buena.
    const previo = (previos ?? []).find(p => p.estado === 'BORRADOR');
    const ahora = new Date().toISOString();

    if (previo) {
      const { error } = await db.from('plataforma_prospeccion_email')
        .update({ asunto, cuerpo: texto, generado_en: ahora, error: null })
        .eq('id', previo.id);
      if (error) return NextResponse.json({ error: 'No se ha podido guardar el borrador.' }, { status: 500 });
    } else {
      const { error } = await db.from('plataforma_prospeccion_email').insert({
        id: `prosp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        lead_id: leadId, asunto, cuerpo: texto, estado: 'BORRADOR', generado_en: ahora,
      });
      if (error) return NextResponse.json({ error: 'No se ha podido guardar el borrador.' }, { status: 500 });
    }

    const { data: fila } = await db.from('plataforma_prospeccion_email')
      .select('*').eq('lead_id', leadId).neq('estado', 'DESCARTADO')
      .order('generado_en', { ascending: false }).limit(1).maybeSingle();

    // No se audita cada generación: no ha salido nada hacia fuera todavía, y
    // 100 líneas de "se generó un borrador" ahogarían el registro. Lo que sí se
    // audita es aprobar y enviar, que es cuando hay consecuencias.
    return NextResponse.json({ ok: true, borrador: fila ? aBorrador(fila) : null });
  } catch (err: unknown) {
    return errorInterno('interno/prospeccion/generar:POST', err, 'No se ha podido generar el correo.');
  }
}
