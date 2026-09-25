'use client';

// Las preguntas del estudio desde la app de la alumna. Delgado a propósito: pide
// y guarda; las reglas viven en `lib/preguntas-alta.ts` y las decide el servidor
// (`/api/public/preguntas-alta`).

import { portalAuthHeader } from '@/lib/api-client';
import type { PreguntaAlta, ValorRespuesta } from '@/lib/preguntas-alta';

export interface EstadoPreguntasAltaRemoto {
  activa: boolean;
  preguntas: PreguntaAlta[];
  pendientes: string[];
  respuestas: Record<string, ValorRespuesta>;
}

/** `null` = no se ha podido saber (red, servidor). Quien lo llame decide qué hacer. */
export async function getPreguntasAlta(studioId: string): Promise<EstadoPreguntasAltaRemoto | null> {
  try {
    const res = await fetch(`/api/public/preguntas-alta?studioId=${encodeURIComponent(studioId)}`, {
      headers: { ...(await portalAuthHeader()) },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as EstadoPreguntasAltaRemoto;
  } catch {
    return null;
  }
}

export type ResultadoGuardarPreguntas =
  | { ok: true; estado: EstadoPreguntasAltaRemoto }
  | { ok: false; error: string; errores?: Record<string, string>; apagada?: boolean };

export async function guardarPreguntasAlta(
  studioId: string, respuestas: Record<string, ValorRespuesta>,
): Promise<ResultadoGuardarPreguntas> {
  try {
    const res = await fetch('/api/public/preguntas-alta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await portalAuthHeader()) },
      body: JSON.stringify({ studioId, respuestas }),
    });
    const datos = (await res.json().catch(() => null)) as
      (EstadoPreguntasAltaRemoto & { error?: string; errores?: Record<string, string> }) | null;
    // ⚠️ Se mira `res.ok`: anunciar «guardado» con el servidor diciendo que no es
    // el fallo más repetido de este repo, y aquí la dejaría pasar sin contestar.
    if (!res.ok || !datos) {
      return {
        ok: false,
        error: datos?.error ?? 'No hemos podido guardar tus respuestas. Inténtalo de nuevo.',
        errores: datos?.errores,
        apagada: res.status === 409,
      };
    }
    return { ok: true, estado: datos };
  } catch {
    return { ok: false, error: 'No hemos podido guardar. Comprueba tu conexión.' };
  }
}

// ── El servidor dijo «faltan preguntas» en otra pantalla ─────────────────────
//
// Si el estudio enciende las preguntas mientras ella tiene la app abierta, la
// guarda de sesión ya había mirado y la dejó pasar. Reservar o comprar le
// devuelve entonces `faltan-preguntas`, y en vez de un error sin salida se le
// abren las preguntas ahí mismo.

const EVENTO = 'tentare:faltan-preguntas';

export function avisarFaltanPreguntas(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO));
}

export function alFaltarPreguntas(fn: () => void): () => void {
  window.addEventListener(EVENTO, fn);
  return () => window.removeEventListener(EVENTO, fn);
}
