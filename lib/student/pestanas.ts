// Las pestañas de la barra de abajo de la app de la alumna, y lo que se recuerda
// de cada una al cambiar de pestaña. Puro y sin `@/` (pestanas.test.ts).

/** Sufijos de ruta de las cinco pestañas, en el orden de la barra. */
export const RUTAS_PESTANAS_ALUMNA = ['', '/reservar', '/mis-reservas', '/bonos', '/perfil'] as const;

/**
 * ¿Es esta ruta una de las pestañas de la alumna? Solo la raíz de cada una: la
 * ficha de una clase (`/reservar/c1`) no es la pestaña «Reservar», y al abrirla
 * tiene que empezar arriba como cualquier pantalla nueva.
 */
export function esPestanaAlumna(path: string, slug: string): boolean {
  const base = `/portal/${encodeURIComponent(slug)}`;
  const p = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  return RUTAS_PESTANAS_ALUMNA.some((r) => p === base + r);
}

/**
 * A qué altura se vuelve al entrar en una pestaña: donde se dejó, o arriba si
 * nunca se movió. `null` = no es cosa nuestra (no es una pestaña): la pantalla
 * se abre como la abra el router.
 */
export function scrollAlVolver(esPestana: boolean, guardado: number | undefined): number | null {
  if (!esPestana) return null;
  return guardado && guardado > 0 ? guardado : 0;
}
