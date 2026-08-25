'use server';

import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import type { SesionStaff } from '@/lib/auth-server';
import { ErrorAccion } from '@/lib/actions/errores';

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
 * Server Action compatible auth. Lee la sesión desde la cookie de Supabase.
 *
 * I-4: Sprint 2 necesita funcionar desde componentes cliente, donde el runtime
 * de React NO emite la cabecera Authorization. Las cookies viajan automáticamente,
 * así que usamos eso en lugar de la cabecera.
 *
 * CSRF: protegido automáticamente porque Next.js valida el origen de los
 * form submissions desde el navegador.
 */
export async function getAuthInServerAction(): Promise<SesionStaff | null> {
  const token = await extraerTokenDeCookie();
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
