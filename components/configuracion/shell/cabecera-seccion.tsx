'use client';

import { useMiWebNueva, usePanelNuevo } from '@/lib/estudio/panel-nuevo-cliente';
import { gruposConMiWeb, grupoEsLaSeccion } from '@/lib/configuracion/mi-web-nueva';
import { Baldosa } from '@/components/dashboard/vivo';
import { TONO_SECCION_CONFIG } from './tono-config';
import { ICONOS_SECCION } from './lista-secciones';
import type { RefObject } from 'react';
import { ArrowLeft } from 'lucide-react';
import { GRUPOS_PANEL_NUEVO, type SeccionConfiguracion } from '@/lib/configuracion/secciones';
import { hrefDeLugar } from '@/lib/configuracion/destino';
import { BotonTutorial } from '@/components/tutorial/boton-tutorial';

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
  const panelNuevo = usePanelNuevo();
  const miWebNueva = useMiWebNueva();
  // En qué grupo estás (con el interruptor, «Mi app» y «Mi web» son grupos propios: lib/configuracion/mi-web-nueva.ts).
  const grupo = gruposConMiWeb(GRUPOS_PANEL_NUEVO, miWebNueva).find(g => g.secciones.includes(seccion.id));
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
        {panelNuevo && <span className="mr-2 hidden md:inline-flex"><Baldosa tono={TONO_SECCION_CONFIG[seccion.id] ?? 'azul'} Icono={ICONOS_SECCION[seccion.id]} /></span>}
        <span className="min-w-0">
          {/* Panel nuevo: en qué grupo estás, encima del título, para no perderse. */}
          {panelNuevo && grupo && !grupoEsLaSeccion(grupo, seccion) && <span className="hidden text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:block">{grupo.titulo}</span>}
          <h2
            id="seccion-titulo"
            ref={tituloRef}
            tabIndex={-1}
            className="min-w-0 truncate text-base font-semibold text-foreground outline-none md:whitespace-normal md:text-xl md:text-balance"
          >
            {seccion.titulo}
          </h2>
        </span>
        {/* El «?» del tutorial de esta vista (P1.1): su clave es la URL canónica. */}
        <BotonTutorial ruta={hrefDeLugar({ tab: seccion.id })} />
      </div>
      <p className="-mt-2 max-w-2xl text-sm text-muted-foreground text-pretty md:-mt-3">{seccion.frase}</p>
    </>
  );
}
