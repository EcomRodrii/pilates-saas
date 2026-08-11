import { NextRequest, NextResponse } from 'next/server';
import { LEGAL } from '@/lib/legal-info';
import { Resend } from 'resend';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';

// Concierge de migración (landing): la propietaria deja su email y de qué
// software viene, y Tentare le hace la migración (48h).
//
// ⚠️ Este es el ÚNICO canal de entrada real de leads del producto, y hasta la
// migración 0136 no guardaba nada: mandaba un correo a soporte@tentare.app y ya.
// Si `RESEND_API_KEY` no estaba puesta, devolvía `{ok:true, skipped:true}` y el
// lead se perdía en silencio mientras la visitante leía "Recibido, te
// escribimos en menos de 24h".
//
// Por eso el orden de aquí abajo importa y no es casual: **primero se guarda,
// después se avisa**. Un correo que no sale se puede reenviar mirando la tabla;
// un lead que no se guardó no existe.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'public-migracion-concierge', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as { email?: string; software?: string } | null;
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  const software = typeof body?.software === 'string' ? body.software.trim().slice(0, 120) : '';
  if (!EMAIL_RE.test(email) || email.length > 200) {
    return NextResponse.json({ error: 'Email no válido' }, { status: 400 });
  }

  // ── 1. Guardar ────────────────────────────────────────────────────────────
  let guardado = false;
  const db = getSupabaseAdmin();
  if (db) {
    // `upsert` sobre el email: el formulario es público y recargarlo tres veces
    // no puede crear tres leads. Si la misma persona vuelve se refresca el
    // software y la fecha, pero NO se tocan `estado` ni `notas`: alguien pudo
    // haberlo trabajado ya, y pisarlo lo devolvería a la bandeja de nuevos.
    const { error } = await db.from('plataforma_lead').upsert(
      {
        id: `lead-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        email: email.toLowerCase(),
        software_actual: software || null,
        origen: 'CONCIERGE',
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'email', ignoreDuplicates: false },
    );
    if (error) console.error('[public:migracion-concierge] no se ha podido guardar el lead', error);
    else guardado = true;
  }

  // ── 2. Avisar ─────────────────────────────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const puedeEnviar = Boolean(apiKey) && !apiKey!.startsWith('re_XXXX');

  if (puedeEnviar) {
    try {
      const resend = new Resend(apiKey);
      // Escapar TODO lo que venga del formulario antes de incrustarlo en el HTML
      // del correo interno: EMAIL_RE admite `<`/`>`/`"`, así que un email tipo
      // `a@b.c"><img onerror=…>` inyectaba HTML en el cliente de correo del equipo.
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      const { error } = await resend.emails.send({
        from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
        to: ['soporte@tentare.app'],
        replyTo: email,
        subject: `Migración concierge solicitada${software ? ` — viene de ${software}` : ''}`,
        html:
          `<p>Una propietaria quiere que le hagamos la migración:</p>` +
          `<p><strong>${esc(email)}</strong>${software ? ` — software actual: <strong>${esc(software)}</strong>` : ''}</p>` +
          `<p>Siguiente paso: responderle pidiendo los exports (o acceso) y montarle el estudio con /migracion en menos de 48h.</p>` +
          `<p>Está en el panel, en <a href="${LEGAL.url}/interno/crecimiento">Crecimiento</a>.</p>`,
      });
      if (error) console.error('[public:migracion-concierge]', error);
    } catch (err) {
      console.error('[public:migracion-concierge]', err);
    }
  }

  // Que el correo falle ya no es un 502: el lead está guardado y se ve en el
  // panel, así que la promesa que se le hace a la visitante sigue siendo cierta.
  // Lo que sí es un error es no haber podido guardar Y no poder avisar — ahí no
  // lo ha recogido nadie, y decirle "recibido" sería mentirle.
  if (!guardado && !puedeEnviar) {
    return NextResponse.json(
      { error: 'No se ha podido registrar tu solicitud. Escríbenos a hola@tentare.app.' },
      { status: 503 },
    );
  }

  return NextResponse.json({ ok: true });
}
