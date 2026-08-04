// Retos del carrusel de Inicio (tema Bloom, ver lib/theme-definitions.ts).
// Contenido FIJO de producto, no una tabla — mismo criterio que
// META_PROGRESO_SEMANAL (portal-home-logic.ts): sin un CRUD de catálogo para
// la propietaria, un reto nuevo es un PR que toca esta constante Y el CHECK
// de la migración de reto_participaciones a la vez, sin desincronía posible.
// Solo la participación de cada socia necesita persistencia real.

export interface RetoPortal {
  key: 'core' | 'cara';
  label: string;
  dias: string;
}

export const RETOS_PORTAL: readonly RetoPortal[] = [
  { key: 'core', label: 'Core Pilates', dias: '14 días' },
  { key: 'cara', label: 'Face Yoga', dias: '7 días' },
];

export const RETO_KEYS = RETOS_PORTAL.map((r) => r.key);

export function esRetoKeyValida(key: string): key is RetoPortal['key'] {
  return (RETO_KEYS as string[]).includes(key);
}
