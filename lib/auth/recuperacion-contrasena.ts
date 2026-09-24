// ¿Esta carga de la página ha canjeado un enlace de recuperación de contraseña?
// Lo pregunta `/clave-nueva`, que deja fijar una contraseña nueva sin pedir la
// actual (FE-02, auditoría 23-sep): una sesión cualquiera ya abierta no basta.
//
// Hacen falta dos cosas. El evento `PASSWORD_RECOVERY` de gotrue, que emite al
// canjear el token del fragmento de la URL y guardar esa sesión; y que ese
// token diga que la sesión nació de verificar el correo en ese mismo momento
// (`sesionRecienNacidaDelCorreo`, abajo): el evento solo no basta.
//
// Gotrue emite el evento UNA sola vez, en un `setTimeout(…, 0)` justo después
// del canje, y solo a quien ya esté suscrito — quien se suscribe después recibe
// `INITIAL_SESSION` y nada más. Por eso no lo escucha la pantalla, que depende
// de cuándo monte, sino el propio cliente al nacer (`lib/db/supabase.ts`), y
// aquí queda anotado hasta que la pantalla lo recoja.
//
// No se usa `type=recovery` del fragmento en su lugar: con una sesión ya
// abierta, un fragmento que no canjea deja la sesión anterior tal cual, y tras
// un canje bueno gotrue borra el fragmento de la URL.
//
// Solo en memoria, a propósito: se pierde al recargar, igual que cuando lo
// guardaba el estado de la pantalla.

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { payloadJwt } from './payload-jwt.ts';

let usuarioRecuperado: string | null = null;
const oyentes = new Set<() => void>();

function anotar(usuario: string | null) {
  if (usuario === usuarioRecuperado) return;
  usuarioRecuperado = usuario;
  for (const oyente of oyentes) oyente();
}

/**
 * Métodos `amr` que prueban que quien llega controla el correo.
 *
 * - `otp`: el que sella gotrue al verificar CUALQUIER enlace de email en flujo
 *   implícito, que es el del cliente del equipo — recuperación incluida. Medido
 *   en producción (24-sep): en `auth.mfa_amr_claims` solo aparecen `password`,
 *   `oauth` y `otp`; ningún `recovery`.
 * - `recovery`: el que sellaría el flujo PKCE, por si algún día se cambia.
 *
 * Contraseña, OAuth, refresco, anónima… quedan fuera a propósito: ninguno
 * demuestra haber abierto el correo.
 */
const METODOS_CORREO: ReadonlySet<string> = new Set(['otp', 'recovery']);

/**
 * Cuánto puede separarse la verificación del correo (marca del `amr`) de la
 * emisión del token (`iat`). En un enlace recién abierto son el mismo instante
 * —medido: 0 s en todas las sesiones de producción—; el margen es holgura. Las
 * dos marcas las pone el servidor, así que la hora del móvil no influye. No
 * limita la vida del token (eso lo hace su `exp`) ni la del enlace.
 */
export const MARGEN_CANJE_S = 10 * 60;

/**
 * ¿Este access token es de una sesión que acaba de nacer de verificar el correo?
 * Falla cerrado ante cualquier cosa rara: token que no es un JWT, sin `amr` o sin
 * `iat`, otro método, o una verificación antigua.
 */
export function sesionRecienNacidaDelCorreo(accessToken: unknown): boolean {
  const payload = payloadJwt(accessToken);
  if (!payload || typeof payload !== 'object') return false;
  const { amr, iat } = payload as { amr?: unknown; iat?: unknown };
  if (!Array.isArray(amr) || typeof iat !== 'number' || !Number.isFinite(iat)) return false;
  return amr.some((entrada) => {
    if (!entrada || typeof entrada !== 'object') return false;
    const { method, timestamp } = entrada as { method?: unknown; timestamp?: unknown };
    return typeof method === 'string'
      && METODOS_CORREO.has(method)
      && typeof timestamp === 'number'
      && Number.isFinite(timestamp)
      && iat - timestamp <= MARGEN_CANJE_S
      && timestamp - iat <= 60;
  });
}

/** Oyente de `onAuthStateChange`. Solo lo registra el cliente de staff al nacer en `/clave-nueva`. */
export function anotarEventoAuth(evento: AuthChangeEvent, sesion: Session | null): void {
  if (evento === 'PASSWORD_RECOVERY') {
    if (sesion?.user?.id && sesionRecienNacidaDelCorreo(sesion.access_token)) anotar(sesion.user.id);
  } else if (evento === 'SIGNED_OUT') {
    anotar(null);
  }
}

/**
 * La pantalla se queda con la anotación y aquí se olvida: vale para ESE montaje,
 * como cuando la pantalla escuchaba el evento ella misma. Si se sale de
 * `/clave-nueva` y se vuelve sin recargar, hay que pedir otro enlace.
 */
export function tomarRecuperacion(): string | null {
  const usuario = usuarioRecuperado;
  usuarioRecuperado = null; // sin avisar: quien la toma es el único que escucha
  return usuario;
}

/** Avisa cuando llega una anotación nueva (el canje terminó con la pantalla ya montada). */
export function suscribirRecuperacion(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => { oyentes.delete(oyente); };
}

/**
 * La regla de FE-02: solo se deja fijar la contraseña sin pedir la actual si la
 * sesión vigente es la MISMA que abrió el enlace. Si entretanto la sesión pasó a
 * ser de otra cuenta, o se cerró, el enlace ya no la respalda.
 */
export function puedeFijarSinContrasenaActual(
  sesion: Pick<Session, 'user'> | null,
  usuarioRecuperado: string | null,
): boolean {
  const usuario = sesion?.user?.id;
  return !!usuario && usuario === usuarioRecuperado;
}
