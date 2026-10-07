import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verificarSesionStaff } from '@/lib/auth-server';
import { getSupabaseAdmin } from '@/lib/db/supabase-admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  AYUDA_LLAMADA, AYUDAS_QUE_AVISAN, ETIQUETA_HORA, decidirLlamada,
} from '@/lib/llamada/solicitud';
import { mostrarE164 } from '@/lib/llamada/telefono';

// Ayuda humana pedida en el asistente de bienvenida tras crear un estudio
// (components/onboarding/pantalla-bienvenida.tsx): «Prefiero que me llamen» o
// «Configuradlo por mí».
//
// Antes de esto la respuesta se guardaba SOLO en studios.onb_ayuda_alta y nadie
// del equipo la leía: la propietaria creía que alguien la iba a llamar y no
// llegaba a pasar (detectado en pruebas de usuario con la persona "Carmen").
//
// «Prefiero que me llamen» lleva además un teléfono, que se guarda SOLO si la
// persona lo da y marca el consentimiento (lib/llamada/solicitud.ts decide, y
// es lo mismo que comprueba el asistente). Vive en `solicitudes_llamada`, que
// el fundador ve en /interno/llamadas. Nunca va al log ni a Sentry: ni el
// número ni el cuerpo; de un error de base de datos solo se registra su código.
function esc(s: string): string {
  return s.replace(/[<>&]/g, (c) => (c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'));
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, 'onboarding-ayuda-alta', { max: 10, windowSeconds: 60 });
  if (limited) return limited;

  const sesion = await verificarSesionStaff(req);
  if (!sesion) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  // El asistente solo lo ve la propietaria. Una instructora o recepción no
  // pide la puesta en marcha de un estudio que no es suyo.
  if (sesion.rol !== 'PROPIETARIO') return NextResponse.json({ error: 'No autorizado' }, { status: 403 });

  const body = (await req.json().catch(() => null)) as
    | { ayuda?: string; software?: string | null; prefijo?: unknown; telefono?: unknown; consentimiento?: unknown; horaPreferida?: unknown }
    | null;
  const ayuda = typeof body?.ayuda === 'string' ? body.ayuda : '';
  if (!AYUDAS_QUE_AVISAN.has(ayuda)) return NextResponse.json({ ok: true, skipped: true });

  const admin = getSupabaseAdmin();

  // La llamada: validar ANTES de avisar a nadie, y guardar antes de decir que sí.
  let telefono: string | null = null;
  let horaPreferida: string | null = null;
  if (ayuda === AYUDA_LLAMADA) {
    const d = decidirLlamada({ ayuda, ...body });
    if (d.tipo === 'invalida') return NextResponse.json({ error: d.error }, { status: 400 });
    if (d.tipo !== 'guardar') return NextResponse.json({ ok: true, skipped: true });
    if (!admin) return NextResponse.json({ error: 'No se ha podido guardar tu petición. Prueba otra vez.' }, { status: 503 });
    telefono = d.e164;
    horaPreferida = d.horaPreferida;

    // Una sola pendiente por estudio: pedirla otra vez actualiza la misma.
    const fallo = (e: { code?: string } | null) => {
      // Solo el código: el mensaje de un CHECK incluye la fila entera, teléfono incluido.
      console.error('[onboarding/ayuda-alta] solicitudes_llamada', e?.code ?? 'sin-codigo');
      return NextResponse.json({ error: 'No se ha podido guardar tu petición. Prueba otra vez.' }, { status: 500 });
    };
    const ahora = new Date().toISOString();
    const act = await admin.from('solicitudes_llamada')
      .update({ telefono, hora_preferida: horaPreferida, consentimiento_en: ahora })
      .eq('studio_id', sesion.studioId).eq('estado', 'pendiente').select('id');
    if (act.error) return fallo(act.error);
    if (!act.data || act.data.length === 0) {
      const ins = await admin.from('solicitudes_llamada').insert({
        studio_id: sesion.studioId, telefono, hora_preferida: horaPreferida, consentimiento_en: ahora,
      });
      if (ins.error && ins.error.code !== '23505') return fallo(ins.error);
    }
  }

  const nombreEstudio = admin
    ? (await admin.from('studios').select('nombre').eq('id', sesion.studioId).maybeSingle()).data?.nombre ?? sesion.nombre
    : sesion.nombre;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return NextResponse.json({ ok: true, guardada: telefono !== null, skipped: true });

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: ['soporte@tentare.app'],
      ...(sesion.email ? { replyTo: sesion.email } : {}),
      subject: `[Puesta en marcha] ${esc(nombreEstudio)} pide "${esc(ayuda)}"`,
      html:
        `<p><strong>${esc(nombreEstudio)}</strong> acaba de crear su estudio y ha pedido: <strong>${esc(ayuda)}</strong>.</p>` +
        (telefono
          ? `<p>Teléfono: <strong>${esc(mostrarE164(telefono))}</strong>` +
            (horaPreferida ? ` · ${esc(ETIQUETA_HORA[horaPreferida as keyof typeof ETIQUETA_HORA] ?? '')}` : '') +
            `. Aceptó que la llamemos una vez, solo para ayudarla con el alta. Está en /interno/llamadas.</p>`
          : '') +
        (body?.software ? `<p>Viene de: ${esc(body.software)}</p>` : '') +
        `<p>Contacto: ${sesion.email ? esc(sesion.email) : '<em>no disponible</em>'}</p>`,
    });
    if (error) {
      console.error('[onboarding/ayuda-alta] resend', error.name);
      // La llamada ya está guardada y el fundador la ve en /interno: el correo
      // es el aviso, no la petición. Para «Configuradlo por mí» no hay otra
      // vía, así que sigue diciendo que no ha salido.
      if (telefono) return NextResponse.json({ ok: true, guardada: true, avisada: false });
      return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
    }
  } catch {
    console.error('[onboarding/ayuda-alta] resend lanzó');
    if (telefono) return NextResponse.json({ ok: true, guardada: true, avisada: false });
    return NextResponse.json({ error: 'No se ha podido enviar' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, guardada: telefono !== null });
}
