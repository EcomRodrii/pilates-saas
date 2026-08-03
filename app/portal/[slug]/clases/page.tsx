'use client';

// CLASES — wrapper fino. La pantalla real vive en PortalClasesView
// (components/portal/portal-clases-view.tsx), desacoplada de usePortalAuth()
// para poder montarse también en /portal-preview/[slug]/clases con una sesión
// de muestra (ver ese archivo para el porqué).
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalClasesView } from '@/components/portal/portal-clases-view';

export default function ClasesPage() {
  const { session } = usePortalAuth();
  return <PortalClasesView session={session} />;
}
