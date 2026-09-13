'use client';

import { portalAuthHeader } from '@/lib/api-client';
import type { EstadoConsentimientoSalud } from '@/lib/datos-salud/consentimiento';

// La alumna consulta y retira su consentimiento de datos de salud. El servidor
// saca de qué socia se trata del token; aquí solo viaja el estudio.

export interface ConsentimientoSaludAlumna {
  estado: EstadoConsentimientoSalud;
  fecha: string | null;
  revocadoEn: string | null;
}

export async function leerConsentimientoSalud(studioId: string): Promise<ConsentimientoSaludAlumna | null> {
  try {
    const auth = await portalAuthHeader();
    if (!auth.Authorization) return null;
    const res = await fetch(`/api/public/consentimiento-salud?studioId=${encodeURIComponent(studioId)}`, { headers: auth });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as Partial<ConsentimientoSaludAlumna> | null;
    // Una respuesta sin estado reconocible no es «no consta»: no se pinta nada.
    if (!data || (data.estado !== 'VIGENTE' && data.estado !== 'REVOCADO' && data.estado !== 'NO_CONSTA')) return null;
    return { estado: data.estado, fecha: data.fecha ?? null, revocadoEn: data.revocadoEn ?? null };
  } catch {
    return null;
  }
}

/** `false` si el servidor no lo ha guardado: la pantalla no debe decir que sí. */
export async function revocarConsentimientoSalud(studioId: string): Promise<boolean> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch('/api/public/consentimiento-salud/revocar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ studioId }),
    });
    if (!res.ok) return false;
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false;
  }
}
