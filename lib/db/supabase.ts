import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

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
const RUTAS_RETORNO_AUTH_STAFF = new Set(['/login', '/clave-nueva']);
const detectSessionInUrl =
  typeof window !== 'undefined' && RUTAS_RETORNO_AUTH_STAFF.has(window.location.pathname);

export const supabase = createClient(url, anon, {
  auth: { detectSessionInUrl },
});
