'use client';

// Wrapper fino: la presentación real vive en components/portal/portal-home-view.tsx
// (extraída en la Fase 4 del editor de temas para poder montarse también desde
// /portal-preview/[slug], sin sesión de socia real). Este archivo solo aporta
// la sesión de verdad de usePortalAuth().

import { usePortalAuth } from '@/lib/portal-auth';
import { PortalHomeView } from '@/components/portal/portal-home-view';

export default function PortalHome() {
  const { session } = usePortalAuth();
  return <PortalHomeView session={session} />;
}
