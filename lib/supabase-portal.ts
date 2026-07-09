import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Cliente Supabase DEDICADO al portal de socias (magic link / OTP). Usa un
// storageKey propio para que la sesión de una socia NO pise la de un miembro
// del staff que use el panel en el mismo navegador (que usa lib/supabase.ts).
// detectSessionInUrl gestiona automáticamente el retorno del magic link.
export const supabasePortal = createClient(url, anon, {
  auth: {
    storageKey: 'sb-portal-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
