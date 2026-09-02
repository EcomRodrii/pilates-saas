// ─────────────────────────────────────────────────────────────────────────────
// Envío del outreach en frío por SMTP (Spacemail). SERVER-ONLY.
//
// ⚠️ Deliberadamente SEPARADO de `lib/emails/` y de Resend, y no por gusto de
// tener dos cosas: es una decisión de reputación de dominio.
//
// Resend manda el correo TRANSACCIONAL de los estudios a sus socias — recibos,
// recordatorios, confirmaciones de reserva. Ese tráfico lo espera quien lo
// recibe, casi nunca se marca como spam, y de esa reputación depende que a una
// socia le llegue la factura. El outreach en frío es justo lo contrario:
// mensajes que nadie ha pedido, con una tasa de queja que puede ser alta por
// muy bien escritos que estén.
//
// Mezclarlos significa que unas cuantas quejas de la prospección degradan la
// entrega de los recibos de clientes que pagan. Por eso el correo comercial
// sale por el buzón de Spaceship (contacto@) y el transaccional por Resend, y
// este fichero NO importa nada de `lib/emails/`.
//
// Spacemail no tiene API: es IMAP/SMTP normal (mail.spacemail.com, 465 SSL),
// así que se habla con nodemailer y se autentica con el usuario y la
// contraseña del propio buzón.
// ─────────────────────────────────────────────────────────────────────────────
import nodemailer from 'nodemailer';

export interface ResultadoEnvio {
  ok: boolean;
  error?: string;
}

const HOST = 'mail.spacemail.com';
const PUERTO = 465;

/** Construye el transporte, o null si el buzón no está configurado.
 *
 *  Devuelve null en vez de lanzar por el mismo criterio que ya usa el resto del
 *  repo con `RESEND_API_KEY`: "sin configurar" es un estado legítimo de un
 *  entorno de desarrollo, no un error que deba tumbar la petición. Quien llama
 *  decide qué contar. */
export function transporteSpacemail() {
  const user = process.env.SPACEMAIL_USER;
  const pass = process.env.SPACEMAIL_PASSWORD;
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: HOST,
    port: PUERTO,
    secure: true, // 465 va cifrado desde el saludo, no con STARTTLS.
    auth: { user, pass },
  });
}

export function remitenteProspeccion(): string {
  // El nombre real de quien firma, no un alias de empresa: el correo dice estar
  // escrito por una persona y el remitente tiene que sostenerlo. Si `From` no
  // coincide con la firma, el primer filtro que lo mire ya no se lo cree.
  return process.env.SPACEMAIL_FROM || `Marcos · Tentare <${process.env.SPACEMAIL_USER ?? ''}>`;
}

/** El buzón al que responder y al que se escribe para darse de baja. */
function buzonRespuesta(): string {
  const m = remitenteProspeccion().match(/<([^>]+)>/);
  return m?.[1] ?? process.env.SPACEMAIL_USER ?? '';
}

/**
 * Texto de baja que se añade al final de todo correo comercial.
 *
 * LSSI art. 21: toda comunicación comercial tiene que permitir oponerse de
 * forma sencilla y gratuita. Para un envío puntual B2B de este tamaño, un
 * "responde BAJA" a un buzón que una persona lee de verdad ES esa vía sencilla
 * — no hace falta el sistema de tokens firmados que sí necesita
 * `lib/marketing/unsubscribe-token.ts`, que existe para envíos recurrentes a
 * consumidoras. Sobre-construirlo aquí no protegería a nadie más.
 */
export function pieDeBaja(): string {
  return `\n\n—\nMarcos Roca · Tentare · tentare.app\nSi prefieres que no vuelva a escribirte, responde "BAJA" a este correo y no recibirás nada más.`;
}

function aHtml(cuerpo: string): string {
  const escapado = cuerpo
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // Un correo que dice estar escrito a mano no puede llegar maquetado como una
  // newsletter: sin logos, sin botones, sin tabla de tres columnas. Texto en la
  // tipografía por defecto del cliente de correo, que es como se ve lo que
  // alguien escribe desde su propio buzón.
  return `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5">${escapado}</div>`;
}

export async function enviarProspeccion(input: {
  to: string; asunto: string; cuerpo: string;
}): Promise<ResultadoEnvio> {
  const transporte = transporteSpacemail();
  if (!transporte) {
    return { ok: false, error: 'Buzón sin configurar (faltan SPACEMAIL_USER / SPACEMAIL_PASSWORD).' };
  }
  const cuerpoCompleto = input.cuerpo.trimEnd() + pieDeBaja();
  try {
    await transporte.sendMail({
      from: remitenteProspeccion(),
      replyTo: buzonRespuesta(),
      to: input.to,
      subject: input.asunto,
      text: cuerpoCompleto,
      html: aHtml(cuerpoCompleto),
      headers: {
        // Que el cliente de correo ofrezca "darse de baja" en su propia
        // interfaz, además del texto del pie. Los filtros de spam lo valoran, y
        // cuesta una cabecera.
        'List-Unsubscribe': `<mailto:${buzonRespuesta()}?subject=BAJA>`,
      },
    });
    return { ok: true };
  } catch (e) {
    // El error SMTP crudo se guarda tal cual en `plataforma_prospeccion_email`:
    // "authentication failed" y "mailbox unavailable" se arreglan de formas muy
    // distintas, y traducirlos a "no se pudo enviar" borra justo esa diferencia.
    return { ok: false, error: e instanceof Error ? e.message : 'Error SMTP desconocido' };
  }
}
