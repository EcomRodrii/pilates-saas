import { AuthClient } from '@supabase/auth-js';

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
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }),
};
