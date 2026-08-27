import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemaJs } from './theme-preview-puente.ts';
import { DEFAULT_VARIANTES } from './theme-variantes.ts';

// `null` = "no pises nada", que NO es lo mismo que "pisa con los valores por
// defecto". Es la diferencia entre un portal fuera del editor (o un mensaje de
// una versión anterior del puente, sin `temaJs`) y un borrador que de verdad
// pide el aspecto de siempre.
test('resolveTemaJs: sin nada que resolver → null, no un objeto por defecto', () => {
  assert.equal(resolveTemaJs(undefined), null);
  assert.equal(resolveTemaJs(null), null);
  assert.equal(resolveTemaJs('titular'), null);
  assert.equal(resolveTemaJs(42), null);
});

test('resolveTemaJs: objeto vacío → el aspecto de hoy, completo', () => {
  assert.deepEqual(resolveTemaJs({}), {
    variantes: DEFAULT_VARIANTES,
    barraClasica: false,
    barraFlotante: false,
    tabBarStyle: 'clasica',
  });
});

// El caso real del bug: el preview grande pintaba la paleta del tema
// publicado en vez de la del borrador. Objetos inline en vez de un
// `ThemeDefinition` de la galería (retirada con el kit de temas, PR 2 de
// "borrar temas del kit") — lo que se prueba es que `resolveTemaJs` respeta
// la forma que le llega, no la forma de un tema concreto.
test('resolveTemaJs: un `ThemeConfig` en borrador llega con SU forma, no con la de hoy', () => {
  const r = resolveTemaJs({ variantes: { cabeceraInicio: 'titular', retos: 'color', accesosRapidos: 'rejilla' } })!;
  assert.equal(r.variantes.cabeceraInicio, 'titular');
  assert.equal(r.variantes.retos, 'color');
  assert.equal(r.variantes.accesosRapidos, 'rejilla');
  // Un eje no declarado se queda en el aspecto de hoy sin que el resto se
  // contagie.
  assert.equal(r.variantes.barra, DEFAULT_VARIANTES.barra);
});

test('resolveTemaJs: dos formas distintas no se confunden entre sí', () => {
  const forma = (variantes: Record<string, string>) => resolveTemaJs({ variantes })!.variantes;
  const a = forma({ accesosRapidos: 'rejilla', barra: 'todasRelleno' });
  const b = forma({ accesosRapidos: 'circulos', barra: 'todas' });
  assert.equal(a.accesosRapidos, 'rejilla');
  assert.equal(a.barra, 'todasRelleno');
  assert.equal(b.accesosRapidos, 'circulos');
  assert.equal(b.barra, 'todas');
  assert.notDeepEqual(a, b);
});

// Entrada no confiable: esto llega por postMessage. Mismo criterio defensivo
// que StudioProvider aplica a lo publicado, no uno más laxo por venir "del
// editor" — quien manda el mensaje no está autenticado por el hecho de
// compartir origen.
test('resolveTemaJs: un eje corrupto cae solo ÉL, y un tabBarStyle inventado cae a clásica', () => {
  const r = resolveTemaJs({
    variantes: { accesosRapidos: 'circulos', retos: 'fucsia-brillante' },
    barraClasica: 'sí',
    tabBarStyle: 'pestanaInventada',
  })!;
  assert.equal(r.variantes.accesosRapidos, 'circulos');
  assert.equal(r.variantes.retos, DEFAULT_VARIANTES.retos);
  assert.equal(r.barraClasica, false, 'solo `true` de verdad activa la barra clásica');
  assert.equal(r.tabBarStyle, 'clasica');
});

test('resolveTemaJs: `barraClasica`/`tabBarStyle` reales sí pasan', () => {
  const r = resolveTemaJs({ barraClasica: true, tabBarStyle: 'pestanaActiva' })!;
  assert.equal(r.barraClasica, true);
  assert.equal(r.tabBarStyle, 'pestanaActiva');
});

// P1 de la auditoría del Theme Builder: `barraFlotante` viaja igual que
// `barraClasica` (eje independiente, mismo criterio defensivo) para que el
// override de `features.tab_bar_style` sobre el kit vea el borrador en vivo.
test('resolveTemaJs: `barraFlotante` real sí pasa, uno corrupto cae a false', () => {
  assert.equal(resolveTemaJs({ barraFlotante: true })?.barraFlotante, true);
  assert.equal(resolveTemaJs({ barraFlotante: 'sí' })?.barraFlotante, false);
});
