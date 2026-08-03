'use client';

import { ThemeWorkspace } from './theme-workspace';

// "Apariencia" — layout único estilo Shopify Theme Editor (theme-workspace.tsx):
// selector de página + Secciones/Ajustes + preview centrado + panel de
// configuración a la derecha. Sustituye a las 4 pestañas planas que había
// antes (Marca y colores / Inicio / Contenido del portal / Bloques del
// portal) — cada una sigue guardando exactamente igual, solo cambia dónde se
// pinta.
export function AparienciaTabs() {
  return <ThemeWorkspace />;
}
