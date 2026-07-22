import { Resend } from 'resend';
import { render } from '@react-email/render';
import type { TipoAlertaPropietaria } from '@/lib/sustituciones/mensajes';
import {
  ContactoSustitutaEmail, AlertaPropietariaEmail, AlumnaClaseCubiertaEmail, AlumnaClaseCanceladaEmail,
} from '@/lib/emails/sustitucion-template';

// Emails del módulo de sustituciones, con la plantilla premium compartida
// (lib/emails/layout.tsx) — marca del estudio (logo + colorPrimario) igual
// que el resto del producto. Mismo patrón de degradación que send-server.ts:
// si Resend no está configurado, no falla → { skipped }.

interface Marca {
  logoUrl?: string | null;
  colorPrimario?: string | null;
}

export async function enviarEmailContactoSustituta(params: Marca & {
  to: string;
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string; // texto ya formateado, p.ej. "lunes 20 de julio · 18:00"
  url: string;    // la página de respuesta (ACEPTO / No puedo se pulsan allí)
  recordatorio?: boolean; // 2º toque: cambia el tono a "recordatorio"
}): Promise<EnvioResultado> {
  const { to, toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, url, recordatorio } = params;
  const html = await render(ContactoSustitutaEmail({ toName, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, url, recordatorio }));
  const asunto = recordatorio
    ? `Recordatorio: ¿puedes cubrir ${claseNombre}? — ${estudioNombre}`
    : `¿Puedes cubrir ${claseNombre}? — ${estudioNombre}`;
  return enviar(to, asunto, html);
}

// Alerta a la propietaria: nadie responde ('sin_respuesta') o se agotó el ranking
// ('agotada'). Es el fallo controlado del motor: que la dueña se entere ELLA, no
// una alumna en la puerta (su miedo nº1). Enlaza al panel para decidir.
export async function enviarEmailAlertaPropietaria(params: Marca & {
  to: string;
  estudioNombre: string;
  claseNombre: string;
  cuando: string;
  tipo: TipoAlertaPropietaria;
  candidataNombre?: string;
  urlPanel: string;
  yaContactando?: boolean; // 'baja': el motor ya está avisando a candidatas
}): Promise<EnvioResultado> {
  const { to, estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando } = params;
  const agotada = tipo === 'agotada';
  const baja = tipo === 'baja';
  const html = await render(AlertaPropietariaEmail({ estudioNombre, logoUrl, colorPrimario, claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando }));
  const asunto = baja
    ? `${candidataNombre ?? 'Una instructora'} no puede dar ${claseNombre} — ya estamos en ello`
    : agotada
      ? `⚠️ Sin sustituta para ${claseNombre} — necesita tu decisión`
      : `${candidataNombre ?? 'La candidata'} no responde — ${claseNombre}`;
  return enviar(to, asunto, html);
}

// ── Avisos a las alumnas apuntadas ──────────────────────────────────────────

// Se ha confirmado sustituta: la clase sigue en pie (mensaje tranquilizador).
export async function enviarEmailAlumnaClaseCubierta(params: Marca & {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string; sustituta: string;
}): Promise<EnvioResultado> {
  const html = await render(AlumnaClaseCubiertaEmail(params));
  return enviar(params.to, `Tu clase sigue en pie — ${params.claseNombre}`, html);
}

// No hay sustituta: la clase se cancela (que se entere por ti, no en la puerta).
export async function enviarEmailAlumnaClaseCancelada(params: Marca & {
  to: string; toName: string; estudioNombre: string; claseNombre: string; cuando: string;
}): Promise<EnvioResultado> {
  const html = await render(AlumnaClaseCanceladaEmail(params));
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
