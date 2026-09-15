'use client';

// Sus datos y su foto, desde la app del estudio. Adaptador delgado, como
// `datos-instructora.ts`: pide y devuelve; lo que decide vive en el servidor
// (`/api/portal/instructora/perfil/datos` y `/api/portal/instructora/foto`).

import { portalAuthHeader } from '@/lib/api-client';
import { redimensionarImagen, LADO_AVATAR } from '@/lib/imagen-cliente';
import { motivoFotoInvalida } from '@/lib/foto-perfil-regla';
import type { ResultadoFoto } from '@/lib/student/foto-perfil';

export interface FichaInstructora {
  nombre: string;
  /** El correo con el que entra. Solo se enseña: cambiarlo va en otra fase. */
  email: string | null;
  telefono: string | null;
  bio: string | null;
  fotoUrl: string | null;
}

function normalizar(d: Partial<FichaInstructora> | null): FichaInstructora {
  const texto = (v: unknown) => (typeof v === 'string' && v ? v : null);
  return {
    nombre: typeof d?.nombre === 'string' ? d.nombre : '',
    email: texto(d?.email),
    telefono: texto(d?.telefono),
    bio: texto(d?.bio),
    fotoUrl: texto(d?.fotoUrl),
  };
}

async function peticion(metodo: 'POST' | 'PATCH', cuerpo: Record<string, unknown>): Promise<Response> {
  return fetch('/api/portal/instructora/perfil/datos', {
    method: metodo,
    headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
    body: JSON.stringify(cuerpo),
  });
}

export async function getFichaInstructora(slug: string): Promise<FichaInstructora> {
  const res = await peticion('POST', { slug });
  if (!res.ok) throw new Error(`instructora/perfil/datos ${res.status}`);
  return normalizar(await res.json() as Partial<FichaInstructora>);
}

export type ResultadoGuardarFicha =
  | { ok: true; ficha: FichaInstructora }
  | { ok: false; error: string; campo?: string; sesionCaducada?: boolean };

/** Guarda lo que dice el servidor, no lo que se mandó: la ficha vuelve de él. */
export async function guardarFichaInstructora(
  slug: string, cambios: { nombre: string; bio: string; telefono: string },
): Promise<ResultadoGuardarFicha> {
  try {
    const res = await peticion('PATCH', { slug, cambios });
    const cuerpo = await res.json().catch(() => null) as (Partial<FichaInstructora> & { error?: unknown; campo?: unknown }) | null;
    if (res.status === 401) return { ok: false, error: 'Tu sesión ha caducado. Vuelve a entrar.', sesionCaducada: true };
    if (!res.ok) {
      return {
        ok: false,
        error: typeof cuerpo?.error === 'string' ? cuerpo.error : 'No hemos podido guardar tus datos.',
        campo: typeof cuerpo?.campo === 'string' ? cuerpo.campo : undefined,
      };
    }
    return { ok: true, ficha: normalizar(cuerpo) };
  } catch {
    return { ok: false, error: 'No hemos podido guardar tus datos. Comprueba tu conexión.' };
  }
}

/** Redimensiona en el navegador y sube. Mismas reglas que la foto de la alumna. */
export async function subirFotoInstructora(slug: string, file: File): Promise<ResultadoFoto> {
  const malo = motivoFotoInvalida(file.type, null);
  if (malo) return { ok: false, error: malo };
  try {
    const img = await redimensionarImagen(file, LADO_AVATAR);
    const otroMalo = motivoFotoInvalida(img.type, img.size);
    if (otroMalo) return { ok: false, error: otroMalo };
    const form = new FormData();
    form.append('foto', img);
    const res = await fetch(`/api/portal/instructora/foto?slug=${encodeURIComponent(slug)}`, {
      method: 'POST',
      headers: { ...(await portalAuthHeader()) },
      body: form,
    });
    const cuerpo = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !cuerpo?.url) return { ok: false, error: cuerpo?.error ?? 'No hemos podido guardar la foto.' };
    return { ok: true, url: cuerpo.url };
  } catch {
    return { ok: false, error: 'No hemos podido guardar la foto. Comprueba tu conexión.' };
  }
}

export async function quitarFotoInstructora(slug: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/portal/instructora/foto?slug=${encodeURIComponent(slug)}`, {
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
