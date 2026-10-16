// Los dos niveles del estilo de «Tu web» v2 (decisión 4 del fundador, 15-oct-2026):
// «Igual que tu app» (por defecto) o «Un estilo solo para tu web». Antes eran
// cuatro capas (estilo, letra, botones y, plegado, lo fino), y la letra o el color
// de los botones podían quedarse elegidos debajo de un «Igual que tu app» marcado.
//
// Es solo cómo se PRESENTA el borrador (`WidgetWeb`): no hay dato nuevo. Un estilo
// propio es cualquiera de las tres cosas que «Igual que tu app» toma de su app:
// el estilo, la letra y el color de los botones. Lo demás («Tu web es…», el
// fundido, las esquinas, la separación y el pie) vale en los dos niveles.
//
// Sin imports de React ni de Next: lo leen tests de `node --test`.

import type { WidgetWeb } from '../reservar/estilo-web-tipos.ts';

export type NivelEstilo = 'app' | 'propio';

/** Lo que «Igual que tu app» toma de su app (y por tanto lo que vacía al elegirlo). */
export const CLAVES_DEL_NIVEL = ['estilo', 'letra', 'boton'] as const satisfies readonly (keyof WidgetWeb)[];

export function nivelDeEstilo(b: Pick<WidgetWeb, 'estilo' | 'letra' | 'boton'>): NivelEstilo {
  return b.estilo !== null || b.letra !== null || b.boton !== null ? 'propio' : 'app';
}

/**
 * El cambio que deja el borrador en «Igual que tu app». ⚠️ Vacía las TRES: si se
 * quedara la letra o el color de los botones, la pantalla diría «Igual que tu app»
 * con algo propio escondido debajo (la misma clase de silencio que costó el
 * 29-sep con el diseño propio).
 */
export function aIgualQueTuApp(): Pick<WidgetWeb, 'estilo' | 'letra' | 'boton'> {
  return { estilo: null, letra: null, boton: null };
}

/**
 * Qué pasa al pulsar uno de los dos niveles. Elegir el nivel no es, por sí solo,
 * un cambio que publicar:
 *  - «Igual que tu app» con algo propio elegido → el cambio de `aIgualQueTuApp`;
 *    si ya lo estaba, nada.
 *  - «Un estilo solo para tu web» → abre los estilos (`eligiendo`) y NO toca el
 *    borrador hasta que elija uno (o una letra, o un color de botones).
 */
export function elegirNivel(
  b: Pick<WidgetWeb, 'estilo' | 'letra' | 'boton'>,
  nivel: NivelEstilo,
): { cambio: Pick<WidgetWeb, 'estilo' | 'letra' | 'boton'> | null; eligiendo: boolean } {
  if (nivel === 'propio') return { cambio: null, eligiendo: true };
  return { cambio: nivelDeEstilo(b) === 'propio' ? aIgualQueTuApp() : null, eligiendo: false };
}
