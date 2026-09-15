'use client';

import type { RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { HerramientaConfiguracion, SeccionConfiguracion } from '@/lib/configuracion/secciones';

// La cabecera de una herramienta abierta: volver a su sección, su nombre y una
// frase.
//
// A diferencia de la de una sección, «volver» se ve en TODAS las anchuras: la
// herramienta ocupa el ancho entero, sin la columna de secciones al lado, así
// que es la única salida que hay a la vista. Y dice a dónde vuelve.
//
// ⚠️ En el móvil la barra se pega bajo la barra superior, y por eso tiene que
// ser hija DIRECTA de la <section> de la herramienta (ver cabecera-seccion.tsx).
export function CabeceraHerramienta({
  herramienta,
  seccion,
  tituloRef,
  onVolver,
}: {
  herramienta: HerramientaConfiguracion;
  seccion: SeccionConfiguracion;
  tituloRef: RefObject<HTMLHeadingElement | null>;
  onVolver: () => void;
}) {
  return (
    <>
      <div className="sticky top-12 z-20 -mx-4 flex h-14 items-center gap-1 border-b border-border bg-background/95 px-2 backdrop-blur md:static md:mx-0 md:h-auto md:flex-col md:items-start md:gap-1 md:border-0 md:bg-transparent md:px-0 md:backdrop-blur-none">
        <button
          type="button"
          onClick={onVolver}
          aria-label={`Volver a ${seccion.titulo}`}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-full px-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:-ml-2.5"
        >
          <ArrowLeft size={20} aria-hidden />
          <span className="max-md:sr-only">{seccion.titulo}</span>
        </button>
        <h2
          id="herramienta-titulo"
          ref={tituloRef}
          tabIndex={-1}
          className="min-w-0 truncate text-base font-semibold text-foreground outline-none md:whitespace-normal md:text-xl md:text-balance"
        >
          {herramienta.titulo}
        </h2>
      </div>
      <p className="-mt-2 max-w-2xl text-sm text-muted-foreground text-pretty md:-mt-3">{herramienta.frase}</p>
    </>
  );
}
