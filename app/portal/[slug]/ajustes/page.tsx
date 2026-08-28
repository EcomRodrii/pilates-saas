'use client';

// Wrapper fino: usePortalAuth()/useRouter() reales. La presentación vive en
// PortalAjustesView, que unifica Perfil/Preferencias/Compras (mismo patrón
// que /perfil).

import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalAjustesView } from '@/components/portal/portal-ajustes-view';

export default function AjustesPage() {
  const router = useRouter();
  const { session } = usePortalAuth();

  return (
    <PortalAjustesView
      session={session}
      navegar={(ruta) => router.push(ruta)}
    />
  );
}
