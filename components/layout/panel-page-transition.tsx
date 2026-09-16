'use client';

import { ViewTransition } from 'react';
import { TIPO_SECCION } from '@/lib/panel/transiciones';

// ─────────────────────────────────────────────────────────────────────────────
// El contenido del panel al cambiar de sección: lo de antes se va hacia arriba
// fundiéndose y lo nuevo sube a su sitio. Menú y barra superior no se mueven —
// son la referencia de que lo que ha cambiado es el contenido, no la pantalla.
//
// Con View Transitions (React `<ViewTransition>` + `experimental.viewTransition`)
// y solo para las navegaciones con el tipo `panel-seccion` (ver
// lib/panel/transiciones.ts: el menú y el buscador ⌘K). `update` y no `enter`:
// este envoltorio no se desmonta al navegar, lo que cambia es lo de dentro. Por
// eso tampoco lleva `key` — remontar `children` perdería estado y dispararía
// refetches en cada navegación.
//
// ⚠️ Antes era una animación CSS (`.panel-page-in`) que se reiniciaba en cada
// ruta, y dejaba un `transform` identidad aplicado para siempre: cualquier
// `position: fixed` abierto desde una página se anclaba a la página y no a la
// ventana (el porqué de que todos los paneles vayan en portal). View Transitions
// anima fotos del contenido, no el contenido, y no deja nada puesto.
// ─────────────────────────────────────────────────────────────────────────────
export function PanelPageTransition({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransition update={{ [TIPO_SECCION]: 'panel-seccion', default: 'none' }} default="none">
      <div data-panel-pagina>{children}</div>
    </ViewTransition>
  );
}
