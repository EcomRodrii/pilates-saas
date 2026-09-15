'use client';

import { createContext, useContext } from 'react';
import type { SeccionId } from '@/lib/configuracion/secciones';

// Navegar DENTRO de Configuración sin perder la protección de #2008: quien
// cambia de sección no escribe la URL a mano, se lo pide al shell, que apunta
// lo que ha escrito para no volver a leerlo un render tarde.

export type ModoNavegacion = 'push' | 'replace';

export interface NavegacionConfig {
  /** `null` = la lista. Si hay cambios sin guardar en otra sección, pregunta antes. */
  irA: (tab: SeccionId | null, opciones?: { ancla?: string; modo?: ModoNavegacion; origen?: string }) => void;
  /**
   * La barra de guardar de `seccion` tiene cambios: salir de ella tiene que
   * preguntar. Devuelve con qué quitar la marca (al guardar, descartar o
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
