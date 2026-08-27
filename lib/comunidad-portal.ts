// Community & Messaging OS (P1) — cliente del PORTAL de la clienta para el
// Feed de Comunidad. Mismo criterio que `mensajeria-portal.ts`: el backend
// (esquema/RLS/RPC/`/api/public/comunidad/posts`) ya está en producción, este
// módulo solo envuelve el fetch con `mensajeSeguro`.

import { mensajeSeguro } from './errores.ts';

// Shape EXACTO de lo que devuelve `GET /api/public/comunidad/posts` — no es
// `PostComunidad` completo (ese tipo lleva `audiencia`/`fijado`/`autorId`,
// campos internos que este endpoint no expone a la socia a propósito).
export interface PostFeedPortal {
  id: string;
  texto: string;
  imagenUrl: string | null;
  autorNombre: string;
  autorInicial: string;
  creadoEn: string;
  likes: number;
  comentariosCount: number;
  // Eventos como entidad propia dentro del Feed (P2 Community & Messaging
  // OS). `tipo` siempre viene informado por el endpoint ('TEXTO' o
  // 'EVENTO'); los campos evento* y `totalAsistentes` solo tienen valor real
  // cuando tipo === 'EVENTO' (para un post de texto, `totalAsistentes` viene
  // OMITIDO en el JSON, no en 0 — distingue "no es evento" de "cero
  // asistentes").
  tipo: 'TEXTO' | 'EVENTO';
  eventoFecha?: string | null;
  eventoAforo?: number | null;
  eventoLugar?: string | null;
  totalAsistentes?: number;
}

async function leerError(res: Response, respaldo: string): Promise<string> {
  const body = await res.json().catch(() => null) as { error?: string } | null;
  return body?.error ? mensajeSeguro(body.error, respaldo) : respaldo;
}

export async function fetchFeedComunidad(
  headers: Record<string, string>, studioId: string, antes?: string,
): Promise<{ posts: PostFeedPortal[] } | { error: string }> {
  try {
    const params = new URLSearchParams({ studioId });
    if (antes) params.set('antes', antes);
    const res = await fetch(`/api/public/comunidad/posts?${params.toString()}`, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido cargar el tablón.') };
    return await res.json() as { posts: PostFeedPortal[] };
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

// ── Eventos como entidad propia dentro del Feed (P2) — apuntarse/desapuntarse
// y saber el estado propio. Mismo criterio de errores que el resto de este
// módulo; el 409 (aforo lleno) se distingue del resto para que la pantalla
// pinte un mensaje concreto en vez del genérico.

export interface EstadoAsistenciaEvento {
  apuntada: boolean;
  totalAsistentes: number;
}

export async function fetchEstadoAsistenciaEvento(
  headers: Record<string, string>, studioId: string, postId: string,
): Promise<EstadoAsistenciaEvento | { error: string }> {
  try {
    const res = await fetch(`/api/public/comunidad/posts/${encodeURIComponent(postId)}/asistentes?studioId=${encodeURIComponent(studioId)}`, { headers });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido comprobar tu inscripción.') };
    return await res.json() as EstadoAsistenciaEvento;
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function apuntarseEvento(
  headers: Record<string, string>, studioId: string, postId: string,
): Promise<EstadoAsistenciaEvento | { error: string; completo?: boolean }> {
  try {
    const res = await fetch(`/api/public/comunidad/posts/${encodeURIComponent(postId)}/asistentes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) {
      return { error: await leerError(res, 'No se ha podido apuntar al evento.'), completo: res.status === 409 };
    }
    return await res.json() as EstadoAsistenciaEvento;
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}

export async function desapuntarseEvento(
  headers: Record<string, string>, studioId: string, postId: string,
): Promise<EstadoAsistenciaEvento | { error: string }> {
  try {
    const res = await fetch(`/api/public/comunidad/posts/${encodeURIComponent(postId)}/asistentes`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) return { error: await leerError(res, 'No se ha podido desapuntar del evento.') };
    return await res.json() as EstadoAsistenciaEvento;
  } catch {
    return { error: 'No hay conexión con el servidor. Comprueba tu conexión e inténtalo de nuevo.' };
  }
}
