'use server';

import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import type { SesionStaff } from '@/lib/auth-server';
import { ErrorAccion } from '@/lib/actions/errores';

/**
 * Extraer el JWT de la cabecera Authorization, si la petición la trae.
 *
 * Es el camino que usan HOY los dos únicos llamantes reales (`app/api/theme`
 * y `app/api/layout`, vía `lib/api-client.ts: authHeader()`) y el único que
 * funciona en este repo: el cliente de Supabase del panel
 * (`lib/db/supabase.ts`) es un `createClient()` a secas, con persistencia
 * SOLO en `localStorage` — nunca escribe la cookie `sb-{projectId}-auth-token`
 * que `extraerTokenDeCookie()` de abajo asume. I-4 cambió esta función para
 * leer ÚNICAMENTE esa cookie inexistente y dejó sin cabecera: 401 permanente
 * en producción para /api/theme y /api/layout con un JWT válido (verificado
 * en vivo 2026-08-25 — `document.cookie` no tiene ningún `sb-*`, la sesión
 * vive solo en `localStorage`). Se prueba la cabecera primero por ser la vía
 * real y probada; la cookie queda como fallback para si este repo adopta
 * alguna vez sesión por cookie (p. ej. `@supabase/ssr`).
 */
async function extraerTokenDeHeader(): Promise<string | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  return authHeader?.replace(/^Bearer /, '') || null;
}

/**
 * Extraer el JWT de la cookie de Supabase que envía el navegador.
 *
 * Supabase almacena la sesión en una cookie `sb-{projectId}-auth-token` como
 * JSON codificado. Las Server Actions llamadas desde componentes cliente
 * reciben esta cookie automáticamente (no necesitan ningún header especial).
 */
async function extraerTokenDeCookie(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    // El projectId está en NEXT_PUBLIC_SUPABASE_URL (ej. https://abc123.supabase.co)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) return null;

    const urlObj = new URL(supabaseUrl);
    const projectId = urlObj.hostname.split('.')[0]; // "abc123" de "abc123.supabase.co"

    const cookieName = `sb-${projectId}-auth-token`;
    const cookieValue = cookieStore.get(cookieName)?.value;
    if (!cookieValue) return null;

    // La cookie es JSON: {"access_token":"...", "refresh_token":"...", ...}
    const parsed = JSON.parse(cookieValue);
    return parsed.access_token || null;
  } catch {
    // Cookie malformada o no existe
    return null;
  }
}

/**
 * Server Action compatible auth. Cabecera Authorization primero, cookie de
 * Supabase como fallback.
 *
 * I-4: Sprint 2 necesita funcionar desde componentes cliente, donde el runtime
 * de React NO emite la cabecera Authorization — de ahí el fallback a cookie.
 * Pero en ESTE repo la cookie nunca llega (ver `extraerTokenDeHeader()` de
 * arriba): mientras no exista un caller real invocando la Server Action
 * directamente desde un componente cliente, la cabecera sigue siendo la
 * única vía que funciona de verdad.
 *
 * CSRF: protegido automáticamente porque Next.js valida el origen de los
 * form submissions desde el navegador.
 */
export async function getAuthInServerAction(): Promise<SesionStaff | null> {
  const token = (await extraerTokenDeHeader()) ?? (await extraerTokenDeCookie());
  if (!token) return null;

  // Reutilizar verificarSesionStaff pero construir un NextRequest con el token
  // en la cabecera Authorization, como si viniera de una ruta de API.
  const headersList = new Headers();
  headersList.set('authorization', `Bearer ${token}`);

  const fakeUrl = new URL('http://localhost:3000/api/dummy');
  const fakeReq = new NextRequest(fakeUrl, { headers: headersList });

  return await verificarSesionStaff(fakeReq);
}

/**
 * Verificar auth en Server Action. Lanza `ErrorAccion` 401 si no autenticado.
 *
 * I-4 (RESUELTO): ahora funciona tanto desde rutas de API (cabecera Authorization)
 * como desde componentes cliente (cookie de Supabase). La sesión se lee de la
 * cookie que el navegador envía automáticamente.
 *
 * CSRF: protegido automáticamente por Next.js (valida origen de form submissions).
 */
export async function requireAuthInServerAction(): Promise<SesionStaff> {
  const auth = await getAuthInServerAction();
  if (!auth) {
    throw new ErrorAccion('No autorizado', 401);
  }
  return auth;
}
