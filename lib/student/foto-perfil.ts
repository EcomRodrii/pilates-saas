'use client';

// Subir y quitar la foto de perfil, desde la app de la alumna.
//
// ⚠️ NO usa `lib/portal-storage.ts`. Aquellas funciones suben con el cliente del
// PANEL, y esta app se autentica con `supabasePortal`, que además es SOLO un
// cliente de auth (se salta Postgrest, Realtime y Storage a propósito). Aquí se
// va por `/api/public/*` con la cabecera de sesión, que es como escribe todo lo
// demás de esta app.

import { portalAuthHeader } from '@/lib/api-client';
import { redimensionarImagen, LADO_AVATAR } from '@/lib/imagen-cliente';
import { motivoFotoInvalida } from '@/lib/foto-perfil-regla';

export type ResultadoFoto = { ok: true; url: string } | { ok: false; error: string };

/**
 * Redimensiona en el navegador y sube.
 *
 * El redimensionado va aquí y no en el servidor por lo que ya documenta
 * `imagen-cliente.ts`: así el byte gordo no llega a viajar. Y la validación se
 * hace en los DOS lados —aquí para no subir 5 MB en balde, y en el servidor
 * porque esta comprobación es saltable—, con los mismos límites, que viven en
 * un único módulo compartido.
 */
export async function subirFoto(studioId: string, file: File): Promise<ResultadoFoto> {
  const malo = motivoFotoInvalida(file.type, file.size);
  if (malo) return { ok: false, error: malo };

  try {
    // `redimensionarImagen` devuelve el original tal cual si no sabe
    // recodificarlo (un HEIC de iPhone, por ejemplo), así que se vuelve a
    // validar DESPUÉS: lo que se manda es lo que hay que comprobar.
    const img = await redimensionarImagen(file, LADO_AVATAR);
    const otroMalo = motivoFotoInvalida(img.type, img.size);
    if (otroMalo) return { ok: false, error: otroMalo };

    const form = new FormData();
    form.append('foto', img);
    const res = await fetch(`/api/public/foto-perfil?studioId=${encodeURIComponent(studioId)}`, {
      method: 'POST',
      headers: { ...(await portalAuthHeader()) },
      body: form,
    });
    const cuerpo = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !cuerpo?.url) {
      return { ok: false, error: cuerpo?.error ?? 'No hemos podido guardar la foto.' };
    }
    return { ok: true, url: cuerpo.url };
  } catch {
    return { ok: false, error: 'No hemos podido guardar la foto. Comprueba tu conexión.' };
  }
}

export async function quitarFoto(studioId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/public/foto-perfil?studioId=${encodeURIComponent(studioId)}`, {
      method: 'DELETE',
      headers: { ...(await portalAuthHeader()) },
    });
    if (res.ok) return { ok: true };
    const cuerpo = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: cuerpo?.error ?? 'No hemos podido quitar la foto.' };
  } catch {
    return { ok: false, error: 'No hemos podido quitar la foto. Comprueba tu conexión.' };
  }
}
