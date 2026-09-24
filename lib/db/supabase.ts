import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { esRetornoAuthStaff } from '@/lib/auth/rutas-retorno-auth-staff';
import { anotarEventoAuth } from '@/lib/auth/recuperacion-contrasena';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Construcción PEREZOSA a propósito: si `createClient(...)` se llamara aquí
// arriba (top-level), esbuild no puede probar que esa llamada esté libre de
// efectos y NUNCA poda el import de `@supabase/supabase-js` (postgrest-js +
// realtime-js + storage-js completos) aunque nadie alcanzable use este
// cliente — pasó con `public/widget.js` (el widget solo usa
// `lib/db/supabase-portal.ts`, nunca este). Con el top-level libre de
// llamadas, esbuild SÍ puede eliminar el import entero cuando `supabase`
// termina sin ningún uso alcanzable en ese bundle. El cliente real solo se
// construye al primer acceso de verdad (p.ej. `.auth`) — que en la práctica
// ocurre casi enseguida tras montar, en la misma carga de página.
let cliente: SupabaseClient | undefined;

function clienteStaff(): SupabaseClient {
  if (cliente) return cliente;
  // detectSessionInUrl: true por defecto en supabase-js — pero este cliente de
  // STAFF también está cargado en páginas PÚBLICAS (/reservar/[slug],
  // /portal/[slug]) porque `lib/api-client.ts` lo importa y esas páginas usan
  // `useStudio()`. Con el valor por defecto, al volver del enlace mágico de una
  // CLIENTA (que sí es legítimo en esas páginas, vía el cliente de
  // `lib/db/supabase-portal.ts`), este cliente leía el mismo fragmento de la
  // URL y creaba, sin que nadie lo pidiera, una sesión de staff válida para el
  // email de la clienta — auditoría 2026-07-30, hallazgo #9.
  //
  // La única razón real para que ESTE cliente necesite leer tokens de la URL es
  // volver de un enlace de Supabase Auth propio del staff: confirmación de alta
  // y reenvío de confirmación (`emailRedirectTo` → `/login`, ver
  // `lib/auth-context.tsx: signUp/reenviarConfirmacion`) y recuperación de
  // contraseña (`redirectTo` → `/clave-nueva`, ver `recuperarPassword`). Son las
  // DOS únicas rutas top-level a las que puede volver un enlace de staff — así
  // que activamos la detección solo ahí, no en todas partes.
  //
  // ⚠️ '/network/acceso' se añadió el 2026-08-19 (separación Software/Network).
  // Es el equivalente de '/login' para el producto Network: el ÚNICO punto de
  // retorno legítimo de un enlace de auth de Tentare Network (Google OAuth,
  // que solo puede volver a una ruta de esta lista — ver el comentario de
  // arriba). No reabre el hallazgo #9: sigue siendo una ruta de STAFF con
  // nombre explícito en la lista, no un valor por defecto ni una página
  // pública de cliente — mismo nivel de confianza que '/login'.
  //
  // La lista vive en `lib/auth/rutas-retorno-auth-staff.ts` porque el cliente
  // del portal (`lib/db/supabase-portal.ts`) la necesita al revés: en estas
  // rutas el fragmento del enlace es SOLO de este cliente.
  const pathname = typeof window !== 'undefined' ? window.location.pathname : null;
  const detectSessionInUrl = esRetornoAuthStaff(pathname);
  cliente = createClient(url, anon, { auth: { detectSessionInUrl } });
  // FE-02: `/clave-nueva` solo deja fijar la contraseña si esta carga canjeó de
  // verdad un enlace de recuperación, y la prueba es `PASSWORD_RECOVERY`, que
  // gotrue emite UNA vez y solo a quien ya esté suscrito. Se escucha aquí, en
  // cuanto el cliente existe y antes de que el canje pueda terminar, y no en la
  // pantalla: así no depende de que su efecto sea el primero en tocar
  // `supabase.auth`. Ver lib/auth/recuperacion-contrasena.ts.
  if (pathname === '/clave-nueva') cliente.auth.onAuthStateChange(anotarEventoAuth);
  return cliente;
}

export const supabase = {
  get auth() { return clienteStaff().auth; },
  get storage() { return clienteStaff().storage; },
  get realtime() { return clienteStaff().realtime; },
  get functions() { return clienteStaff().functions; },
  from(...args: Parameters<SupabaseClient['from']>) { return clienteStaff().from(...args); },
  rpc(...args: Parameters<SupabaseClient['rpc']>) { return clienteStaff().rpc(...args); },
  channel(...args: Parameters<SupabaseClient['channel']>) { return clienteStaff().channel(...args); },
  removeChannel(...args: Parameters<SupabaseClient['removeChannel']>) { return clienteStaff().removeChannel(...args); },
  removeAllChannels(...args: Parameters<SupabaseClient['removeAllChannels']>) { return clienteStaff().removeAllChannels(...args); },
  getChannels(...args: Parameters<SupabaseClient['getChannels']>) { return clienteStaff().getChannels(...args); },
} as unknown as SupabaseClient;
