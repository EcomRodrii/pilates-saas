// ¿Esta carga de la página ha canjeado un enlace de recuperación de contraseña?
// Lo pregunta `/clave-nueva`, que deja fijar una contraseña nueva sin pedir la
// actual (FE-02, auditoría 23-sep): una sesión cualquiera ya abierta no basta.
//
// La señal es el evento `PASSWORD_RECOVERY` de gotrue, que emite al canjear el
// token del fragmento de la URL y guardar esa sesión. Pero lo emite UNA sola
// vez, en un `setTimeout(…, 0)` justo después del canje, y solo a quien ya esté
// suscrito — quien se suscribe después recibe `INITIAL_SESSION` y nada más. Por
// eso no lo escucha la pantalla, que depende de cuándo monte, sino el propio
// cliente al nacer (`lib/db/supabase.ts`), y aquí queda anotado hasta que la
// pantalla lo recoja.
//
// No se usa `type=recovery` del fragmento en su lugar: con una sesión ya
// abierta, un fragmento que no canjea deja la sesión anterior tal cual, y tras
// un canje bueno gotrue borra el fragmento de la URL.
//
// Solo en memoria, a propósito: se pierde al recargar, igual que cuando lo
// guardaba el estado de la pantalla.

import type { AuthChangeEvent, Session } from '@supabase/supabase-js';

let usuarioRecuperado: string | null = null;
const oyentes = new Set<() => void>();

function anotar(usuario: string | null) {
  if (usuario === usuarioRecuperado) return;
  usuarioRecuperado = usuario;
  for (const oyente of oyentes) oyente();
}

/** Oyente de `onAuthStateChange`. Solo lo registra el cliente de staff al nacer en `/clave-nueva`. */
export function anotarEventoAuth(evento: AuthChangeEvent, sesion: Session | null): void {
  if (evento === 'PASSWORD_RECOVERY' && sesion?.user?.id) anotar(sesion.user.id);
  else if (evento === 'SIGNED_OUT') anotar(null);
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
