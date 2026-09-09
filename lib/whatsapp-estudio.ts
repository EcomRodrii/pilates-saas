// ¿Con qué credenciales de WhatsApp cuenta ESTE estudio, y qué plantillas tiene
// ya aprobadas en Meta?
//
// La regla vivía copiada en cada llamador (`config.token && config.phoneId`,
// `config.plantillaX === 'true'`), y con siete emisores compartiéndola eso es
// siete sitios donde equivocarse de nombre de clave y no enterarse: un typo en
// `plantillaHuecoAprobada` no rompe nada visible, solo hace que el estudio que
// SÍ la tiene aprobada siga mandando texto suelto que Meta no entrega fuera de
// la ventana de 24 h.
//
// PURO a propósito, sin tocar la base de datos: `lib/db/supabase-data-admin.ts`
// importa `server-only`, que revienta bajo `node --test`. El llamador trae la
// fila (con `dbGetIntegracionConfig`, o del `select` en lote del cron de
// recordatorios) y esto solo la interpreta — así la interpretación se puede
// probar sin montar medio servidor.

import type { WhatsAppCredenciales } from './whatsapp.ts';

/** La fila de `integraciones` tal cual, en lo que a esto le importa. */
export interface FilaIntegracionWhatsApp {
  activo: boolean;
  config: Record<string, string> | null | undefined;
}

export interface WhatsAppDelEstudio extends WhatsAppCredenciales {
  /** `recordatorio_clase` (UTILITY) — cron de recordatorios de clase. */
  plantillaRecordatorio: boolean;
  /** `hueco_disponible` (MARKETING) — radar de ocupación y «Rellenar hueco». */
  plantillaHueco: boolean;
  /** `sustitucion_urgente` (UTILITY) — aviso a la instructora candidata. */
  plantillaSustitucion: boolean;
}

/**
 * `null` = este estudio no puede mandar WhatsApp ahora mismo (no conectó la
 * integración, la apagó, o la fila está a medias). Nunca credenciales a medias:
 * sin las DOS claves no hay envío posible, y devolver un `phoneId` sin token
 * solo serviría para que el llamador se llevara un 401 de Meta más adelante.
 *
 * Cada interruptor de plantilla es INDEPENDIENTE: dar por aprobada una que no
 * lo está devuelve 132001 en TODOS los envíos de ese emisor, no en algunos.
 */
export function whatsappDelEstudio(fila: FilaIntegracionWhatsApp | null | undefined): WhatsAppDelEstudio | null {
  if (!fila?.activo) return null;
  const config = fila.config ?? {};
  const token = config.token;
  const phoneId = config.phoneId;
  if (!token || !phoneId) return null;
  return {
    token,
    phoneId,
    // La casilla se guarda como el STRING 'true' (viene de un checkbox del
    // formulario de Integraciones, no de un boolean de Postgres) — comparar
    // con `!!config.plantillaAprobada` daría true también para 'false'.
    plantillaRecordatorio: config.plantillaAprobada === 'true',
    plantillaHueco: config.plantillaHuecoAprobada === 'true',
    plantillaSustitucion: config.plantillaSustitucionAprobada === 'true',
  };
}
