'use client';

import { useEffect, useState } from 'react';
import { portalAuthHeader } from '@/lib/api-client';
import { supabasePortal } from '@/lib/db/supabase-portal';
import { mensajeSeguro } from '@/lib/errores';
import type { RowMensajes } from '@/lib/db-types';
import type { ConversacionConResumen } from '@/lib/mensajeria/presentacion';

// Chat de la alumna con su estudio, sobre el backend YA EXISTENTE de
// `/api/public/mensajeria/*` (mismo esquema/RLS que el lado staff, ver
// lib/mensajeria/resumen.ts y lib/mensajeria/destinatarios.ts). Ese backend
// llevaba semanas sin ninguna pantalla que lo llamara — el portal viejo se
// borró (#1591/#1593) antes de que su reconstrucción llegara al chat.
//
// A propósito, más pequeño que `lib/mensajeria-portal.ts` (el adaptador del
// portal borrado, que sigue en el repo sin consumidores reales): solo cubre
// "escribir al estudio" (ALUMNA_MOSTRADOR). Elegir instructora
// (ALUMNA_INSTRUCTORA) necesita cruzar reservas+sesiones+instructoras para
// decidir con quién tiene sentido escribir — igual que hacía el portal
// viejo — y eso es una pantalla propia de selección, no una línea más aquí.
// Fuera de esta primera entrega a propósito, no un olvido.

export type ResultadoAbrir = { ok: true; id: string } | { ok: false; error: string };
export type ResultadoEnviar = { ok: true; mensaje: RowMensajes } | { ok: false; error: string };

async function leerError(res: Response, respaldo: string): Promise<string> {
  const cuerpo = await res.json().catch(() => null) as { error?: string } | null;
  return cuerpo?.error ? mensajeSeguro(cuerpo.error, respaldo) : respaldo;
}

export async function fetchConversaciones(studioId: string): Promise<ConversacionConResumen[] | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/mensajeria/conversaciones?studioId=${encodeURIComponent(studioId)}`, { headers: auth });
    if (!res.ok) return null;
    const cuerpo = await res.json() as { conversaciones?: ConversacionConResumen[] };
    return cuerpo.conversaciones ?? [];
  } catch {
    return null;
  }
}

export async function abrirConversacionConEstudio(studioId: string): Promise<ResultadoAbrir> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/mensajeria/conversaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, tipo: 'ALUMNA_MOSTRADOR' }),
    });
    if (!res.ok) return { ok: false, error: await leerError(res, 'No se ha podido abrir la conversación.') };
    const cuerpo = await res.json() as { id: string };
    return { ok: true, id: cuerpo.id };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export async function fetchMensajes(studioId: string, conversacionId: string): Promise<RowMensajes[] | null> {
  try {
    const auth = await portalAuthHeader();
    const url = `/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/mensajes?studioId=${encodeURIComponent(studioId)}&limite=100`;
    const res = await fetch(url, { headers: auth });
    if (!res.ok) return null;
    const cuerpo = await res.json() as { mensajes?: RowMensajes[] };
    return cuerpo.mensajes ?? [];
  } catch {
    return null;
  }
}

export async function enviarMensaje(studioId: string, conversacionId: string, cuerpo: string): Promise<ResultadoEnviar> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/mensajes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId, cuerpo }),
    });
    if (!res.ok) return { ok: false, error: await leerError(res, 'No se ha podido enviar el mensaje.') };
    const body = await res.json() as { mensaje: RowMensajes };
    return { ok: true, mensaje: body.mensaje };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}

export async function marcarConversacionLeida(studioId: string, conversacionId: string): Promise<void> {
  try {
    const auth = await portalAuthHeader();
    await fetch(`/api/public/mensajeria/conversaciones/${encodeURIComponent(conversacionId)}/leido`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId }),
    });
  } catch { /* best-effort: no bloquea la lectura si falla */ }
}

// ── Quién soy ────────────────────────────────────────────────────────────
//
// `tieneSinLeer`/agrupar-por-remitente necesitan saber cuál de los dos
// `auth_user_id` de un mensaje es "yo". Un `getSession()` suelto fue la causa
// del bug de Realtime que nunca conectaba en el lado STAFF (#1514) — pero
// aquella era una suscripción a un canal en tiempo real; aquí no hay ningún
// canal (esta pantalla es fetch simple, como el resto de la Student PWA:
// ni comunidad ni notificaciones usan Realtime), así que una sola llamada al
// montar, sin reintentos ni locks compartidos con nada, no reproduce ese bug.
export function useMiAuthUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    supabasePortal.auth.getSession().then(({ data }) => {
      if (vivo) setId(data.session?.user.id ?? null);
    }).catch(() => { /* sin sesión resuelta: se queda null, mismo criterio que portalAuthHeader */ });
    return () => { vivo = false; };
  }, []);
  return id;
}
