// Social graph "compañeras de clase" (Community & Messaging OS, última pieza
// de P2) — cliente del PORTAL de la clienta. El backend
// (`/api/public/social/companeras`, `/companeras/[id]/aceptar`,
// `/companeras/[id]/bloquear`, `/social/clase/[sesionId]`) ya está en
// producción; este módulo solo envuelve el fetch, mismo criterio que
// `lib/mensajeria-portal.ts`/`lib/comunidad-portal.ts`.

import type { RowSocioCompaneras } from './db-types.ts';
import { mensajeSeguro } from './errores.ts';

export interface CompaneraDeClase {
  socioId: string;
  nombre: string;
  nombreCompleto: boolean;
}

export interface QuienVaAEstaClase {
  companeras: CompaneraDeClase[];
  otrasSinNombre: number;
}

// El nombre de la otra parte se resuelve SIEMPRE en el servidor (la socia no
// tiene JWT `authenticated` de Postgres, `useStudio().socios` está vacío para
// ella en el portal) — nunca lo busques en el cliente contra ese array.
export type RowSocioCompanerasConNombre = RowSocioCompaneras & { otraParteNombre: string };

export interface ListaCompaneras {
  pendientesRecibidas: RowSocioCompanerasConNombre[];
  pendientesEnviadas: RowSocioCompanerasConNombre[];
  aceptadas: RowSocioCompanerasConNombre[];
  bloqueadasPorMi: RowSocioCompanerasConNombre[];
}

async function leerError(res: Response, respaldo: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error ? mensajeSeguro(body.error, respaldo) : respaldo;
}

export async function fetchQuienVaAEstaClase(
  headers: Record<string, string>, studioId: string, sesionId: string,
): Promise<QuienVaAEstaClase | { error: string }> {
  try {
    const res = await fetch(
      `/api/public/social/clase/${encodeURIComponent(sesionId)}?studioId=${encodeURIComponent(studioId)}`,
      { headers },
    );
    if (!res.ok) return { error: await leerError(res, 'No se ha podido cargar quién más va a esta clase.') };
    const data = await res.json().catch(() => null) as Partial<QuienVaAEstaClase> | null;
    // Nunca confiar ciegamente en un 200: un proxy/mock intermedio (o una
    // versión de API distinta) puede devolver un cuerpo con otro shape.
    // Sin esto, `quienVa.companeras` indefinido rompía el render con un
    // TypeError — encontrado en los e2e existentes, que no conocían esta
    // ruta nueva y caían en su mock catch-all `{}` de `e2e/portal-mock.ts`.
    if (!data || !Array.isArray(data.companeras)) return { error: 'No se ha podido cargar quién más va a esta clase.' };
    return { companeras: data.companeras, otrasSinNombre: data.otrasSinNombre ?? 0 };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function fetchListaCompaneras(
  headers: Record<string, string>, studioId: string,
): Promise<ListaCompaneras | { error: string }> {
  try {
    const res = await fetch(`/api/public/social/companeras?studioId=${encodeURIComponent(studioId)}`, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se han podido cargar tus compañeras.') };
    return await res.json() as ListaCompaneras;
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

/** `yaExistia` distingue "se ha creado" de "ya había una relación" — mismo
 *  estado (`pendiente`/`aceptada`/`bloqueada`) sin duplicar la solicitud. Un
 *  403 aquí puede significar "hay un bloqueo de por medio" — nunca se
 *  traduce a nada más específico que el mensaje genérico que ya manda el
 *  servidor (`errorPeticion` en la ruta), para no insinuar el bloqueo. */
export async function enviarSolicitudCompanera(
  headers: Record<string, string>, studioId: string, destinatariaSocioId: string,
): Promise<{ id: string; estado: string; yaExistia: boolean } | { error: string }> {
  try {
    const res = await fetch('/api/public/social/companeras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId, destinatariaSocioId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido enviar la solicitud.') };
    return await res.json() as { id: string; estado: string; yaExistia: boolean };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function aceptarSolicitudCompanera(
  headers: Record<string, string>, studioId: string, id: string,
): Promise<{ id: string; estado: string } | { error: string }> {
  try {
    const res = await fetch(`/api/public/social/companeras/${encodeURIComponent(id)}/aceptar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido aceptar la solicitud.') };
    return await res.json() as { id: string; estado: string };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function bloquearCompanera(
  headers: Record<string, string>, studioId: string, id: string,
): Promise<{ id: string; estado: string } | { error: string }> {
  try {
    const res = await fetch(`/api/public/social/companeras/${encodeURIComponent(id)}/bloquear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido bloquear.') };
    return await res.json() as { id: string; estado: string };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

// F-25: solo lo puede llamar quien bloqueó (el servidor lo comprueba a
// mano contra `bloqueada_por`) — borra la relación, no la restaura a
// 'aceptada'/'pendiente'. Ver el comentario de la ruta para el porqué.
export async function desbloquearCompanera(
  headers: Record<string, string>, studioId: string, id: string,
): Promise<{ id: string } | { error: string }> {
  try {
    const res = await fetch(`/api/public/social/companeras/${encodeURIComponent(id)}/desbloquear`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido desbloquear.') };
    return await res.json() as { id: string };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}
