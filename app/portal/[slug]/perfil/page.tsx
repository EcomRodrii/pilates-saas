'use client';

// Wrapper fino: usePortalAuth()/useRouter() reales. La presentación vive en
// PortalPerfilView (Fase 4 del Theme Builder), compartida con
// /portal-preview/[slug]/perfil.

import { useParams, useRouter } from 'next/navigation';
import { usePortalAuth } from '@/lib/portal-auth';
import { PortalPerfilView } from '@/components/portal/portal-perfil-view';

export default function PerfilPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { session, logout, actualizarEmail } = usePortalAuth();

  return (
    <PortalPerfilView
      session={session}
      actualizarEmail={actualizarEmail}
      navegar={(ruta) => router.push(ruta)}
      onLogout={() => { logout(); router.replace(`/portal/${slug}/login`); }}
    />
  );
}
