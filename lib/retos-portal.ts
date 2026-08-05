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
  /**
   * Fondo propio de la tarjeta en la variante `retos: 'color'` (tema Bloom) —
   * los valores del prototipo. Es dato DEL RETO, no del tema: dos retos se
   * distinguen entre sí por su color, igual que en el prototipo.
   */
  fondo: string;
  /**
   * Tinta sobre ese fondo. Fija y oscura A PROPÓSITO, sin depender del modo
   * noche: el fondo es un color claro constante, así que la tinta del modo
   * (`t.ink`, que en noche es casi blanca) se volvería ilegible encima. El
   * test de contraste de retos-portal.test.ts fija este par.
   */
  tinta: string;
  /** Los tres círculos solapados de "gente apuntada". Decoración de COLOR,
   *  nunca fotos reales de socias — el prototipo también usa colores planos. */
  caras: readonly [string, string, string];
}

export const RETOS_PORTAL: readonly RetoPortal[] = [
  { key: 'core', label: 'Core Pilates', dias: '14 días', fondo: '#CFEFD6', tinta: '#1B2A20',
    caras: ['#FFC4D6', '#C9B8FF', '#FFE0A8'] },
  { key: 'cara', label: 'Face Yoga', dias: '7 días', fondo: '#FBD9EA', tinta: '#2A1A24',
    caras: ['#C9B8FF', '#FFE0A8', '#FFC4D6'] },
];

export const RETO_KEYS = RETOS_PORTAL.map((r) => r.key);

export function esRetoKeyValida(key: string): key is RetoPortal['key'] {
  return (RETO_KEYS as string[]).includes(key);
}
