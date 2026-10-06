'use client';

import Link from 'next/link';
import type { BloqueAsistente, Metrica } from '@/lib/asistente/tipos';
import { CifraPrivada } from '@/components/ui/cifra-privada';
import { Hecho, frenteA } from '@/components/informes/piezas';
import { cn } from '@/lib/utils';
import { Tarjeta } from './tarjeta';

// Las cifras con el aspecto de Informes (`Hecho`): el mismo titular, la misma
// diferencia frente al mismo tramo anterior. El dinero, siempre con CifraPrivada.

const TONO = { sube: 'text-success', baja: 'text-destructive', igual: 'text-muted-foreground' } as const;

function Valor({ m }: { m: Metrica }) {
  return m.tipo === 'eur' ? <CifraPrivada inline>{m.valor}</CifraPrivada> : <>{m.valor}</>;
}

export function BloqueMetricas({ bloque }: { bloque: Extract<BloqueAsistente, { tipo: 'metricas' }> }) {
  const n = bloque.metricas.length;
  return (
    <Tarjeta tipo="metricas" titulo={bloque.titulo} pie={bloque.nota}>
      <div className={cn('grid border-t border-border', n === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
        {bloque.metricas.map((m, i) => {
          const contenido = (
            <Hecho
              titulo={m.etiqueta}
              valor={<Valor m={m} />}
              comparacion={m.comparacion ? { texto: m.comparacion.texto, tono: TONO[m.comparacion.tono], frente: frenteA(m.comparacion.frente) } : null}
            />
          );
          const borde = cn(
            'block min-w-0 [&_[data-valor]]:text-[20px] sm:[&_[data-valor]]:text-[24px] [&_[data-valor]]:whitespace-nowrap [&_[data-valor]]:font-mono [&_[data-valor]]:tracking-tight',
            i % 2 === 1 && 'border-l border-border',
            i >= 2 && 'border-t border-border',
            n % 2 === 1 && i === n - 1 && n > 1 && 'col-span-2',
          );
          return m.href
            ? <Link key={m.etiqueta} href={m.href} className={cn(borde, 'transition-colors hover:bg-muted/60')} data-metrica={m.etiqueta}>{contenido}</Link>
            : <div key={m.etiqueta} className={borde} data-metrica={m.etiqueta}>{contenido}</div>;
        })}
      </div>
    </Tarjeta>
  );
}
