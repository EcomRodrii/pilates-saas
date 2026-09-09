// Cuerpos de WhatsApp para el motor de escalado de sustituciones. Texto plano y
// corto (WhatsApp no tiene límite, pero breve gana). El enlace es el mismo deep
// link de aceptación (un toque, sin login).
//
// El canal SMS se retiró con Twilio (2026-09-09): Meta no manda SMS y la
// credencial de plataforma nunca existió en producción — ver WHATSAPP_AUDIT.md §0.

const primerNombre = (n: string) => n.split(' ')[0] || n;

// Recordatorio a la candidata ya avisada por email: sube de canal a WhatsApp.
export function cuerpoNudgeCandidata(params: {
  nombre: string; claseNombre: string; cuando: string; url: string;
}): string {
  const { nombre, claseNombre, cuando, url } = params;
  return `Hola ${primerNombre(nombre)}, ¿puedes cubrir ${claseNombre} (${cuando})? Responde en un toque: ${url}`;
}

/**
 * Los mismos cuatro datos, ordenados para la plantilla `sustitucion_urgente`
 * de Meta (`PLANTILLA_SUSTITUCION`, lib/whatsapp.ts):
 *
 *   «Hola {{1}}, ¿puedes cubrir {{2}} el {{3}}? Confírmalo en un toque aquí:
 *    {{4}} Gracias por echar un cable.»
 *
 * Vive aquí, al lado del texto libre, para que las dos versiones del mismo
 * aviso compartan `primerNombre` y no se separen con el tiempo: si un día una
 * dice «Hola María» y la otra «Hola María Jiménez López», la instructora
 * recibirá una u otra según si el estudio se aprobó la plantilla, que es
 * exactamente el detalle que nadie va a recordar comprobar.
 */
export function parametrosNudgeCandidata(params: {
  nombre: string; claseNombre: string; cuando: string; url: string;
}): string[] {
  return [primerNombre(params.nombre), params.claseNombre, params.cuando, params.url];
}

export type TipoAlertaPropietaria = 'agotada' | 'sin_respuesta' | 'baja' | 'sin_sustituta';

// El cuerpo de texto de la alerta a la propietaria (`cuerpoAlertaPropietaria`)
// se borró el 2026-09-09 junto con Twilio: era el mensaje del canal WhatsApp/SMS
// de `alertarPropietaria`, y ese canal se retiró entero (ver el comentario de esa
// función en contacto.ts — no hay integración de estudio que aplique cuando el
// destinatario ES el propio estudio). La alerta sigue saliendo por email, con su
// plantilla propia en lib/sustituciones/email.ts, y por el panel.
