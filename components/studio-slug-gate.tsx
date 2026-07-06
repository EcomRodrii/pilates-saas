'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { StudioProvider } from '@/lib/studio-context';
import { resolveStudioIdBySlug } from '@/lib/supabase-data';

// Resuelve el studio_id a partir del slug de la URL (/reservar/[slug] etc.)
// y monta un StudioProvider anidado con ese id — así estas páginas públicas
// siguen usando useStudio() sin cambios, pero ancladas al negocio del slug
// en vez del que resuelva la sesión de administración (si la hubiera).
export function StudioSlugGate({ slug, children }: { slug: string; children: ReactNode }) {
  const [state, setState] = useState<{ studioId: string | null; checked: boolean }>({ studioId: null, checked: false });

  useEffect(() => {
    let cancelled = false;
    resolveStudioIdBySlug(slug).then(id => {
      if (!cancelled) setState({ studioId: id, checked: true });
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (!state.checked) return null;

  if (!state.studioId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#EEEEE8] px-4">
        <p className="text-[15px] text-[#8E8E86]">No encontramos ningún estudio en esta dirección.</p>
      </div>
    );
  }

  return <StudioProvider studioIdOverride={state.studioId}>{children}</StudioProvider>;
}
