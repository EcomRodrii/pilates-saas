// Widget «Formulario de contacto»: qué se acepta de una consulta que llega
// desde la web del estudio. Puro (sin Next ni Supabase): lo usan el endpoint
// (app/api/public/contacto), el formulario y los tests de `node --test`.
//
// ⚠️ Quien escribe aquí aún NO es clienta: la consulta va a
// `consultas_contacto` y nunca crea una ficha en `socios` (ocuparía plaza del
// plan y le mandaría el correo de bienvenida del portal).

import { EMAIL_VALIDO } from '../recursos/descargas.ts';
import { ETIQUETA_VALIDA } from '../widgets/config.ts';

export const LIMITES_CONSULTA = { nombre: 120, email: 200, telefono: 30, mensaje: 2000 } as const;

/**
 * Cuánto se guarda una consulta como mucho. Lo promete el formulario y lo
 * cumple el pg_cron `purgar-consultas-contacto` (180 días): si cambia uno, el
 * test obliga a cambiar el otro.
 */
export const CONSERVACION_MESES = 6;

const TELEFONO_VALIDO = /^[0-9 +().-]{6,30}$/;

export interface ConsultaValida {
  slug: string;
  nombre: string;
  email: string;
  telefono: string | null;
  mensaje: string;
  origen: string | null;
}

export type ResultadoConsulta = { ok: true; consulta: ConsultaValida } | { ok: false; error: string };

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/**
 * Valida el cuerpo tal cual llega. Los mensajes se enseñan a la visitante, así
 * que dicen qué corregir, no qué ha fallado por dentro.
 */
export function validarConsulta(body: Record<string, unknown>): ResultadoConsulta {
  const slug = texto(body.slug);
  if (!slug || slug.length > 120) return { ok: false, error: 'Estudio no válido.' };

  const nombre = texto(body.nombre).replace(/\s+/g, ' ');
  if (!nombre) return { ok: false, error: 'Escribe tu nombre.' };
  if (nombre.length > LIMITES_CONSULTA.nombre) return { ok: false, error: 'El nombre es demasiado largo.' };

  const email = texto(body.email).toLowerCase();
  if (!EMAIL_VALIDO.test(email) || email.length > LIMITES_CONSULTA.email) {
    return { ok: false, error: 'Escribe un email válido para que te puedan responder.' };
  }

  const tel = texto(body.telefono);
  if (tel && !TELEFONO_VALIDO.test(tel)) return { ok: false, error: 'El teléfono no parece válido.' };

  const mensaje = texto(body.mensaje);
  if (!mensaje) return { ok: false, error: 'Escribe tu mensaje.' };
  if (mensaje.length > LIMITES_CONSULTA.mensaje) {
    return { ok: false, error: `El mensaje puede tener como mucho ${LIMITES_CONSULTA.mensaje} caracteres.` };
  }

  // El servidor lo exige aunque el formulario ya lo pida: sin esto, una llamada
  // directa a la API guardaría datos sin haber informado a nadie.
  if (body.aceptaPrivacidad !== true) {
    return { ok: false, error: 'Tienes que leer la información sobre privacidad.' };
  }

  // La etiqueta del widget (?ref=). Si no cumple el formato, se descarta: no es
  // motivo para perder la consulta.
  const ref = texto(body.origen);
  const origen = ref && ETIQUETA_VALIDA.test(ref) ? ref : null;

  return { ok: true, consulta: { slug, nombre, email, telefono: tel || null, mensaje, origen } };
}

/** Asunto del `mailto:` con el que se responde desde el panel. */
export function asuntoRespuesta(nombreEstudio: string): string {
  return `Re: tu consulta a ${nombreEstudio || 'el estudio'}`;
}

/**
 * `mailto:` para responder. Solo el asunto va en la URL: el mensaje de la
 * visitante NO se cita (acabaría en el historial del navegador y del gestor de
 * correo con lo que haya escrito, a veces datos de salud).
 */
export function enlaceRespuesta(email: string, nombreEstudio: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent(asuntoRespuesta(nombreEstudio))}`;
}
