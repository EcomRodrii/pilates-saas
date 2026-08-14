'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { fetchMisVacantesNetwork } from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';
import { cardCls } from '@/app/(dashboard)/configuracion/page';
import { cn } from '@/lib/utils';

const ESTADO_LABEL: Record<VacanteNetwork['estado'], string> = {
  draft: 'Borrador', published: 'Publicada', closed: 'Cerrada',
};
const ESTADO_CLS: Record<VacanteNetwork['estado'], string> = {
  draft: 'bg-muted text-muted-foreground',
  published: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground',
};

// "Mis vacantes" (Fase 2, punto 6 del brief) — el estudio publica "Buscamos
// instructora" y ve cuántas candidaturas tiene cada una. Sin matching ni
// alertas en esta ronda — solo publicar y listar.
export default function VacantesNetworkPage() {
  const [vacantes, setVacantes] = useState<VacanteNetwork[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchMisVacantesNetwork().then(v => { if (vivo) setVacantes(v); });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader
        title="Mis vacantes"
        description="Publica lo que buscas y recibe candidaturas directamente."
        actions={(
          <Link
            href="/network/vacantes/nueva"
            className="px-3.5 py-2 rounded-lg bg-brand text-brand-foreground text-[12px] font-medium flex items-center gap-1.5"
          >
            <Plus size={13} /> Nueva vacante
          </Link>
        )}
      />

      {!vacantes ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : vacantes.length === 0 ? (
        <div className={`${cardCls} p-8 text-center`}>
          <p className="text-[13px] text-muted-foreground">Todavía no has publicado ninguna vacante.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {vacantes.map(v => (
            <Link key={v.id} href={`/network/vacantes/${v.id}`} className={`${cardCls} p-4 flex items-center justify-between hover:border-brand/40 transition-colors`}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[13.5px] font-semibold text-foreground truncate">{v.titulo}</p>
                  <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-semibold', ESTADO_CLS[v.estado])}>
                    {ESTADO_LABEL[v.estado]}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground">{TIPO_TRABAJO_LABEL[v.tipoTrabajo]}</p>
              </div>
              <div className="shrink-0 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Users size={13} />
                {v.totalCandidaturas ?? 0}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
