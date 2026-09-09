// WhatsApp Business — Meta Cloud API. Cada estudio pega su PROPIO token de
// acceso y su ID de número de teléfono (su propia app de Meta for Developers,
// su propio número de WhatsApp Business) en Configuración → Integraciones —
// no hay cuenta compartida de plataforma. Mismo mecanismo que Kisi/Resend:
// tabla `integraciones` por estudio (ver dbUpsertIntegracion).
//
// Es el ÚNICO canal de WhatsApp del repo desde 2026-09-09. Antes convivía con
// lib/twilio.ts, una credencial única de plataforma que servía a otros siete
// emisores; se retiró entera porque en producción no existía ninguna variable
// TWILIO_*, así que ninguno de ellos mandaba un solo mensaje (ver
// WHATSAPP_AUDIT.md §0). Si algún día vuelve a hacer falta un canal de
// plataforma, es una decisión nueva — no un hueco pendiente.

import { fetchExterno } from './fetch-externo.ts';
import { telefonoE164 } from './decision/mensajes-socia.ts';

const API_VERSION = process.env.WHATSAPP_API_VERSION ?? 'v21.0';

export interface WhatsAppCredenciales {
  token: string;
  phoneId: string;
}

/**
 * El destinatario tal y como lo quiere Meta: dígitos con prefijo de país y sin
 * '+'.
 *
 * Antes esto era un «quitar todo lo que no sea dígito» aquí mismo, y ese atajo se
 * come justo el caso normal de este producto: los teléfonos se guardan como los
 * teclea la propietaria («612 34 56 78»), y quitar lo que no es dígito deja
 * `612345678` — nueve dígitos sin país, que para Meta no es nadie. `telefonoE164`
 * (la misma que ya usaba el canal de Twilio antes de retirarse, y la que
 * construye los enlaces wa.me del panel) sí añade el +34 a un móvil español.
 * Sin esto, migrar los emisores a Meta habría cambiado «no manda nada» por
 * «manda a un número que no existe», que es peor porque parece que funciona.
 */
function destinoWhatsApp(to: string | null | undefined): string | null {
  const e164 = telefonoE164(to);
  return e164 ? e164.slice(1) : null;
}

/** Envía un mensaje de texto simple por WhatsApp. `to` en cualquier formato: se normaliza. */
export async function enviarWhatsAppTexto(
  creds: WhatsAppCredenciales,
  to: string | null | undefined,
  texto: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const destino = destinoWhatsApp(to);
  if (!destino) return { ok: false, error: 'Número de destino inválido' };
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: destino, type: 'text', text: { body: texto } }),
    });
    const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Plantilla HSM usada para el recordatorio de clase — un mensaje iniciado por
// el negocio (lo dispara un cron, no una respuesta a la clienta), así que
// Meta lo rechaza como `type: 'text'` fuera de la ventana de 24h desde el
// último mensaje entrante de la socia (error 131047). Cada estudio tiene que
// registrar esta plantilla EXACTA en su propia cuenta de Meta y esperar su
// aprobación — ver instrucciones en components/configuracion/tab-integraciones.tsx.
export const PLANTILLA_RECORDATORIO = { nombre: 'recordatorio_clase', idioma: 'es' } as const;

// Aviso de hueco libre («Rellenar hueco» de la home y el radar de ocupación).
// Plantilla PROPIA y no la de recordatorio por dos motivos que no se pueden
// juntar en una: el cuerpo es distinto (invita a reservar, no recuerda una
// reserva que ya existe) y sobre todo la CATEGORÍA de Meta es distinta —
// esto es MARKETING, no UTILITY, porque su fin es que la socia compre una
// plaza. Mandarlo bajo una plantilla de utilidad es justo lo que Meta
// recategoriza o tumba.
//
// Por eso también tiene su propio interruptor en Configuración →
// Integraciones (`plantillaHuecoAprobada`) en vez de reutilizar el del
// recordatorio: un estudio puede tener aprobada una y no la otra, y dar por
// aprobada la que no lo está devuelve error 132001 («template does not
// exist») en TODOS los envíos, no en algunos.
//
// El cuerpo termina en texto fijo a propósito (`¡Te esperamos!`): así ninguna
// variable queda pegada al final, que es donde Meta es más quisquillosa al
// revisar una plantilla.
export const PLANTILLA_HUECO = { nombre: 'hueco_disponible', idioma: 'es' } as const;

// Aviso a la instructora candidata para que cubra una clase (subida de canal
// del motor de escalado de sustituciones, `recordatorioPorMensaje`).
//
// De los siete emisores que salían por Twilio, este es el ÚNICO que se lleva
// plantilla propia, y por una razón concreta: es el único cuyo cuerpo tiene
// forma FIJA. Los demás (campañas, automatizaciones, el contacto del Decision
// OS, /api/mensajes/send) mandan texto que escribe la propietaria o redacta la
// IA — arbitrario y casi siempre multilínea, y un parámetro de plantilla de
// Meta no admite saltos de línea ni tabuladores ni más de 4 espacios seguidos.
// No es que quedara feo meterlo en un `{{1}}`: Meta lo rechaza. Así que esos
// van como texto y solo llegan dentro de la ventana de 24 h.
//
// Y es también el que más falta le hace: es la escalada de un email que la
// instructora NO ha contestado, así que dar por hecho que ella escribió al
// estudio en las últimas 24 h es dar por hecho justo lo contrario de lo que
// está pasando.
//
// Categoría UTILITY: no vende nada, es una petición operativa de trabajo con
// un enlace para responderla. ⚠️ Meta podría recategorizarla a MARKETING —
// para ellos «utilidad» es el seguimiento de una transacción de un CLIENTE, y
// esto va a una trabajadora. Afectaría al precio de la conversación, no a la
// entrega; confirmarlo con la primera aprobación real.
//
// Termina en texto fijo por lo mismo que PLANTILLA_HUECO: Meta no aprueba un
// cuerpo que acabe en variable.
export const PLANTILLA_SUSTITUCION = { nombre: 'sustitucion_urgente', idioma: 'es' } as const;

/**
 * Un valor listo para viajar como `{{n}}` de una plantilla.
 *
 * Meta rechaza un parámetro que lleve saltos de línea, tabuladores o más de 4
 * espacios seguidos («Param text cannot have new-line/tab characters or more
 * than 4 consecutive spaces», error 100) — y lo rechaza el ENVÍO ENTERO, no ese
 * trozo. Los valores que metemos ahí no son constantes nuestras: son el nombre
 * de la socia, el de la clase, el de la sala… texto que teclea la propietaria o
 * que entró por el importador de CSV. Basta un nombre pegado con un salto de
 * línea dentro para que a esa persona no le llegue nada, y el motivo aparezca
 * como un error genérico de «parámetro inválido».
 *
 * Colapsar los espacios en blanco a uno solo cumple las tres reglas de golpe y
 * no toca ningún valor bien formado.
 *
 * Es también la razón, vista desde el otro lado, por la que los emisores de
 * texto libre no pueden usar plantilla: un cuerpo de campaña son varias líneas,
 * y aplanarlas no sería sanear, sería romper el mensaje.
 */
function parametroPlantilla(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Envía un mensaje por plantilla HSM pre-aprobada por Meta (fuera de la ventana de 24h). */
export async function enviarWhatsAppPlantilla(
  creds: WhatsAppCredenciales,
  to: string | null | undefined,
  plantilla: { nombre: string; idioma: string },
  parametros: string[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const destino = destinoWhatsApp(to);
  if (!destino) return { ok: false, error: 'Número de destino inválido' };
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${creds.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: destino,
        type: 'template',
        template: {
          name: plantilla.nombre,
          language: { code: plantilla.idioma },
          components: [{ type: 'body', parameters: parametros.map(texto => ({ type: 'text', text: parametroPlantilla(texto) })) }],
        },
      }),
    });
    const data = (await res.json().catch(() => null)) as { messages?: { id: string }[]; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, id: data?.messages?.[0]?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Comprobación de conexión: valida credenciales consultando el número. */
export async function probarWhatsApp(creds: WhatsAppCredenciales): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${creds.phoneId}?fields=verified_name,display_phone_number`, {
      headers: { Authorization: `Bearer ${creds.token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Embedded Signup v4 — el onboarding automático que sustituye a pegar el
// token a mano. La propietaria autoriza en el popup de Meta, el navegador
// recibe un `code` de un solo uso (30s de validez) y ESTE módulo lo cambia
// por un token de sistema de larga duración, server-side, con el App Secret
// (nunca en el cliente). Ver META_SETUP.md para la configuración de la app
// de Meta que esto necesita (META_APP_ID/META_APP_SECRET/META_CONFIG_ID).
//
// Nota deliberada: nada de lo de aquí sustituye `enviarWhatsAppTexto/
// Plantilla/probarWhatsApp` de arriba — solo son un productor más del mismo
// `WhatsAppCredenciales{token, phoneId}` que ya consume el cron. Ver el
// comentario de cabecera de este archivo.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cambia el `code` de Embedded Signup por un Business Integration System
 * User token — de larga duración, sin refresh_token que gestionar (a
 * diferencia de un grant OAuth2 clásico, no caduca salvo revocación manual
 * desde Meta Business Manager).
 */
export async function intercambiarCodigoWhatsApp(
  code: string,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, error: 'Meta no está configurado en este entorno' };
  try {
    const url = new URL(`https://graph.facebook.com/${API_VERSION}/oauth/access_token`);
    url.searchParams.set('client_id', appId);
    url.searchParams.set('client_secret', appSecret);
    url.searchParams.set('code', code);
    const res = await fetchExterno(url.toString());
    const data = (await res.json().catch(() => null)) as { access_token?: string; error?: { message?: string } } | null;
    if (!res.ok || !data?.access_token) return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    return { ok: true, token: data.access_token };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Valida — contra la Graph API real, nunca confiando en lo que mandó el
 * navegador — que el token recién obtenido de verdad da acceso al
 * phone_number_id/waba_id que Embedded Signup dijo haber conectado. Si algo
 * no cuadra (token revocado, número no perteneciente a esa cuenta), no se
 * persiste ninguna conexión a medias — el llamador decide no guardar nada.
 */
export async function validarConexionEmbeddedSignup(
  token: string,
  phoneNumberId: string,
  wabaId: string,
): Promise<
  | { ok: true; displayPhoneNumber: string | null; verifiedName: string | null }
  | { ok: false; error: string }
> {
  try {
    const [resNumero, resWaba] = await Promise.all([
      fetchExterno(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}?fields=verified_name,display_phone_number`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetchExterno(`https://graph.facebook.com/${API_VERSION}/${wabaId}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (!resNumero.ok) {
      const data = (await resNumero.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${resNumero.status}` };
    }
    if (!resWaba.ok) {
      const data = (await resWaba.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${resWaba.status}` };
    }
    const numero = (await resNumero.json().catch(() => null)) as { verified_name?: string; display_phone_number?: string } | null;
    return {
      ok: true,
      displayPhoneNumber: numero?.display_phone_number ?? null,
      verifiedName: numero?.verified_name ?? null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * `POST /{WABA_ID}/subscribed_apps` — sin esto, el webhook de la app
 * (app/api/webhooks/whatsapp) nunca recibe NADA de este WABA por mucho que
 * la URL esté bien dada de alta a nivel de app: la suscripción es POR WABA,
 * no global (ver META_SETUP.md §6, flujo de Tech Provider de 5 pasos). Se
 * llama justo después de validar la conexión — un fallo aquí NO debe tumbar
 * el guardado: el número ya funciona para ENVIAR, solo se queda sin recibir
 * eventos hasta que se reintente.
 */
export async function suscribirWabaAWebhook(token: string, wabaId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetchExterno(`https://graph.facebook.com/${API_VERSION}/${wabaId}/subscribed_apps`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      return { ok: false, error: data?.error?.message ?? `WhatsApp API ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
