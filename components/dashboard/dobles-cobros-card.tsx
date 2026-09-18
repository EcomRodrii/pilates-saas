'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSessionEstudio } from '@/lib/id-estudio.ts';

interface DobleCobroAlert {
  id: string;
  recibo_id: string;
  importe_centimos: number;
  intentos_exitosos_count: number;
  primera_fecha: string;
  estado: string;
}

/**
 * Tarjeta para el dashboard mostrando dobles cobros pendientes de revisión.
 * Similar al ActionCenter pero específico para cobros duplicados.
 * Se oculta si no hay dobles cobros.
 */
export function DoblesCobrosCard() {
  const { studioId } = useSessionEstudio();
  const [dobles, setDobles] = useState<DobleCobroAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studioId) return;

    const fetchDobles = async () => {
      try {
        const res = await fetch(
          `/api/billing/doble-cobro-detector?studio_id=${encodeURIComponent(studioId)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        setDobles(data.doblesCobros ?? []);
      } catch (err) {
        console.error('[DoblesCobrosCard]', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDobles();
  }, [studioId]);

  if (loading || dobles.length === 0) return null;

  const totalImporte = dobles.reduce((sum, d) => sum + d.importe_centimos, 0);
  const totalEur = (totalImporte / 100).toFixed(2);

  return (
    <Link
      href="/billing/dobles-cobros"
      className="flex flex-col gap-3 rounded-xl border border-destructive/30 p-4 bg-destructive/5 transition-colors hover:bg-destructive/10"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="text-[15px] font-bold text-foreground">
            {dobles.length === 1
              ? 'Doble cobro detectado'
              : `${dobles.length} dobles cobros detectados`}
          </h3>
          <p className="text-[13px] text-muted-foreground mt-1">
            Se detectaron cobros duplicados. Hay que revisar y revertir
            {' '}
            {totalEur}
            {' '}
            EUR.
          </p>

          {dobles.length <= 3 && (
            <ul className="flex flex-col gap-1 mt-2">
              {dobles.map((d) => (
                <li key={d.id} className="text-[12px] text-foreground">
                  {d.recibo_id}
                  {': '}
                  {(d.importe_centimos / 100).toFixed(2)}
                  {' '}
                  EUR (
                  {d.intentos_exitosos_count}
                  {' '}
                  cargos)
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-[13px] font-semibold text-destructive">
        Revisar y resolver
        <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
