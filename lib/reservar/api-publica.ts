import { mensajeDeFalloAlGuardar, type ResultadoEscritura } from '@/lib/errores';
import { portalAuthHeader } from '@/lib/api-client';

// Cliente mínimo para los endpoints /api/public/* desde fuera de
// StudioProvider — pensado para el bundle embebible (Modo B), que no monta
// el árbol de contexto entero (gamificación/comunidad/POS/etc. que trae
// StudioProvider) para no cargar en el sitio del estudio código que ese
// widget nunca usa.
//
// A propósito NO se extrae `postPublico`/`ctxPublico` desde
// lib/studio-context.tsx: esas dos funciones tienen ~15 llamadores dentro del
// provider, todos cerrados sobre su estado local (`cargarPublico`,
// `setCurrentStudioId`, etc.) — convertirlas en una factory reutilizable
// tocaría ese god-file entero para un beneficio que aquí no hace falta (el
// bundle solo necesita 3 endpoints: reserva, socio, evento). Mismo criterio
// de "no premature abstraction": esto es una implementación paralela y
// pequeña, no una que el provider también pase a usar.
//
// Si option.studioId se pasa también en la URL (?studioId=), permite que la
// respuesta cruzada por CORS (lib/cors-widget.ts) resuelva la lista blanca
// del estudio en el preflight, que no puede leer el body JSON.
export interface OpcionesPostPublicoWidget {
  studioId: string;
  origenCors?: 'query-studio-id' | 'query-slug';
  slug?: string;
}

// `url` debe llegar YA absoluta cuando el caller es el bundle embebible
// (`${origenTentare}/api/public/...`, ver lib/widget/usar-datos-widget.ts) —
// `window.location.origin` aquí sería el del ESTUDIO, no el de Tentare, así
// que no sirve de base por defecto. Se mantiene solo como fallback para no
// reventar si algún día se llama con una ruta relativa desde el propio origen
// de Tentare (p. ej. en tests).
function conQueryCors(url: string, opciones: OpcionesPostPublicoWidget): string {
  const u = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  if (opciones.origenCors === 'query-slug' && opciones.slug) u.searchParams.set('slug', opciones.slug);
  else u.searchParams.set('studioId', opciones.studioId);
  return u.toString();
}

export async function postPublicoWidget(
  url: string,
  body: Record<string, unknown>,
  opciones: OpcionesPostPublicoWidget,
): Promise<ResultadoEscritura & { datos?: unknown }> {
  try {
    const auth = await portalAuthHeader();
    const res = await fetch(conQueryCors(url, opciones), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const cuerpo = await res.json().catch(() => ({}));
      return { ok: false, error: mensajeDeFalloAlGuardar({ ...cuerpo, status: res.status }) };
    }
    return { ok: true, datos: await res.json().catch(() => null) };
  } catch (e) {
    return { ok: false, error: mensajeDeFalloAlGuardar(e) };
  }
}
