import { Resend } from 'resend';
import { render } from '@react-email/render';
import type { TipoAlertaPropietaria } from '@/lib/sustituciones/mensajes';
import {
  ContactoSustitutaEmail, AlertaPropietariaEmail, AlumnaAvisoClaseEmail, asuntoAvisoAlumna,
  type AvisoAlumna,
} from '@/lib/emails/sustitucion-template';
import { remitentePorMarca } from '@/lib/emails/remitente';

// Emails del módulo de sustituciones, con la plantilla premium compartida
// (lib/emails/layout.tsx) — marca del estudio (logo + colorPrimario) igual
// que el resto del producto. Mismo patrón de degradación que send-server.ts:
// si Resend no está configurado, no falla → { skipped }.

interface Marca {
  logoUrl?: string | null;
  colorPrimario?: string | null;
  /** El email del estudio: a dónde contesta la alumna si responde al aviso. */
  replyTo?: string | null;
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
  return enviar(to, asunto, html, 'Tentare Core');
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
  return enviar(to, asunto, html, 'Tentare Manager');
}

// ── Aviso a las alumnas apuntadas ───────────────────────────────────────────

// Un solo emisor para los tres desenlaces (hay sustituta / la clase se mueve /
// la clase se cae): eran tres funciones idénticas salvo el asunto, y el asunto
// ya vive con el resto de la copy en la plantilla.
export async function enviarEmailAvisoAlumna(params: Marca & {
  to: string;
  toName: string;
  estudioNombre: string;
  claseNombre: string;
  // Cuándo era la clase. En 'reprogramada' es el horario ORIGINAL: el nuevo va
  // dentro de `aviso.cuandoNuevo`.
  cuando: string;
  aviso: AvisoAlumna;
}): Promise<EnvioResultado> {
  const html = await render(AlumnaAvisoClaseEmail(params));
  // ⚠️ Aquí ponía `'Tentare'`. Es un email A LA ALUMNA que dice que su clase se
  // cancela o cambia de instructora, y llegaba con el nombre de la plataforma
  // como remitente mientras el cuerpo ya llevaba el logo y el color del
  // estudio: incoherente, y contrario a la regla de marca del repo (a las
  // alumnas se les habla SIEMPRE con la marca de su estudio, nunca con la
  // nuestra). El comentario de `enviar()` justificaba el «Tentare» diciendo que
  // los nombres de producto interno no le dicen nada a una alumna — cierto, pero
  // la conclusión correcta de eso es el nombre del ESTUDIO, no la marca
  // paraguas.
  return enviar(
    params.to, asuntoAvisoAlumna(params.aviso, params.claseNombre), html,
    params.estudioNombre, params.replyTo,
  );
}

type EnvioResultado = { ok: true; id?: string } | { ok: false; skipped: true } | { ok: false; error: string };

// Un envío colgado (Resend sin responder) no debe alargar indefinidamente un
// PATCH de confirmar/cancelar/reprogramar sustitución — mismo motivo que el
// AbortSignal.timeout de entregarExternos() en lib/notifications/engine.ts.
function conTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Tiempo de espera agotado al enviar el email')), ms)),
  ]);
}

// `marca`: nombre mostrado como remitente. 'Tentare Core' para instructoras y
// 'Tentare Manager' para propietaria/gerencia (son NUESTRO producto, ver
// `nombreAppPorRol`); para las ALUMNAS, el nombre de su estudio — a ellas los
// nombres de producto interno no les dicen nada, y la marca paraguas tampoco.
//
// `replyTo`: a quién contesta la alumna si responde. Sin esto la respuesta se
// pierde en el buzón de la plataforma en vez de llegar a su estudio.
async function enviar(to: string, subject: string, html: string, marca: string, replyTo?: string | null): Promise<EnvioResultado> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.startsWith('re_XXXX')) return { ok: false, skipped: true };
  if (!to) return { ok: false, error: 'Sin destinatario' };
  try {
    const resend = new Resend(apiKey);
    const { data, error } = await conTimeout(resend.emails.send({
      from: remitentePorMarca(marca),
      to: [to], subject, html,
      ...(replyTo ? { replyTo } : {}),
    }), 10_000);
    if (error) { console.error('[sustituciones/email]', error); return { ok: false, error: error.message }; }
    return { ok: true, id: data?.id };
  } catch (err) {
    console.error('[sustituciones/email]', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Error al enviar' };
  }
}
