'use client';

import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { ayudaDePantalla, urlDeAyuda, type AyudaPantalla } from '@/lib/ayuda/pantallas';
import { IconoInfo } from '@/lib/iconos';
import { cn } from '@/lib/utils';

// El (i) que va pegado al título de cada pantalla.
//
// Es un Popover y no un Tooltip por lo mismo que explica components/ui/tooltip:
// el tooltip lo esconde el navegador en táctil y no lo lee un lector de
// pantalla. Aquí hay que poder abrirlo con el ratón por encima, con un toque en
// el iPad del mostrador y con el teclado, porque muchas veces es lo único que
// alguien va a leer antes de decidir si esta pantalla es la que buscaba.
//
// Lo que dice cada uno vive en lib/ayuda/pantallas.ts, no aquí: el texto es
// dato, y así se escribe todo junto y con el mismo tono en vez de repartido por
// veinte páginas.
//
// El enlace de abajo NO repite lo mismo más largo: lleva al centro de ayuda, que
// es donde están los pasos y las capturas.

function Contenido({ ayuda }: { ayuda: AyudaPantalla }) {
  return (
    <>
      <p className="text-[13px] font-bold text-foreground">{ayuda.titulo}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
        {ayuda.resumen}
      </p>
      <p className="mt-2.5 border-t border-border pt-2.5 text-[12.5px] leading-relaxed text-muted-foreground text-pretty">
        <span className="font-semibold text-foreground">Te quita de encima: </span>
        {ayuda.ahorra}
      </p>
      <Link
        href={urlDeAyuda(ayuda.destino)}
        className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 rounded-sm outline-none"
      >
        Ver la guía completa
        <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    </>
  );
}

export function AyudaDePantalla({
  /** Ruta a explicar. Por defecto, la pantalla en la que estás. */
  ruta,
  className,
}: {
  ruta?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const ayuda = ayudaDePantalla(ruta ?? pathname);
  // Una pantalla sin ficha no pinta nada. Preferimos un hueco a un (i) que
  // abre un recuadro vacío o que lleva a una guía que no habla de esto.
  if (!ayuda) return null;

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger
        openOnHover
        delay={150}
        // Sin margen para llegar al recuadro, el enlace de dentro es
        // inalcanzable con el ratón: se cierra por el camino.
        closeDelay={200}
        data-slot="ayuda-pantalla-trigger"
        aria-label={`Qué es ${ayuda.titulo}`}
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-popup-open:bg-muted data-popup-open:text-foreground',
          className
        )}
      >
        <IconoInfo className="size-4" aria-hidden="true" />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        {/* ⚠️ El z-index va en el POSITIONER, no en el recuadro.
            El recuadro es `position: static`, y en un elemento estático el
            `z-index` NO HACE NADA: se ignora sin avisar. Con el `z-50` puesto
            ahí, en la Caja el recuadro se abría y se pintaba DEBAJO del TPV
            (que es un panel `fixed z-40` en su propio portal), así que parecía
            que el (i) no funcionaba. `z-[60]` y no `z-50` porque el (i) tiene
            que ganar también dentro de un diálogo, que ya vive en z-50 — y a
            igualdad de z-index manda el orden del DOM, donde este portal va
            primero y perdería. */}
        <PopoverPrimitive.Positioner className="z-[60]" side="bottom" align="start" sideOffset={8}>
          <PopoverPrimitive.Popup
            data-slot="ayuda-pantalla"
            className="w-[min(20rem,calc(100vw-2rem))] origin-[var(--transform-origin)] rounded-xl bg-popover p-3.5 text-popover-foreground ring-1 ring-foreground/10 shadow-lg transition-[transform,opacity] duration-100 ease-out data-starting-style:scale-98 data-starting-style:opacity-0 data-ending-style:scale-98 data-ending-style:opacity-0"
          >
            <Contenido ayuda={ayuda} />
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
