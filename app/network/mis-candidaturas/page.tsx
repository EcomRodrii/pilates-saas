'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ClipboardList } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchMisCandidaturasNetwork, retirarCandidaturaNetwork } from '@/lib/api-client';
import type { CandidaturaNetwork, EstadoCandidatura } from '@/lib/network/tipos';
import { cardCls } from '@/components/network/campo-estilos';
import { cn } from '@/lib/utils';

const ESTADO_LABEL: Record<EstadoCandidatura, string> = {
  recibida: 'Recibida', contactada: 'Contactada', entrevista: 'Entrevista', propuesta: 'Propuesta',
  aceptada: 'Aceptada', rechazada: 'No seleccionada', retirada: 'Retirada',
};
const ESTADO_CLS: Record<EstadoCandidatura, string> = {
  recibida: 'bg-muted text-muted-foreground',
  contactada: 'bg-amber-100 text-amber-800',
  entrevista: 'bg-amber-100 text-amber-800',
  propuesta: 'bg-amber-100 text-amber-800',
  aceptada: 'bg-success/15 text-success',
  rechazada: 'bg-muted text-muted-foreground',
  retirada: 'bg-muted text-muted-foreground',
};
const ACTIVOS: EstadoCandidatura[] = ['recibida', 'contactada', 'entrevista', 'propuesta'];

export default function MisCandidaturasNetworkPage() {
  const [candidaturas, setCandidaturas] = useState<CandidaturaNetwork[] | null>(null);
  const [retirando, setRetirando] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchMisCandidaturasNetwork().then(c => { if (vivo) setCandidaturas(c); });
    return () => { vivo = false; };
  }, []);

  async function retirar(id: string) {
    setRetirando(id);
    const res = await retirarCandidaturaNetwork(id);
    setRetirando(null);
    if (res.ok) setCandidaturas(await fetchMisCandidaturasNetwork());
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Mis candidaturas" />

      {!candidaturas ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-muted-foreground" />
        </div>
      ) : candidaturas.length === 0 ? (
        <EmptyState
          icono={ClipboardList}
          titulo="Todavía no has aplicado a ninguna vacante."
          cta={{ label: 'Ver oportunidades', href: '/network/oportunidades' }}
        />
      ) : (
        <div className="space-y-2.5">
          {candidaturas.map(c => (
            <div key={c.id} className={`${cardCls} p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-foreground truncate">{c.vacanteTitulo ?? 'Vacante eliminada'}</p>
                  <p className="text-[12px] text-muted-foreground">{c.estudioNombre}</p>
                </div>
                <span className={cn('shrink-0 px-2.5 py-1 rounded-full text-[11px] font-semibold', ESTADO_CLS[c.estado])}>
                  {ESTADO_LABEL[c.estado]}
                </span>
              </div>
              {c.estado === 'aceptada' && c.solicitudId && (
                <Link href={`/network/mis-mensajes?hilo=${c.solicitudId}`} className="text-[12px] text-brand font-medium mt-2 inline-block">
                  Abrir conversación →
                </Link>
              )}
              {ACTIVOS.includes(c.estado) && (
                <button
                  onClick={() => retirar(c.id)}
                  disabled={retirando === c.id}
                  className="text-[12px] text-muted-foreground hover:text-destructive mt-2 disabled:opacity-60"
                >
                  {retirando === c.id ? 'Retirando…' : 'Retirar candidatura'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
