// Sustitución agotada → pedir a una profesional de Tentare Network que cubra la
// clase, con UN toque por persona (decisión del fundador: Tentare PROPONE, la
// propietaria contacta; nunca a nadie de fuera automáticamente, nunca «contactar
// a todas»). Aquí vive solo lo puro: qué se le escribe y cómo se lee la
// respuesta del servidor. El envío es `contactarPerfilNetwork`
// (POST /api/network/contacto), la misma vía que la ficha del perfil.
import { TZ_ESTUDIO } from '../utils.ts';

/**
 * Mensaje prerrellenado de la solicitud. Recibe SOLO el tipo de clase y el
 * inicio a propósito: el mensaje llega a alguien de fuera del estudio, así que
 * no puede llevar nombres de alumnas ni el motivo de la baja (a veces es de
 * salud). El nombre y la ciudad del estudio ya los añade el servidor.
 */
export function mensajeCoberturaSustitucion(clase: { tipoClase: string | null; inicioISO: string | null }): string {
  const tipo = clase.tipoClase?.trim();
  const queClase = tipo ? `una clase de ${tipo}` : 'una clase';
  if (!clase.inicioISO) return `Hola, buscamos a alguien que pueda cubrir ${queClase}. ¿Te encajaría?`;

  const inicio = new Date(clase.inicioISO);
  if (Number.isNaN(inicio.getTime())) return `Hola, buscamos a alguien que pueda cubrir ${queClase}. ¿Te encajaría?`;
  const fecha = inicio.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: TZ_ESTUDIO });
  const hora = inicio.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: TZ_ESTUDIO });
  return `Hola, buscamos a alguien que pueda cubrir ${queClase} el ${fecha} a las ${hora}. ¿Te encajaría?`;
}

/** Lo que devuelve `contactarPerfilNetwork` (status 0 = no llegó al servidor). */
export type RespuestaContacto =
  | { ok: true; solicitudId: string }
  | { ok: false; error: string; status?: number };

export type EstadoContacto =
  | { tipo: 'enviada' }
  | { tipo: 'ya-pedida' }
  | { tipo: 'error'; mensaje: string };

/**
 * Traduce la respuesta a lo que ve la propietaria. Solo `ok` es «Solicitud
 * enviada»: un 409 (ya hay una solicitud pendiente con ella, índice único en
 * `red_solicitudes_contacto`) NO es un éxito de este toque y se dice tal cual.
 */
export function estadoContactoDesde(r: RespuestaContacto): EstadoContacto {
  if (r.ok) return { tipo: 'enviada' };
  if (r.status === 409) return { tipo: 'ya-pedida' };
  return { tipo: 'error', mensaje: r.error || 'No se ha podido enviar la solicitud.' };
}
