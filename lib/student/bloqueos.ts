'use client';

import { portalAuthHeader } from '@/lib/student/api-publica';

// «Personas bloqueadas» (Perfil › Privacidad y datos). Leer y desbloquear van al
// servidor; aquí solo se traduce. Desbloquear reutiliza las rutas de siempre:
// la del tablón (compañeras) y la del chat con su instructora.

export interface PersonaBloqueada {
  tipo: 'TABLON' | 'MENSAJES';
  /** La relación del tablón o la conversación. */
  id: string;
  nombre: string;
  desde: string | null;
}

/** `null` = no se han podido leer (la pantalla no inventa un «no has bloqueado a nadie»). */
export async function fetchPersonasBloqueadas(studioId: string): Promise<PersonaBloqueada[] | null> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(`/api/public/bloqueos?studioId=${encodeURIComponent(studioId)}`, { headers: auth });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => null)) as { personas?: PersonaBloqueada[] } | null;
    return Array.isArray(d?.personas) ? d.personas : null;
  } catch {
    return null;
  }
}

export async function desbloquearPersona(studioId: string, p: PersonaBloqueada): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const auth = await portalAuthHeader();
    const id = encodeURIComponent(p.id);
    const res = p.tipo === 'TABLON'
      ? await fetch(`/api/public/social/companeras/${id}/desbloquear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ studioId }),
      })
      : await fetch(`/api/public/mensajeria/conversaciones/${id}/bloquear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ studioId, bloquear: false }),
      });
    if (!res.ok) {
      const d = (await res.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: d?.error ?? 'No se ha podido desbloquear.' };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: 'Sin conexión. Inténtalo de nuevo.' };
  }
}
