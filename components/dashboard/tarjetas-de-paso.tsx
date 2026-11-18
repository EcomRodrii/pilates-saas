'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { IlustracionPaso } from '@/components/ilustraciones/pasos';
import type { FilaArranque } from '@/lib/onboarding/arranque';

// Las tarjetas de «siguiente paso» del Resumen (marco a sangre, `SHELL_NUEVO`): imagen arriba con
// bisel, título de 15 px, texto gris, botón de contorno y un `×` de cristal para descartarla — la
// estructura y las medidas de la home de Shopify (título 15/500, texto 13 `#707070`, botón de 12/500,
// cierre de 24 px con `backdrop-filter: blur(8px)`), con ilustraciones propias. Pinta los pasos que
// faltan de la lista de arranque; los datos, los permisos y qué es «hecho» los decide quien la monta.

export function TarjetasDePaso({
  filas, puedeIr, publica, descartados, onDescartar,
}: {
  filas: FilaArranque[];
  puedeIr: (href: string) => boolean;
  publica: (href: string) => boolean;
  descartados: ReadonlySet<string>;
  onDescartar: (id: string) => void;
}) {
  const visibles = filas.filter(f => !f.done && !descartados.has(f.id)).slice(0, 3);
  if (visibles.length === 0) return null;
  return (
    <ul data-testid="tarjetas-de-paso" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {visibles.map(f => (
        <li key={f.id} className="min-w-0 rounded-2xl bg-card p-2 pb-4 shadow-[0_5px_5px_-2.5px_#00000008,0_3px_3px_-1.5px_#00000005,0_2px_2px_-1px_#00000005,0_1px_1px_-0.5px_#00000008,0_0.5px_0.5px_0_#0000000a,0_0_0_1px_#0000000f]">
          <div className="relative">
            <IlustracionPaso id={f.id} />
            <button
              type="button"
              onClick={() => onDescartar(f.id)}
              aria-label={`Descartar: ${f.label}`}
              className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-white/80 text-[#1b1b1b]/70 opacity-80 shadow-[0_2px_8px_#0000001f] backdrop-blur-[8px] transition-opacity hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-1 px-3 pt-3">
            <h3 className="text-[15px] font-medium leading-[1.25] tracking-[-0.01em] text-foreground">{f.label}</h3>
            <p className="text-[13px] leading-[1.375] text-[#707070] dark:text-muted-foreground">{f.descripcion}</p>
          </div>
          {puedeIr(f.href) && (
            <div className="px-3 pt-3">
              <Link
                href={f.href}
                {...(publica(f.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="zona-tactil inline-flex h-7 items-center rounded-lg border border-border bg-card px-3 text-[12px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                Hacer<span className="sr-only">: {f.label}</span>
              </Link>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
