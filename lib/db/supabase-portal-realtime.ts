import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabasePortal } from './supabase-portal';

// Community & Messaging OS — cliente Realtime DEDICADO al portal de socias.
//
// `supabasePortal` (supabase-portal.ts) es a propósito solo `.auth`
// (`AuthClient` desnudo) para no arrastrar Postgrest/Realtime/Storage a
// `public/widget.js` — ver el comentario de ese fichero. Este cliente es la
// excepción deliberada: existe SOLO para las dos pantallas de mensajería del
// portal (`app/portal/[slug]/mensajes/**`), que sí necesitan Realtime, y por
// eso vive en un módulo aparte que solo esas pantallas importan — así el
// bundler no arrastra `@supabase/supabase-js` completo a `public/widget.js`,
// que nunca importa este fichero.
//
// Reutiliza la sesión YA autenticada de `supabasePortal.auth` sin duplicar
// login: el hook `accessToken` (soportado desde @supabase/supabase-js 2.x,
// ver package.json) pide el JWT vigente en cada conexión/reconexión del
// socket de Realtime, en vez de que este cliente gestione su propia sesión
// (`persistSession`/`autoRefreshToken` en `false` a propósito — la única
// fuente de verdad de la sesión de la socia sigue siendo `supabasePortal`).
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabasePortalRealtime: SupabaseClient = createClient(url, anon, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  accessToken: async () => (await supabasePortal.auth.getSession()).data.session?.access_token ?? null,
});
