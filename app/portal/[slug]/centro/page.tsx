'use client';

// «Mi centro» — la tercera pestaña de la barra de Tentada.
//
// ⚠️ RETIRADO (decisión del fundador, 2026-08-27): esta página era un
// CASCARÓN a propósito — quien la pintaba de verdad era `PortalTemaMarco`
// desde `PortalShell`, borrado en el PR 2 de "borrar temas del kit". Esta
// ruta ya redirigía siempre a Inicio desde el PR 1 (`esTemaPortal()`
// devolvía siempre `false`), así que aquí solo se evita el import roto —
// sigue sirviendo el mismo redirect de siempre, igual que `/videos` con VOD
// congelado.

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStudio } from '@/lib/studio-context';

export default function CentroPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { dataLoaded } = useStudio();

  useEffect(() => {
    if (dataLoaded) router.replace(`/portal/${slug}/home`);
  }, [dataLoaded, router, slug]);

  return null;
}
