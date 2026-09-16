import { Resend } from 'resend';
import type { TipoAlertaPropietaria } from '@/lib/sustituciones/mensajes';
import { correoContactoSustituta, correoAlertaPropietaria } from '@/lib/emails/tentare/equipo';
import { correoAvisoSustitucion, asuntoAvisoAlumna, type AvisoAlumna } from '@/lib/emails/estudio/avisos';
import type { MarcaCorreo } from '@/lib/emails/estudio/plantilla';
import { remitentePorMarca } from '@/lib/emails/remitente';

// Emails del módulo de sustituciones. Los dos al EQUIPO (contactar a una
// sustituta, avisar a la propietaria) los firma Tentare y van con su sistema
// (lib/emails/tentare/); el aviso a la ALUMNA lleva la marca de su estudio
// (lib/emails/estudio/). Mismo patrón de degradación que send-server.ts: si
// Resend no está configurado, no falla → { skipped }.

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
  const { to, toName, estudioNombre, claseNombre, cuando, url, recordatorio } = params;
  // Firma Tentare: `logoUrl`/`colorPrimario` se aceptan pero ya no pintan.
  const html = correoContactoSustituta({ toName, estudioNombre, claseNombre, cuando, url, recordatorio });
  const asunto = recordatorio
    ? `Recordatorio: ¿puedes cubrir ${claseNombre}? — ${estudioNombre}`
    : `¿Puedes cubrir ${claseNombre}? — ${estudioNombre}`;
  return enviar(to, asunto, html, 'Tentare');
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
  nNetwork?: number;       // 'agotada': profesionales de Network propuestos (solo el número)
}): Promise<EnvioResultado> {
  const { to, estudioNombre, claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando, nNetwork } = params;
  const agotada = tipo === 'agotada';
  const baja = tipo === 'baja';
  const sinSustituta = tipo === 'sin_sustituta';
  const html = correoAlertaPropietaria({ estudioNombre, claseNombre, cuando, tipo, candidataNombre, urlPanel, yaContactando, nNetwork });
  const asunto = baja
    ? `${candidataNombre ?? 'Una instructora'} no puede dar ${claseNombre} — ya estamos en ello`
    : agotada
      ? `⚠️ Sin sustituta para ${claseNombre} — necesita tu decisión`
      : sinSustituta
        ? `⚠️ ${claseNombre} se quedó sin cubrir`
        : `${candidataNombre ?? 'La candidata'} no responde — ${claseNombre}`;
  return enviar(to, asunto, html, 'Tentare Manager');
}

// ── Aviso a las alumnas apuntadas ───────────────────────────────────────────

// Un solo emisor para los tres desenlaces (hay sustituta / la clase se mueve /
// la clase se cae): eran tres funciones idénticas salvo el asunto, y el asunto
// ya vive con el resto de la copy en la plantilla.
export async function enviarEmailAvisoAlumna(params: {
  to: string;
  toName: string;
  // La marca del estudio, ya resuelta: este correo se pinta con el sistema del
  // estudio (lib/emails/estudio/), no con el layout genérico del producto.
  marca: MarcaCorreo;
  /** El email del estudio: a dónde contesta la alumna si responde al aviso. */
  replyTo?: string | null;
  claseNombre: string;
  // Cuándo era la clase. En 'reprogramada' es el horario ORIGINAL: el nuevo va
  // dentro de `aviso.cuandoNuevo`.
  cuando: string;
  aviso: AvisoAlumna;
}): Promise<EnvioResultado> {
  const html = correoAvisoSustitucion(params);
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
    params.marca.estudioNombre, params.replyTo,
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

// `marca`: nombre mostrado como remitente. 'Tentare' para instructoras (Tentare
// Core se retiró) y 'Tentare Manager' para propietaria/gerencia (ver
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
