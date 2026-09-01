'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Briefcase } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchVacantesPublicadasNetwork } from '@/lib/api-client';
import { TIPO_TRABAJO_LABEL, TARIFA_RANGO_LABEL } from '@/lib/network/catalogo';
import type { VacanteNetwork } from '@/lib/network/tipos';
import { cardCls } from '@/components/network/campo-estilos';

// Oportunidades (Fase 2, "instructora → busca oportunidades") — el
// marketplace de vacantes 'published' de cualquier estudio. Sin filtros
// avanzados en esta ronda (eso es la pieza "Búsqueda avanzada" aparte).
export default function OportunidadesNetworkPage() {
  const [vacantes, setVacantes] = useState<VacanteNetwork[] | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchVacantesPublicadasNetwork().then(v => { if (vivo) setVacantes(v); });
    return () => { vivo = false; };
  }, []);

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader title="Oportunidades" description="Vacantes publicadas por estudios que usan Tentare." />

      {!vacantes ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : vacantes.length === 0 ? (
        <EmptyState icono={Briefcase} titulo="No hay ninguna vacante publicada ahora mismo." />
      ) : (
        <div className="space-y-2.5">
          {vacantes.map(v => (
            <Link key={v.id} href={`/network/oportunidades/${v.id}`} className={`${cardCls} p-4 block hover:border-brand/40 transition-colors`}>
              <p className="text-[13.5px] font-semibold text-foreground">{v.titulo}</p>
              <p className="text-[12px] text-muted-foreground">
                {v.estudioNombre}{v.estudioCiudad ? ` · ${v.estudioCiudad}` : ''}
              </p>
              <p className="text-[12px] text-muted-foreground mt-1">
                {TIPO_TRABAJO_LABEL[v.tipoTrabajo]} · {TARIFA_RANGO_LABEL[v.tarifaRango]}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
