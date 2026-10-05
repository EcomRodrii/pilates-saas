// ─────────────────────────────────────────────────────────────────────────────
// Abrir un hilo apaga también sus avisos de la campana, HASTA donde se ha leído.
//
// Hasta ahora «leído» vivía en dos sitios que no se hablaban: la marca del hilo
// (`conversacion_participantes.leido_hasta` / `mostrador_leido_hasta`) y la fila
// del aviso en `notification`. Leías el mensaje en el hilo y la campana seguía
// diciendo «Nuevo mensaje» sin leer hasta que entrabas en Avisos a apagarlo.
//
// «Hasta dónde» lo dice quien lee: el último mensaje que su pantalla ha pintado
// (`hasta`, el id de ese mensaje). Un mensaje que llega entre que se cargó el
// hilo y el «leído» no se ha visto, así que ni la marca ni su aviso deben darlo
// por leído. Sin `hasta` (un cliente de antes de esto) se hace lo de siempre:
// todo, hasta ahora.
//
// Qué apaga, y solo de quien abre el hilo (`recipient_user_id`) en ese estudio:
//   · los `mensaje.recibido` de ESTE hilo cuyo mensaje ya se ha pintado. Sin
//     filtrar por rol: la cuenta, el estudio y el hilo ya lo acotan, y una cuenta
//     que es alumna y equipo a la vez puede tener ese aviso con cualquiera de los
//     dos roles (los anteriores al reparto por papel en el hilo);
//   · los `mensaje.digest_no_leido` de su lado emitidos antes de ahora (la alumna
//     los de SOCIA, el equipo los demás, el reparto de `lib/notifications/ambito.ts`).
//     El resumen no dice de qué hilo era, así que se apaga entero aunque quede
//     otro sin leer: la lista de Mensajes ya enseña el punto en ese otro (riesgo
//     aceptado en el diseño).
//
// Con service-role: quien llama ya ha comprobado quién es (`userId`) y en qué
// estudio está (`studioId`). Nunca se toca un aviso de otra persona.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENTOS } from '../notifications/eventos.ts';
import type { LadoLectura } from './presentacion.ts';

/**
 * Lo que manda el cliente en `hasta`:
 *  · `undefined` (no viene): cliente anterior, se marca todo hasta ahora;
 *  · `null`: no ha pintado ningún mensaje (hilo vacío), no se marca nada;
 *  · el id del último mensaje pintado.
 */
export function leerHasta(cuerpo: unknown): string | null | undefined {
  if (!cuerpo || typeof cuerpo !== 'object' || !('hasta' in cuerpo)) return undefined;
  const v = (cuerpo as { hasta: unknown }).hasta;
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : null;
}

/** El instante del mensaje `mensajeId` si es de ESTE hilo; si no, `null`. */
export async function instanteDelMensaje(
  cliente: SupabaseClient, conversacionId: string, mensajeId: string,
): Promise<string | null> {
  const { data, error } = await cliente.from('mensajes').select('creado_en')
    .eq('id', mensajeId).eq('conversacion_id', conversacionId).maybeSingle();
  if (error) throw error;
  return (data?.creado_en as string | undefined) ?? null;
}

export interface AvisosDeConversacion {
  userId: string;
  studioId: string;
  conversacionId: string;
  lado: LadoLectura;
  /**
   * Instante del último mensaje pintado (`instanteDelMensaje`): solo se apagan
   * los avisos de mensajes hasta ahí. `undefined` = cliente anterior: todos.
   */
  hasta?: string;
}

/** `null` si ha ido bien; el error de la base si no (quien llama responde 500). */
export async function marcarAvisosDeConversacionLeidos(
  admin: SupabaseClient, p: AvisosDeConversacion,
): Promise<{ message: string } | null> {
  const ahora = new Date().toISOString();
  const suyos = () => admin.from('notification').update({ read_at: ahora })
    .eq('recipient_user_id', p.userId)
    .eq('studio_id', p.studioId)
    .is('read_at', null);

  // 1. Los avisos de los mensajes de este hilo.
  if (p.hasta === undefined) {
    const { error } = await suyos()
      .eq('event_type', EVENTOS.MENSAJE_RECIBIDO).eq('data->>conversacionId', p.conversacionId);
    if (error) return error;
  } else {
    const { data: avisos, error } = await admin.from('notification').select('id, resource_id')
      .eq('recipient_user_id', p.userId)
      .eq('studio_id', p.studioId)
      .is('read_at', null)
      .eq('event_type', EVENTOS.MENSAJE_RECIBIDO)
      .eq('data->>conversacionId', p.conversacionId);
    if (error) return error;
    const mensajes = [...new Set((avisos ?? []).map(a => a.resource_id as string | null).filter((x): x is string => !!x))];
    if (mensajes.length > 0) {
      // El aviso apunta a su mensaje (`resource_id`); se compara la hora del
      // MENSAJE, no la del aviso, y en la base (mismo tipo, sin formatos).
      const { data: vistos, error: errorVistos } = await admin.from('mensajes').select('id')
        .eq('conversacion_id', p.conversacionId).in('id', mensajes).lte('creado_en', p.hasta);
      if (errorVistos) return errorVistos;
      const ids = new Set((vistos ?? []).map(m => m.id as string));
      const aApagar = (avisos ?? []).filter(a => ids.has(a.resource_id as string)).map(a => a.id as string);
      if (aApagar.length > 0) {
        const { error: errorApagar } = await suyos().in('id', aApagar);
        if (errorApagar) return errorApagar;
      }
    }
  }

  // 2. El resumen de no leídos de su lado.
  const resumen = suyos().eq('event_type', EVENTOS.MENSAJE_DIGEST_NO_LEIDO).lt('created_at', ahora);
  const { error } = await (p.lado === 'alumna' ? resumen.eq('recipient_role', 'SOCIA') : resumen.neq('recipient_role', 'SOCIA'));
  return error ?? null;
}
