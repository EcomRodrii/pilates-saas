'use client';

// ─────────────────────────────────────────────────────────────────────────────
// Aforo en vivo: escuchar el canal `aforo:{studioId}` y avisar de que hay que
// volver a pedir los datos.
//
// EL FALLO QUE CIERRA
// La propietaria quitaba a una alumna de una clase llena y su propio calendario
// seguía diciendo 8/8; la app de la alumna seguía diciendo «en lista de espera».
// Con F5 salía bien: la BD estaba bien desde el primer momento, lo que no
// existía era ninguna vía para que las pantallas ABIERTAS se enteraran.
//
// ⚠️ ESTO NO TRAE DATOS. El mensaje solo dice «la clase X ha cambiado». Cada
// pantalla vuelve a pedir lo suyo POR SU CAMINO DE SIEMPRE, con su propia
// autorización — el panel por `/api/calendario` (que ya recorta por rol), la
// alumna por el payload público (que ya es anónimo). Es lo que permite que el
// canal sea del estudio entero sin filtrar nada: difundir la fila de `reservas`
// metería `socio_id` en un canal que escuchan otras socias.
//
// ⚠️ Broadcast, NO `postgres_changes`. Está medido en este repo:
// `realtime.apply_rls()` decodificando WAL era el 58 % de la CPU de la base, y
// se paga aunque no haya nada que entregar — por eso 20260806150000 SACÓ una
// tabla de la publicación. `reservas` se escribe mucho más que aquella.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js';
import { useCanalEnVivo } from './canal-en-vivo';

/**
 * Quién pone la identidad. Se separa de quién abre el canal a propósito.
 *
 * En el panel las dos cosas son el mismo cliente. En el portal NO: la sesión de
 * la socia vive en `supabasePortal`, que es SOLO `.auth` —un `AuthClient` pelado
 * y no un `SupabaseClient`— porque un cliente completo instancia Postgrest,
 * Realtime y Storage en su constructor y eso metía ~110 KB de más en
 * `public/widget.js`, el bundle que un estudio incrusta en su propia web.
 *
 * Así que en el portal el canal lo abre el cliente completo (que ya está
 * cargado: `StudioProvider` envuelve toda la app, aunque quede inerte en
 * `/portal`) y el token lo pone el cliente de la socia. Cero bytes nuevos y
 * cero dependencias nuevas.
 */
type FuenteAuth = Pick<SupabaseClient['auth'], 'getSession' | 'onAuthStateChange'>;

/**
 * Lo mínimo para abrir un canal. Un `SupabaseClient` lo cumple tal cual.
 *
 * Es una forma estructural y no el cliente entero porque el bundle embebible
 * (`public/widget.js`) no puede permitirse un `SupabaseClient` —instancia
 * Postgrest y Storage que no usa— y monta un `RealtimeClient` pelado: +16 KB
 * comprimidos en vez de los ~110 KB del completo. Medido, no estimado.
 */
export interface FuenteCanales {
  realtime: { setAuth(token: string | null): void | Promise<void> };
  channel: SupabaseClient['channel'];
  removeChannel: SupabaseClient['removeChannel'];
  auth: FuenteAuth;
}

// (El agrupado de ráfagas vive ahora en `canal-en-vivo.ts`, junto al resto de
// la fontanería que comparten los dos canales.)

export interface OpcionesAforoEnVivo {
  /** `null` mientras no se sepa el estudio: no se suscribe a nada. */
  studioId: string | null | undefined;
  /**
   * Qué hacer cuando algo cambió. Se llama ya agrupado, con los ids de TODAS
   * las clases que cambiaron en la ráfaga.
   *
   * Sirve para elegir qué recargar: si la clase ya se tiene delante basta con
   * refrescar sus plazas, y solo si no suena de nada hay algo nuevo que traer.
   */
  alCambiar: (sesionIds: string[]) => void;
  /** Apagar sin desmontar (p. ej. una pantalla que no lo necesita). */
  activo?: boolean;
  /** De dónde sale la sesión. Por defecto, la del propio `cliente`. */
  auth?: FuenteAuth;
}

/**
 * ¿Está el canal escuchando de verdad?
 *
 * Se devuelve porque hay pantallas —el widget que un estudio incrusta en su
 * propia web— que además tienen un sondeo de respaldo. Ese sondeo NO debe
 * correr mientras el canal funciona (sería pagar dos veces por lo mismo), y sí
 * tiene que volver si el canal no llega a conectar: un widget servido desde la
 * web de un estudio puede toparse con un proxy que bloquee WebSockets, y sin
 * respaldo se quedaría mudo para siempre en vez de tardar un minuto.
 */
export function useAforoEnVivo(
  cliente: FuenteCanales,
  { studioId, alCambiar, activo = true, auth = cliente.auth }: OpcionesAforoEnVivo,
): { conectado: boolean } {
  return useCanalEnVivo<string>(cliente, {
    studioId, activo, auth,
    canal: 'aforo',
    evento: 'aforo',
    // El aviso solo trae el id de la clase; lo demás se pide por el camino de
    // siempre, que ya autoriza a quien pregunta.
    extraer: (p) => (typeof (p as { sesionId?: unknown })?.sesionId === 'string' ? (p as { sesionId: string }).sesionId : null),
    alCambiar,
  });
}
