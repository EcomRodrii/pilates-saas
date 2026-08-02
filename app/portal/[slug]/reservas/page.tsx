'use client';

// Wrapper fino: usePortalAuth()/useRouter() reales. La presentación vive en
// PortalReservasView (Fase 4 del Theme Builder), compartida con
// /portal-preview/[slug]/reservas.

import { useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalReservasView } from '@/components/portal/portal-reservas-view';

export default function MisReservasPage() {
  const router = useRouter();
  const { session } = usePortalAuth();

  return <PortalReservasView session={session} navegar={(ruta) => router.push(ruta)} />;
}
