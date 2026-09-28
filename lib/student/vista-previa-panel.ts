'use client';

import { useSyncExternalStore } from 'react';

// ¿Esta app está dentro de la vista previa de «Apariencia de tu app»?
//
// El panel (Configuración → Apariencia de tu app) monta la app REAL en un
// <iframe> del mismo origen. Es el único marco posible: `/portal/` solo se deja
// enmarcar desde el propio origen (`proxy.ts`, `frame-ancestors 'self'`), así
// que «estoy en un marco» es «estoy en la vista previa».
//
// Un solo sitio para esa pregunta: la hacen el registro del SW, el desvío de la
// instructora a su parte y la guardia de sesión de Inicio.

/** `false` en el servidor: allí no hay marco que mirar. */
export function enVistaPreviaDelPanel(): boolean {
  return typeof window !== 'undefined' && window.self !== window.top;
}

const sinCambios = () => () => {};

/**
 * Lo mismo, para pintar. `false` en el servidor y en la hidratación (no
 * descuadra el HTML); el valor real llega en el render siguiente. Quien DECIDA
 * algo en un efecto debe llamar a `enVistaPreviaDelPanel()` ahí dentro, no
 * fiarse de este valor, que en el primer efecto aún puede ser `false`.
 */
export function useEnVistaPreviaDelPanel(): boolean {
  return useSyncExternalStore(sinCambios, enVistaPreviaDelPanel, () => false);
}
