import { AuthClient } from '@supabase/auth-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase DEDICADO al portal de socias (magic link / OTP). Usa un
// storageKey propio para que la sesión de una socia NO pise la de un miembro
// del staff que use el panel en el mismo navegador (que usa lib/db/supabase.ts).
// detectSessionInUrl gestiona automáticamente el retorno del magic link.
//
// ⚠️ `AuthClient` de `@supabase/auth-js`, NO `createClient` de
// `@supabase/supabase-js`. El portal (y el widget embebible, que importa este
// mismo fichero) solo llaman a `.auth.*` en TODA la app — ningún `.from()`,
// `.storage`, `.realtime` ni `.functions` — pero `createClient` monta los
// CINCO clientes igual, aunque no se use ninguno salvo auth. Medido con
// esbuild: el cliente completo pesa 205 KB minificados (55 KB gzip); solo
// auth, 98 KB (23 KB gzip). La mitad, en cada carga del portal Y en
// `public/widget.js`, que se descarga en la web de cada estudio.
//
// La forma `{ auth: authClient }` (en vez de exportar el cliente suelto)
// mantiene `supabasePortal.auth.getSession()` etc. funcionando sin tocar los
// ocho ficheros que ya llaman así — es exactamente la forma que
// `createClient(...).auth` tenía antes, así que el comportamiento es idéntico.
export const supabasePortal = {
  auth: new AuthClient({
    url: `${url}/auth/v1`,
    headers: { Authorization: `Bearer ${anon}`, apikey: anon },
    storageKey: 'sb-portal-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  }),
};
