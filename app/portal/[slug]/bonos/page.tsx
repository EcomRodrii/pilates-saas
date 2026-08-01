'use client';

// BONOS — wrapper fino. La pantalla real vive en PortalBonosView
// (components/portal/portal-bonos-view.tsx), desacoplada de useRouter()/
// usePortalAuth() para poder montarse también en /portal-preview/[slug]/bonos
// con una sesión de muestra y sin navegación real (ver ese archivo).
import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalBonosView } from '@/components/portal/portal-bonos-view';

export default function BonosPage() {
  const router = useRouter();
  const { session } = usePortalAuth();
  return <PortalBonosView session={session} navegar={(ruta) => router.push(ruta)} />;
}
