'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { StudioProvider } from '@/lib/studio-context';
import { resolveStudioIdBySlug } from '@/lib/supabase-data';

// Resuelve el studio_id a partir del slug de la URL (/reservar/[slug] etc.)
// y monta un StudioProvider anidado con ese id — así estas páginas públicas
// siguen usando useStudio() sin cambios, pero ancladas al negocio del slug
// en vez del que resuelva la sesión de administración (si la hubiera).
//
// I-9: cuando el layout (Server Component) ya resolvió el estudio, lo pasa por
// `initialStudioId` + `initialResuelto` y el gate monta el provider al instante
// —sin round-trip de cliente ni flash en blanco—. Sin esos props (otras páginas)
// cae al modo antiguo: resuelve en cliente.
export function StudioSlugGate({
  slug,
  children,
  initialStudioId,
  initialResuelto = false,
}: {
  slug: string;
  children: ReactNode;
  initialStudioId?: string | null;
  initialResuelto?: boolean;
}) {
  // Cuando el servidor ya resolvió el estudio (initialResuelto), no hace
  // falta estado en absoluto: se deriva directo de los props en cada render.
  // Antes vivía en un useState inicializado UNA vez — al navegar de cliente
  // entre dos slugs distintos sin recarga completa, ese estado se quedaba
  // pegado al primer estudio visitado aunque el servidor ya hubiera resuelto
  // el nuevo. Derivarlo en cada render lo hace imposible por construcción.
  const [clienteState, setClienteState] = useState<{ slug: string; studioId: string | null; checked: boolean }>(
    { slug, studioId: null, checked: false },
  );

  useEffect(() => {
    if (initialResuelto) return; // ya resuelto en el servidor, ver derivación abajo
    let cancelled = false;
    resolveStudioIdBySlug(slug).then(id => {
      if (!cancelled) setClienteState({ slug, studioId: id, checked: true });
    });
    return () => { cancelled = true; };
  }, [slug, initialResuelto]);

  const state = initialResuelto
    ? { slug, studioId: initialStudioId ?? null, checked: true }
    : (clienteState.slug === slug ? clienteState : { slug, studioId: null, checked: false });

  if (!state.checked) return null;

  if (!state.studioId) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#EEEEE8] px-4">
        <p className="text-[15px] text-muted-foreground">No encontramos ningún estudio en esta dirección.</p>
      </div>
    );
  }

  return <StudioProvider studioIdOverride={state.studioId} publicSlug={slug}>{children}</StudioProvider>;
}
