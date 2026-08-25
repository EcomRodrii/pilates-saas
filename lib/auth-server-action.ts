'use server';

import { cookies, headers } from 'next/headers';
import { NextRequest } from 'next/server';
import { verificarSesionStaff } from '@/lib/auth-server';
import type { SesionStaff } from '@/lib/auth-server';
import { ErrorAccion } from '@/lib/actions/errores';

/**
 * Server Action compatible auth. Construye un NextRequest desde cookies/headers
 * para reutilizar verificarSesionStaff sin cambios.
 */
export async function getAuthInServerAction(): Promise<SesionStaff | null> {
  const _cookieStore = await cookies();
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
 * Verificar auth en Server Action. Lanza `ErrorAccion` 401 si no autenticado.
 *
 * AVISO para quien siga el Sprint 2 (ver SPRINT_2_PLAN.md): tal y como está,
 * esto SOLO autentica cuando la acción se invoca desde una ruta de API, que es
 * lo que hacen hoy los dos únicos llamantes (`app/api/theme` y
 * `app/api/layout`). `verificarSesionStaff` lee EXCLUSIVAMENTE la cabecera
 * `Authorization`, y una Server Action llamada desde un componente cliente es
 * un POST que emite el runtime de React: no lleva esa cabecera. Las cookies se
 * leen arriba y se descartan sin pasarlas al `NextRequest` sintético.
 *
 * O sea: el patrón está validado a través de la misma capa HTTP que el sprint
 * quiere eliminar. En cuanto alguien llame a una de estas acciones desde el
 * navegador obtendrá un 401 permanente. La salida correcta es resolver la
 * sesión de servidor desde la cookie —NO aflojar esta comprobación—; falla
 * cerrado a propósito.
 */
export async function requireAuthInServerAction(): Promise<SesionStaff> {
  const auth = await getAuthInServerAction();
  if (!auth) {
    throw new ErrorAccion('No autorizado', 401);
  }
  return auth;
}
