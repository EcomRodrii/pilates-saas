// Widget «Formulario de contacto»: qué se acepta de una consulta que llega
// desde la web del estudio. Puro (sin Next ni Supabase): lo usan el endpoint
// (app/api/public/contacto), el formulario y los tests de `node --test`.
//
// ⚠️ Quien escribe aquí aún NO es clienta: la consulta va a
// `consultas_contacto` y nunca crea una ficha en `socios` (le mandaría el
// correo de bienvenida del portal).

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

// ── Interesadas apuntadas a mano (migr 20261001105825) ───────────────────────
//
// Alguien que llamó, escribió por Instagram o pasó por la puerta preguntando.
// Va a `consultas_contacto`, como las del formulario, con `canal` diciendo de
// dónde vino y quién la apuntó. Mismo trato: no es clienta, no cuenta para el
// plan, no recibe nada automático. Base legal: contestar a lo que preguntó
// (art. 6.1.b RGPD), nada más.

export const CANALES_CONSULTA_MANUAL = ['INSTAGRAM', 'LLAMADA', 'WHATSAPP', 'EN_PERSONA', 'RECOMENDADA', 'OTRO'] as const;
export type CanalConsultaManual = (typeof CANALES_CONSULTA_MANUAL)[number];
export type CanalConsulta = 'FORMULARIO' | CanalConsultaManual;

export const ETIQUETA_CANAL_CONSULTA: Record<CanalConsulta, string> = {
  FORMULARIO: 'Formulario de tu web',
  INSTAGRAM: 'Por Instagram',
  LLAMADA: 'Llamó por teléfono',
  WHATSAPP: 'Por WhatsApp',
  EN_PERSONA: 'Pasó por el estudio',
  RECOMENDADA: 'Se lo recomendaron',
  OTRO: 'Otra vía',
};

/** Lo que se le dice a quien la apunta (y lo que hay que contarle a ella si pregunta). */
export const BASE_LEGAL_CONSULTA_MANUAL =
  'Solo para contestarle a lo que preguntó: no recibe publicidad ni cuenta como alumna activa de tu plan.';

export interface ConsultaManualValida {
  nombre: string;
  email: string | null;
  telefono: string | null;
  canal: CanalConsultaManual;
  mensaje: string;
}

/** Una interesada apuntada desde el panel: nombre, un email o un teléfono, de dónde vino y qué preguntó. */
export function validarConsultaManual(body: Record<string, unknown>): { ok: true; consulta: ConsultaManualValida } | { ok: false; error: string } {
  const nombre = texto(body.nombre).replace(/\s+/g, ' ');
  if (!nombre) return { ok: false, error: 'Escribe su nombre.' };
  if (nombre.length > LIMITES_CONSULTA.nombre) return { ok: false, error: 'El nombre es demasiado largo.' };

  const emailBruto = texto(body.email).toLowerCase();
  if (emailBruto && (!EMAIL_VALIDO.test(emailBruto) || emailBruto.length > LIMITES_CONSULTA.email)) {
    return { ok: false, error: 'Ese email no parece válido.' };
  }
  const tel = texto(body.telefono);
  if (tel && !TELEFONO_VALIDO.test(tel)) return { ok: false, error: 'Ese teléfono no parece válido.' };
  if (!emailBruto && !tel) return { ok: false, error: 'Hace falta un teléfono o un email para poder contestarle.' };

  const canal = CANALES_CONSULTA_MANUAL.find(c => c === body.canal);
  if (!canal) return { ok: false, error: 'Elige por dónde llegó.' };

  const mensaje = texto(body.mensaje);
  if (!mensaje) return { ok: false, error: 'Apunta qué preguntó.' };
  if (mensaje.length > LIMITES_CONSULTA.mensaje) return { ok: false, error: `Como mucho ${LIMITES_CONSULTA.mensaje} caracteres.` };

  return { ok: true, consulta: { nombre, email: emailBruto || null, telefono: tel || null, canal, mensaje } };
}
