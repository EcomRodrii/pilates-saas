'use client';

// COMUNIDAD — el feed del estudio, lado STAFF.
//
// Esta página solo pone la cabecera; el feed en sí (datos + pintura) vive en
// components/comunidad/comunidad-feed.tsx, compartido con la pestaña
// "Comunidad" de /mensajeria — mismo patrón que ConversacionesTab.

import { useStudio } from '@/lib/studio-context';
import { PageHeader } from '@/components/ui/page-header';
import { ComunidadFeed } from '@/components/comunidad/comunidad-feed';

export default function ComunidadPage() {
  const { socios } = useStudio();
  const memberCount = socios.filter(s => s.activo).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidad"
        description="Lo que publiques aquí lo verán tus clientas en su portal."
        badge={
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] text-muted-foreground">
            {memberCount} clientas activas
          </span>
        }
      />
      <ComunidadFeed />
    </div>
  );
}
