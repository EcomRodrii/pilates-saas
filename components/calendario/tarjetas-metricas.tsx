'use client';

import type { MetricaCard } from '@/lib/calendario-metricas';

// Punto 10: nada de lienzo fijo — auto-fit para que las tarjetas se
// reorganicen solas según el ancho, en vez de desbordar en pantallas
// estrechas o dejar hueco vacío en las anchas.
export function TarjetasMetricas({ tarjetas, onClickTarjeta }: {
  tarjetas: MetricaCard[];
  onClickTarjeta?: (i: number) => void;
}) {
  return (
    <div className="grid flex-none gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))' }}>
      {tarjetas.map((t, i) => (
        <button
          key={t.titulo}
          type="button"
          onClick={onClickTarjeta ? () => onClickTarjeta(i) : undefined}
          disabled={!onClickTarjeta}
          className="rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition-transform enabled:hover:-translate-y-px enabled:cursor-pointer disabled:cursor-default"
        >
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">{t.titulo}</p>
          <p className="mt-1 truncate text-[15px] font-bold tracking-tight text-foreground">{t.valor}</p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{t.pie}</p>
          {t.barra && (
            <span className="mt-1.5 block h-[3px] overflow-hidden rounded-full bg-border">
              <span
                className="block h-full rounded-full transition-[width] duration-700"
                style={{ width: `${t.barra.pct}%`, background: t.barra.color }}
              />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
