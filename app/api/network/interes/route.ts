import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { LEGAL } from '@/lib/legal-info';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { cayoEnLaTrampa, CAMPO_TRAMPA } from '@/lib/auth/trampa-bots';

// Captación de demanda de ESTUDIO en Tentare Network mientras la oferta de
// instructoras todavía es pequeña (brief "captación de estudios", punto 17 y
// empty state de ciudad/búsqueda, punto 16/19). Reusa `plataforma_lead`
// (mismo patrón que /api/public/migracion-concierge) en vez de una tabla
// nueva — el CRM de crecimiento (/interno/crecimiento) ya lee esa tabla sin
// filtrar por `origen`, así que un lead de aquí aparece ahí sin tocar nada
// más.
//
// Dos orígenes distintos con el mismo endpoint, no dos endpoints: la única
// diferencia real es qué campos son obligatorios (una candidatura de estudio
// pide más contexto que "avísame cuando lleguéis a mi ciudad"). El `origen`
// SIEMPRE lo decide el servidor a partir de qué campos llegaron, nunca un
// valor libre del cliente — así no puede llegar un origen inventado al CRM.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'network-interes', { max: 5, windowSeconds: 600 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as
    ({ email?: string; nombre?: string; estudio?: string; ciudad?: string; mensaje?: string } & Record<string, unknown>) | null;

  // Trampa ANTES de tocar la BD. Responde "ok" sin guardar nada — un 400 le
  // enseñaría al bot qué campo delatarlo, mismo criterio que
  // interes-lanzamiento cuando existía.
  if (cayoEnLaTrampa(body?.[CAMPO_TRAMPA])) {
    console.warn('[network:interes] campo trampa relleno: descartado en silencio');
    return NextResponse.json({ ok: true });
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const nombre = typeof body?.nombre === 'string' ? body.nombre.trim().slice(0, 120) : '';
  const estudio = typeof body?.estudio === 'string' ? body.estudio.trim().slice(0, 120) : '';
  const ciudad = typeof body?.ciudad === 'string' ? body.ciudad.trim().slice(0, 120) : '';
  const mensaje = typeof body?.mensaje === 'string' ? body.mensaje.trim().slice(0, 600) : '';
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 });
  }

  // "Interés de estudio" trae qué busca (nombre de estudio o mensaje); el
  // resto es la vía ligera "avísame cuando lleguéis a mi ciudad".
  const origen = estudio || mensaje ? 'NETWORK_ESTUDIO' : 'NETWORK_CIUDAD';

  let guardado = false;
  const db = getSupabaseAdmin();
  if (db) {
    const { error } = await db.from('plataforma_lead').upsert(
      {
        id: `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        email: email.toLowerCase(),
        nombre: nombre || null,
        estudio: estudio || null,
        ciudad: ciudad || null,
        mensaje: mensaje || null,
        origen,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'email', ignoreDuplicates: false },
    );
    if (error) console.error('[network:interes] no se ha podido guardar el lead', error);
    else guardado = true;
  }

  const apiKey = process.env.RESEND_API_KEY;
  const puedeEnviar = Boolean(apiKey) && !apiKey!.startsWith('re_XXXX');
  if (puedeEnviar) {
    try {
      const resend = new Resend(apiKey);
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const asunto = origen === 'NETWORK_ESTUDIO'
        ? `Network: un estudio busca instructora${ciudad ? ` en ${esc(ciudad)}` : ''}`
        : `Network: interés en una ciudad${ciudad ? ` (${esc(ciudad)})` : ''}`;
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
        to: ['soporte@tentare.app'],
        replyTo: email,
        subject: asunto,
        html:
          `<p>${esc(email)}${nombre ? ` — ${esc(nombre)}` : ''}${estudio ? ` (${esc(estudio)})` : ''}</p>` +
          (ciudad ? `<p>Ciudad: <strong>${esc(ciudad)}</strong></p>` : '') +
          (mensaje ? `<p>${esc(mensaje)}</p>` : '') +
          `<p>Está en <a href="${LEGAL.url}/interno/crecimiento">Crecimiento</a>.</p>`,
      });
      if (error) console.error('[network:interes]', error);
    } catch (err) {
      console.error('[network:interes]', err);
    }
  }

  if (!guardado && !puedeEnviar) {
    return NextResponse.json(
      { error: 'No se ha podido registrar tu solicitud. Escríbenos a hola@tentare.app.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
