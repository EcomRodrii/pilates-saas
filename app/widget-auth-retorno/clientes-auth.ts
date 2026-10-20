'use client';

import { AuthClient } from '@supabase/auth-js';
import { CLAVE_SESION_PUENTE, olvidarSesionDelPuente } from '@/lib/widget/puente-sesion';

// Los dos clientes de auth de la ventana del puente. NINGUNO es el del portal
// (`supabasePortal`, clave `sb-portal-auth`): esta página no lo carga (no lo
// importa y la raíz no le monta los providers que lo traen,
// `sinProveedoresDeSesion`), para que el acceso del widget no lea, refresque ni
// pise la sesión que la alumna tenga abierta en tentare.app. Y si algo volviera
// a traerlo, ese cliente no lee la URL en esta ruta (lib/db/supabase-portal.ts).
// Lo vigilan `lib/widget/puente-sesion.test.ts` y el e2e de la sesión intacta.
//
//  · `clienteEfimero`: el de la CONTRASEÑA. En memoria y nada más: ni guarda,
//    ni refresca, ni lee la URL.
//  · `clientePuente`: el del CORREO. Guarda con su propia clave
//    (`CLAVE_SESION_PUENTE`) porque el enlace se abre en OTRA pestaña, y la
//    sesión tiene que llegar de allí a esta ventana (almacenamiento común y
//    BroadcastChannel de auth-js, los dos por clave). No refresca nunca: el
//    token es del widget en cuanto sale, y quien lo entrega borra la clave a
//    mano (`olvidarSesionDelPuente`), sin llamar a gotrue.
//
// Nacen con la primera llamada: en el servidor no hay nada que crear.

function opcionesBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return { url: new URL('auth/v1', url).href, headers: { Authorization: `Bearer ${anon}`, apikey: anon } };
}

function almacenLocal(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

let efimero: InstanceType<typeof AuthClient> | null = null;
export function clienteEfimero(): InstanceType<typeof AuthClient> {
  if (efimero) return efimero;
  efimero = new AuthClient({
    ...opcionesBase(),
    storageKey: 'sb-puente-widget-efimero',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  });
  return efimero;
}

let puente: InstanceType<typeof AuthClient> | null = null;
export function clientePuente(): InstanceType<typeof AuthClient> {
  if (puente) return puente;
  // La ventana que abre el widget empieza limpia: lo que quedara de un intento
  // anterior (un enlace abierto con la ventana ya cerrada) no es de nadie. La
  // pestaña del ENLACE (sin `opener`) no borra: es la que va a escribir.
  if (window.opener) olvidarSesionDelPuente(almacenLocal());
  puente = new AuthClient({
    ...opcionesBase(),
    storageKey: CLAVE_SESION_PUENTE,
    persistSession: true,
    autoRefreshToken: false,
    // Solo aquí: la vuelta del enlace del correo es esta página.
    detectSessionInUrl: true,
  });
  return puente;
}

/** Olvida la sesión del correo en tentare.app (sin red: el token ya es del widget). */
export function olvidarSesionDelCorreo(): void {
  olvidarSesionDelPuente(almacenLocal());
}
