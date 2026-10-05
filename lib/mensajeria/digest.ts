// ─────────────────────────────────────────────────────────────────────────────
// Community & Messaging OS (P0) — digest de baja frecuencia de mensajes sin
// leer. Disparado por pg_cron (ver migración `pg_cron_notif_mensajes_digest`),
// cada 3 horas, query GLOBAL sin fan-out por estudio (mismo criterio que
// `notif-entregas-pendientes`/`barrerClientasInactivas`).
//
// ⚠️ Cubre solo lo que tiene un `leido_hasta` por persona en
// `conversacion_participantes`: la fila SOCIO de ALUMNA_INSTRUCTORA/
// ALUMNA_MOSTRADOR y la fila STAFF de ALUMNA_INSTRUCTORA. El lado STAFF de
// ALUMNA_MOSTRADOR y EQUIPO se resuelve DINÁMICAMENTE (sin fila propia, ver
// comentario de la migración de RLS 2/4) y no tiene progreso de lectura
// individual que digerir — límite conocido de este P0, no un descuido.
//
// Idempotencia: la comparación `leido_hasta < ultimo_mensaje_en` vive en SQL
// (función `mensajes_no_leidos_para_digest`, STABLE) para no traer filas de
// más al cliente solo para filtrarlas en JS. El dedup real (como mucho un
// digest al día por persona) lo da `dedupKey` del propio motor de
// notificaciones (`mensaje-digest:<authUserId>:<fecha>`, y `:equipo` en el de
// equipo, `digest-reglas.ts`) — un choque con la
// clave UNIQUE hace que el segundo/tercer barrido del mismo día no duplique
// nada, así que no hace falta ninguna tabla de control aparte.
// ─────────────────────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from '../db/supabase-admin.ts';
import { emitirMensajeDigestNoLeido } from '../notifications/emit.ts';
import type { Recipient } from '../notifications/types.ts';
import { equipoDelResumen } from './destinatarios.ts';
import { sufijoDedupDelResumen } from './digest-reglas.ts';

// Una fila por cuenta, estudio y LADO: la misma cuenta puede ser alumna en unos
// hilos y equipo (instructora) en otros del mismo estudio, y cada resumen lleva
// a su bandeja (la app de la alumna o la suya de instructora). Antes se agrupaba
// solo por cuenta y el motor la resolvía mirando primero en `socios`.
interface FilaDigest {
  auth_user_id: string;
  studio_id: string;
  studio_slug: string | null;
  // ⚠️ Opcionales: la función de antes de 20261005100000 no los devuelve. Si el
  // código sale antes que la migración, una fila sin `lado` se publica como
  // antes (el motor resuelve la audiencia por la cuenta) en vez de tratarse
  // como de equipo y descartarse: eso dejaba a TODAS las alumnas sin resumen.
  lado?: 'SOCIO' | 'STAFF' | null;
  socio_id?: string | null;
  conversaciones: number;
}

export async function barrerDigestMensajesNoLeidos(): Promise<{ avisos: number }> {
  const admin = getSupabaseAdmin();
  if (!admin) return { avisos: 0 };

  const { data, error } = await admin.rpc('mensajes_no_leidos_para_digest');
  if (error) {
    console.error('[mensajeria] barrerDigestMensajesNoLeidos: RPC falló:', error.message);
    return { avisos: 0 };
  }

  const filas = (data ?? []) as FilaDigest[];
  const hoy = new Date().toISOString().slice(0, 10);
  let avisos = 0;
  for (const fila of filas) {
    let destinatario: Recipient | null = null;
    if (fila.lado === 'SOCIO') {
      destinatario = { role: 'SOCIA', userId: fila.auth_user_id, socioId: fila.socio_id ?? null };
    } else if (fila.lado === 'STAFF') {
      destinatario = await equipoDelResumen(admin, fila.studio_id, fila.auth_user_id);
      if (!destinatario) continue; // ya no es del equipo de ese estudio
    }
    await emitirMensajeDigestNoLeido(admin, {
      studioId: fila.studio_id,
      authUserId: fila.auth_user_id,
      conversaciones: fila.conversaciones,
      fecha: hoy,
      slug: fila.studio_slug,
      recipients: destinatario ? [destinatario] : null,
      sufijoDedup: sufijoDedupDelResumen(fila.lado),
    });
    avisos++;
  }
  return { avisos };
}
