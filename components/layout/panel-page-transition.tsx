'use client';

import { ViewTransition } from 'react';
import { TIPO_SECCION } from '@/lib/panel/transiciones';
import { useShellNuevo } from '@/lib/estudio/panel-nuevo-cliente';

// ─────────────────────────────────────────────────────────────────────────────
// El contenido del panel al cambiar de sección: lo de antes se va hacia arriba
// fundiéndose y lo nuevo sube a su sitio. Menú y barra superior no se mueven —
// son la referencia de que lo que ha cambiado es el contenido, no la pantalla.
//
// Con View Transitions (React `<ViewTransition>`; sin configuración en Next 16.3,
// donde `experimental.viewTransition` ya no existe) y solo para las navegaciones con el tipo `panel-seccion` (ver
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
  // Marco a sangre (`SHELL_NUEVO`): Shopify NO anima el contenido al cambiar de pantalla (medido el 21-nov-2026 con
  // `document.getAnimations()` en su admin: solo se funde el resaltado del menú, 150 ms, y se despliegan los submenús).
  // Aquí el deslizamiento + fundido de la sección se sentía como una carga lenta, así que con el marco nuevo se cambia en seco.
  const shell = useShellNuevo();
  return (
    <ViewTransition update={{ [TIPO_SECCION]: shell ? 'none' : 'panel-seccion', default: 'none' }} default="none">
      <div data-panel-pagina>{children}</div>
    </ViewTransition>
  );
}
