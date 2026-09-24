import { AuthClient } from '@supabase/auth-js';
import { almacenSesionPortal } from '@/lib/db/portal-almacen-sesion';
import { esRetornoAuthStaff } from '@/lib/auth/rutas-retorno-auth-staff';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase DEDICADO al portal de socias (magic link / OTP). Usa un
// storageKey propio para que la sesión de una socia NO pise la de un miembro
// del staff que use el panel en el mismo navegador (que usa lib/db/supabase.ts).
// detectSessionInUrl gestiona automáticamente el retorno del magic link.
//
// Solo `.auth` (nunca `.from`/`.rpc`/`.storage`/`.channel`) en TODO el repo —
// verificado con grep exhaustivo. `createClient()` de @supabase/supabase-js
// instancia SIEMPRE Postgrest/Realtime/Storage en su constructor aunque no se
// usen (ver SupabaseClient.ts), así que ese cliente completo pesaba ~110KB
// minificados de más en public/widget.js (el bundle embebible que un estudio
// incrusta en su propia web) sin que nada de eso se llegara a usar.
// `AuthClient` es la MISMA clase que `SupabaseClient.auth` envuelve por
// dentro (`SupabaseAuthClient extends AuthClient`, sin lógica añadida) — cero
// diferencia de comportamiento, solo se salta Postgrest/Realtime/Storage.
//
// ⚠️ `@supabase/auth-js` es dependencia transitiva de `@supabase/supabase-js`
// (mismo número de versión siempre). Al subir `@supabase/supabase-js`, sube
// también esta.
export const supabasePortal = {
  auth: new AuthClient({
    url: new URL('auth/v1', url).href,
    headers: {
      Authorization: `Bearer ${anon}`,
      apikey: anon,
    },
    storageKey: 'sb-portal-auth',
    // ⚠️ `storage` explícito. Sin él, auth-js usa `globalThis.localStorage`
    // SIEMPRE (su GoTrueClient lo elige cuando `persistSession` es true y no se
    // pasa nada), y la sesión sobrevivía al cierre del navegador sin que la
    // alumna pudiera decidirlo. Este adaptador enruta a localStorage o a
    // sessionStorage según «Recordar inicio de sesión», y por defecto recuerda
    // — así nada cambia para `/reservar`, el widget ni la mensajería, que
    // comparten este mismo cliente.
    storage: almacenSesionPortal,
    persistSession: true,
    autoRefreshToken: true,
    // Recoge el enlace mágico de la socia… pero NO el de un miembro del equipo.
    // Este cliente nace al cargar el módulo, mucho antes que el de staff, y con
    // `true` a secas canjeaba también el `#access_token` de un enlace de staff
    // (recuperación de contraseña, confirmación de alta, Google): guardaba esa
    // sesión en SU almacenamiento y borraba el fragmento de la URL. Si lo
    // borraba antes de que naciera el cliente de staff, a este ya no le llegaba
    // nada y `/clave-nueva` decía «Este enlace ya no vale» con un enlace bueno —
    // a ratos, según quién terminara antes. Es el hallazgo #9 de la auditoría
    // del 30-jul (ver `lib/db/supabase.ts`), en la otra dirección. Los enlaces
    // de la socia nunca vuelven a esas rutas (`/portal/…/acceso/verificar`,
    // `/reservar/…`, `/widget-auth-retorno`).
    detectSessionInUrl: !esRetornoAuthStaff(typeof window !== 'undefined' ? window.location.pathname : null),
  }),
};
