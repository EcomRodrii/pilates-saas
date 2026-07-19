import { Resend } from 'resend';

// Email de contacto a una candidata para cubrir una clase. Dos botones grandes:
// ACEPTO / No puedo — que llevan al deep link de aceptación (un tap, sin login).
// Mismo patrón de degradación que send-server.ts: si Resend no está configurado,
// no falla → { skipped }.

function esc(s: string): string {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}

export async function enviarEmailContactoSustituta(params: {
  to: string;
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string; // texto ya formateado, p.ej. "lunes 20 de julio · 18:00"
  url: string;    // la página de respuesta (ACEPTO / No puedo se pulsan allí)
  recordatorio?: boolean; // 2º toque: cambia el tono a "recordatorio"
}): Promise<{ ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!params.to) return { ok: false, error: 'Sin destinatario' };

  const { toName, estudioNombre, claseNombre, cuando, url, recordatorio } = params;
  const intro = recordatorio
    ? `Te escribimos hace un rato para cubrir una clase y aún no tenemos tu respuesta. Sigue disponible:`
    : `${esc(estudioNombre)} necesita cubrir una clase y has salido como la mejor opción:`;
  // El botón lleva a una PÁGINA (nunca acepta por GET: los prefetchers de correo
  // dispararían la aceptación al abrir el email). Allí pulsa ACEPTO / No puedo.
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 12px">Hola ${esc(toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">${recordatorio ? esc(estudioNombre) + ': ' : ''}${intro}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 24px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <a href="${url}" style="display:block;text-align:center;background:#6D28D9;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px;border-radius:12px">
      Ver la clase y responder
    </a>
    <p style="font-size:12px;color:#94a3b8;margin:22px 0 0;text-align:center">
      Un solo toque, sin instalar nada. Si otra persona la coge antes, te avisamos.
    </p>
  </div>`;

  const asunto = recordatorio
    ? `Recordatorio: ¿puedes cubrir ${claseNombre}? — ${estudioNombre}`
    : `¿Puedes cubrir ${claseNombre}? — ${estudioNombre}`;
  return enviar(params.to, asunto, html);
}

// Alerta a la propietaria: nadie responde ('sin_respuesta') o se agotó el ranking
// ('agotada'). Es el fallo controlado del motor: que la dueña se entere ELLA, no
// una alumna en la puerta (su miedo nº1). Enlaza al panel para decidir.
export async function enviarEmailAlertaPropietaria(params: {
  to: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  tipo: 'agotada' | 'sin_respuesta';
  candidataNombre?: string;
  urlPanel: string;
}): Promise<EnvioResultado> {
  const { estudioNombre, claseNombre, cuando, tipo, candidataNombre, urlPanel } = params;
  const agotada = tipo === 'agotada';
  const titulo = agotada ? 'Nadie ha podido cubrir esta clase' : `${candidataNombre ?? 'La candidata'} aún no responde`;
  const cuerpo = agotada
    ? `Hemos avisado a todas las candidatas disponibles y ninguna ha confirmado. La clase sigue sin sustituta y necesita tu decisión: avisar a alguien por tu cuenta o cancelarla (avisamos a las alumnas por ti).`
    : `Avisamos a ${esc(candidataNombre ?? 'la candidata')} y aún no ha respondido. Puedes esperar, avisar a otra candidata o cancelar la clase desde el panel.`;
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:18px;font-weight:800;margin:0 0 14px;color:${agotada ? '#B91C1C' : '#92400E'}">${esc(titulo)}</p>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:16px 18px;margin:0 0 18px">
      <p style="font-size:17px;font-weight:700;margin:0 0 4px">${esc(claseNombre)}</p>
      <p style="font-size:15px;color:#64748b;margin:0">${esc(cuando)}</p>
    </div>
    <p style="font-size:15px;line-height:1.5;margin:0 0 22px">${cuerpo}</p>
    <a href="${urlPanel}" style="display:block;text-align:center;background:#6D28D9;color:#fff;text-decoration:none;font-size:16px;font-weight:700;padding:14px;border-radius:12px">
      Abrir el panel de sustituciones
    </a>
    <p style="font-size:13px;color:#94a3b8;margin:22px 0 0">${esc(estudioNombre)}</p>
  </div>`;
  const asunto = agotada
    ? `⚠️ Sin sustituta para ${claseNombre} — necesita tu decisión`
    : `${candidataNombre ?? 'La candidata'} no responde — ${claseNombre}`;
  return enviar(params.to, asunto, html);
}

// ── Avisos a las alumnas apuntadas ──────────────────────────────────────────

// Se ha confirmado sustituta: la clase sigue en pie (mensaje tranquilizador).
export async function enviarEmailAlumnaClaseCubierta(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; sustituta: string;
}): Promise<EnvioResultado> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 14px">Hola ${esc(params.toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 18px">
      Tu clase <strong>${esc(params.claseNombre)}</strong> del ${esc(params.cuando)} <strong>sigue en pie</strong>.
      La dará <strong>${esc(params.sustituta)}</strong>. No tienes que hacer nada.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:18px 0 0">${esc(params.estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `Tu clase sigue en pie — ${params.claseNombre}`, html);
}

// No hay sustituta: la clase se cancela (que se entere por ti, no en la puerta).
export async function enviarEmailAlumnaClaseCancelada(params: {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string;
}): Promise<EnvioResultado> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#0f172a">
    <p style="font-size:16px;margin:0 0 14px">Hola ${esc(params.toName)},</p>
    <p style="font-size:16px;line-height:1.5;margin:0 0 18px">
      Sentimos avisarte de que tu clase <strong>${esc(params.claseNombre)}</strong> del ${esc(params.cuando)}
      <strong>se cancela</strong>. Disculpa las molestias — te esperamos en la próxima.
    </p>
    <p style="font-size:13px;color:#94a3b8;margin:18px 0 0">${esc(params.estudioNombre)}</p>
  </div>`;
  return enviar(params.to, `Clase cancelada — ${params.claseNombre}`, html);
}

type EnvioResultado = { ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string };

async function enviar(to: string, subject: string, html: string): Promise<EnvioResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || 'Tentare <onboarding@resend.dev>',
      to: [to], subject, html,
    });
    if (error) { console.error('[sustituciones/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[sustituciones/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}
