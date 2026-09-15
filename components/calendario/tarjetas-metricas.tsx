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
    // 200 px y no 215: con 215 las tres no cabían junto a los filtros ni en un
    // monitor de 1920 px, y caían a dos columnas con la tercera sola debajo.
    <div className="grid flex-none gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      {tarjetas.map((t, i) => (
        <button
          key={t.titulo}
          type="button"
          onClick={onClickTarjeta ? () => onClickTarjeta(i) : undefined}
          disabled={!onClickTarjeta}
          className="tarjeta-metrica rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition-transform enabled:hover:-translate-y-px enabled:cursor-pointer disabled:cursor-default"
        >
          <p className="text-[9.5px] font-bold uppercase tracking-wide text-muted-foreground">{t.titulo}</p>
          <p className="tm-valor mt-1 truncate text-[15px] font-bold tracking-tight text-foreground">{t.valor}</p>
          {/* Dos líneas y no `truncate`: junto a los filtros, en un MacBook Pro de
              1512 px, «clases que no llenan · revisa su hora» salía cortado. */}
          <p className="tm-pie mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{t.pie}</p>
          {t.barra && (
            <span className="tm-barra mt-1.5 block h-[3px] overflow-hidden rounded-full bg-border">
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
