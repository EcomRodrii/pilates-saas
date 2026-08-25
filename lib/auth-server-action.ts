'use server';

import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import type { SesionStaff } from '@/lib/auth-server';

/**
 * Server Action compatible auth. Construye un NextRequest desde cookies/headers
 * para reutilizar verificarSesionStaff sin cambios.
 */
export async function getAuthInServerAction(): Promise<SesionStaff | null> {
  const cookieStore = await cookies();
  const headerStore = await headers();

  // Construir headers incluyendo el authorization si existe
  const headersList = new Headers();
  const authHeader = headerStore.get('authorization');
  if (authHeader) {
    headersList.set('authorization', authHeader);
  }

  // Construir URL dummy (no se usa, solo necesaria para NextRequest)
  const fakeUrl = new URL('http://localhost:3000/api/dummy');

  // Construir NextRequest con los headers
  const fakeReq = new NextRequest(fakeUrl, { headers: headersList });

  // Reutilizar verificarSesionStaff existente
  return await verificarSesionStaff(fakeReq);
}

/**
 * Verificar auth en Server Action. Lanza error si no autenticado.
 */
export async function requireAuthInServerAction(): Promise<SesionStaff> {
  const auth = await getAuthInServerAction();
  if (!auth) {
    throw new Error('No autorizado: sesión no encontrada');
  }
  return auth;
}
