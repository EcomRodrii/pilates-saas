'use client';

import { createContext, useContext } from 'react';
import type { HerramientaId, SeccionId } from '@/lib/configuracion/secciones';

// Navegar DENTRO de Configuración sin perder la protección de #2008: quien
// cambia de sección no escribe la URL a mano, se lo pide al shell, que apunta
// lo que ha escrito para no volver a leerlo un render tarde.

export type ModoNavegacion = 'push' | 'replace';

export interface NavegacionConfig {
  /**
   * `null` = la lista. `abrir` = la pantalla de una herramienta de esa sección.
   * Si hay cambios sin guardar en lo que se deja, pregunta antes.
   */
  irA: (tab: SeccionId | null, opciones?: { ancla?: string; abrir?: HerramientaId; modo?: ModoNavegacion; origen?: string }) => void;
  /**
   * Lo que se ve ahora (`seccion`, o una herramienta suya) tiene cambios sin
   * guardar: salir tiene que preguntar. El shell apunta también la herramienta
   * abierta. Devuelve con qué quitar la marca (al guardar, descartar o
   * desmontarse).
   */
  marcarSinGuardar: (seccion: SeccionId) => () => void;
}

export const ContextoNavegacionConfig = createContext<NavegacionConfig | null>(null);

export function useNavegacionConfig(): NavegacionConfig | null {
  return useContext(ContextoNavegacionConfig);
}

/** Un clic normal se queda en la página; con Cmd/Ctrl/Mayús o botón central, el enlace hace lo suyo. */
export function esClicNormal(e: React.MouseEvent): boolean {
  return !e.defaultPrevented && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}
