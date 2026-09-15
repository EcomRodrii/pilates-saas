'use client';

import type { RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { SeccionConfiguracion } from '@/lib/configuracion/secciones';

// La cabecera de una sección abierta.
//
// En el móvil es una barra pegada bajo la barra superior, con la flecha de
// volver a la lista: una sección puede ser muy larga y, sin ella, volver era
// subir hasta arriba. En pantalla ancha no hace falta —la lista está al lado— y
// se queda un título normal.
//
// ⚠️ La barra tiene que ser hija DIRECTA de la sección: `sticky` solo se pega
// dentro de su contenedor, y envuelta en un <div> propio dejaría de pegarse en
// cuanto ese <div> saliera de la pantalla.
export function CabeceraSeccion({
  seccion,
  tituloRef,
  onVolver,
}: {
  seccion: SeccionConfiguracion;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  onVolver: () => void;
}) {
  return (
    <>
      <div className="sticky top-12 z-20 -mx-4 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:mx-0 md:h-auto md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <button
          type="button"
          onClick={onVolver}
          aria-label="Volver a Configuración"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:hidden"
        >
          <ArrowLeft size={20} aria-hidden />
        </button>
        <h2
          id="seccion-titulo"
          ref={tituloRef}
          tabIndex={-1}
          className="min-w-0 truncate text-base font-semibold text-foreground outline-none md:whitespace-normal md:text-xl md:text-balance"
        >
          {seccion.titulo}
        </h2>
      </div>
      <p className="-mt-2 max-w-2xl text-sm text-muted-foreground text-pretty md:-mt-3">{seccion.frase}</p>
    </>
  );
}
