'use client';

import { useCallback, useState } from 'react';
import { distanciaKm } from './geo.ts';
import { coordsDeCiudad } from './ciudades-coords.ts';

export type EstadoCercaDeMi = 'inactivo' | 'pidiendo' | 'activo' | 'denegado' | 'no_disponible';

/**
 * "Cerca de mí" (brief) — la posición del usuario solo existe en su
 * navegador, así que esto vive siempre en un hook de cliente, nunca en el
 * Server Component del marketplace (SEO, docs/NETWORK-AUDIT-2.md §11). Se
 * activa a petición explícita del usuario (nunca automático al cargar la
 * página — pedir el permiso sin que lo haya pedido nadie es el patrón que
 * hace que el navegador empiece a bloquear el prompt).
 */
export function useCercaDeMi() {
  const [estado, setEstado] = useState<EstadoCercaDeMi>('inactivo');
  const [posicion, setPosicion] = useState<{ lat: number; lng: number } | null>(null);

  const activar = useCallback(() => {
    if (!('geolocation' in navigator)) { setEstado('no_disponible'); return; }
    setEstado('pidiendo');
    navigator.geolocation.getCurrentPosition(
      pos => { setPosicion({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setEstado('activo'); },
      () => setEstado('denegado'),
      { timeout: 10_000 },
    );
  }, []);

  return { estado, posicion, activar };
}

/**
 * Distancia del perfil a `miPosicion`, o `null` si no hay forma de saberla.
 * Prioriza `lat`/`lng` reales (geocodificados en F2, Nominatim) cuando
 * existen — antes esta función solo sabía comparar contra el centro
 * aproximado de la ciudad (`coordsDeCiudad`), aunque el perfil ya tuviera
 * su posición real guardada. `coordsDeCiudad` se queda como red de
 * seguridad para los perfiles que todavía no han pasado por el backfill de
 * geocodificación (docs/NETWORK-Fase2-mapa.md).
 */
export function distanciaDePerfil(
  perfil: { ciudad: string | null; lat?: number | null; lng?: number | null },
  miPosicion: { lat: number; lng: number },
): number | null {
  if (perfil.lat != null && perfil.lng != null) {
    return Math.round(distanciaKm(miPosicion, { lat: perfil.lat, lng: perfil.lng }));
  }
  const coords = coordsDeCiudad(perfil.ciudad);
  return coords ? Math.round(distanciaKm(miPosicion, coords)) : null;
}

/**
 * Reordena por cercanía sin perder a nadie: los perfiles sin ciudad
 * reconocida se quedan al final, en su orden original (nunca se ocultan —
 * "cerca de mí" es un mejor esfuerzo, no un filtro).
 */
export function ordenarPorCercania<T>(
  items: T[], distanciaDe: (item: T) => number | null,
): Array<{ item: T; distanciaKm: number | null }> {
  return items
    .map(item => ({ item, distanciaKm: distanciaDe(item) }))
    .sort((a, b) => {
      if (a.distanciaKm == null && b.distanciaKm == null) return 0;
      if (a.distanciaKm == null) return 1;
      if (b.distanciaKm == null) return -1;
      return a.distanciaKm - b.distanciaKm;
    });
}
