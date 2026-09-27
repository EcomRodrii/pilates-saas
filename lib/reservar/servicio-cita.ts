// Lo que dice cada servicio en el primer paso de «Reservar una cita» (pestaña
// y widget «Citas» de /reservar): puro, sin React, para poder probarlo.
//
// Nada se inventa: un precio 0 es «Gratis», pero un precio vacío NO lo es — en
// el panel significa «se acuerda en cada caso» (tab-servicios-cita.tsx), así
// que ahí solo se dice la duración.

import type { ServicioCita } from '../types.ts';
import { precioEnEuros } from './tarjeta-plan.ts';

/**
 * «Gratis», «45 €», o null si el precio se acuerda aparte. El único formato del
 * precio en todo el flujo de la cita: la opción, el resumen, el botón
 * «Continuar» y la hoja de confirmar dicen lo mismo.
 */
export function precioServicioCita(precio: ServicioCita['precio'] | undefined): string | null {
  if (precio == null || !Number.isFinite(precio)) return null;
  return precio <= 0 ? 'Gratis' : precioEnEuros(precio);
}

/** «30 min · Gratis», «45 min · 45 €», o «50 min» si el precio se acuerda aparte. */
export function metaServicioCita(s: Pick<ServicioCita, 'duracionMin' | 'precio'>): string {
  const duracion = `${s.duracionMin} min`;
  const precio = precioServicioCita(s.precio);
  return precio ? `${duracion} · ${precio}` : duracion;
}

// Palabras que no dan letra al monograma: «Sesión de valoración» es «SV», no «SD».
const ENLACES = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'e', 'con', 'para', 'a', 'en', 'o', 'u', 'al', 'por']);

/**
 * Las iniciales que ocupan el sitio de la miniatura: los servicios no tienen
 * foto propia, y una foto de catálogo repetida en cada fila se lee como error.
 * Dos palabras dan dos letras; una sola, su inicial.
 */
export function monogramaServicio(nombre: string): string {
  const palabras = nombre
    .split(/\s+/)
    .map(p => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  const utiles = palabras.filter(p => !ENLACES.has(p.toLowerCase()));
  const base = utiles.length > 0 ? utiles : palabras;
  return base.slice(0, 2).map(p => p[0].toLocaleUpperCase('es-ES')).join('');
}

/**
 * El servicio marcado: el que ya se eligió (al volver de los huecos) si sigue
 * existiendo, o el primero. Siempre hay uno marcado, así «Reservar cita» nunca
 * es un botón muerto.
 */
export function servicioMarcado(servicios: readonly Pick<ServicioCita, 'id'>[], elegido: string | null): string | null {
  if (elegido && servicios.some(s => s.id === elegido)) return elegido;
  return servicios[0]?.id ?? null;
}
