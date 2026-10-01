'use client';

// COMUNIDAD — el feed del estudio, lado STAFF.
//
// Esta página solo pone la cabecera; el feed en sí (datos + pintura) vive en
// components/comunidad/comunidad-feed.tsx, compartido con la pestaña
// "Comunidad" de /mensajeria — mismo patrón que ConversacionesTab.

import { PageHeader } from '@/components/ui/page-header';
import { useEstadosClientas } from '@/lib/clientas/use-estados-clientas';
import { ComunidadFeed } from '@/components/comunidad/comunidad-feed';

export default function ComunidadPage() {
  // «Activas» = el chip «Activa» de Clientas, no «las que no están de baja».
  const { conteos } = useEstadosClientas();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comunidad"
        description="Lo que publiques aquí lo verán tus clientas en su portal."
        badge={conteos ? (
          <span className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[12px] text-muted-foreground">
            {conteos.ACTIVA} {conteos.ACTIVA === 1 ? 'clienta activa' : 'clientas activas'}
          </span>
        ) : undefined}
      />
      <ComunidadFeed />
    </div>
  );
}
