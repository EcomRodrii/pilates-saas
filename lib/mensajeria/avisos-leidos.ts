// ─────────────────────────────────────────────────────────────────────────────
// Abrir un hilo apaga también sus avisos de la campana.
//
// Hasta ahora «leído» vivía en dos sitios que no se hablaban: la marca del hilo
// (`conversacion_participantes.leido_hasta` / `mostrador_leido_hasta`) y la fila
// del aviso en `notification`. Leías el mensaje en el hilo y la campana seguía
// diciendo «Nuevo mensaje» sin leer hasta que entrabas en Avisos a apagarlo.
//
// Qué apaga, y solo de quien abre el hilo (`recipient_user_id`), en ese estudio
// y en su lado (la alumna, sus avisos de SOCIA; el panel, los demás — el mismo
// reparto que `lib/notifications/ambito.ts`):
//   · los `mensaje.recibido` de ESTE hilo (`data.conversacionId`);
//   · los `mensaje.digest_no_leido` emitidos antes de ahora. El resumen no dice
//     de qué hilo era, así que se apaga entero aunque quede otro sin leer: la
//     lista de Mensajes ya enseña el punto en ese otro (riesgo aceptado en el
//     diseño).
//
// Con service-role: quien llama ya ha comprobado quién es (`userId`) y en qué
// estudio está (`studioId`). Nunca se toca un aviso de otra persona.
// ─────────────────────────────────────────────────────────────────────────────
import type { SupabaseClient } from '@supabase/supabase-js';
import { EVENTOS } from '../notifications/eventos.ts';
import type { LadoLectura } from './presentacion.ts';

export interface AvisosDeConversacion {
  userId: string;
  studioId: string;
  conversacionId: string;
  lado: LadoLectura;
}

/** `null` si ha ido bien; el error de la base si no (quien llama responde 500). */
export async function marcarAvisosDeConversacionLeidos(
  admin: SupabaseClient, p: AvisosDeConversacion,
): Promise<{ message: string } | null> {
  const ahora = new Date().toISOString();
  const suyos = () => {
    const q = admin.from('notification').update({ read_at: ahora })
      .eq('recipient_user_id', p.userId)
      .eq('studio_id', p.studioId)
      .is('read_at', null);
    return p.lado === 'alumna' ? q.eq('recipient_role', 'SOCIA') : q.neq('recipient_role', 'SOCIA');
  };

  const [delHilo, resumen] = await Promise.all([
    suyos().eq('event_type', EVENTOS.MENSAJE_RECIBIDO).eq('data->>conversacionId', p.conversacionId),
    suyos().eq('event_type', EVENTOS.MENSAJE_DIGEST_NO_LEIDO).lt('created_at', ahora),
  ]);
  return delHilo.error ?? resumen.error ?? null;
}
