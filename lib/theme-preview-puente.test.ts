import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTemaJs } from './theme-preview-puente.ts';
import { DEFAULT_VARIANTES } from './theme-variantes.ts';
import { getThemeDefinition } from './theme-definitions.ts';

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
    tabBarStyle: 'clasica',
  });
});

// El caso real del bug: el preview grande pintaba la paleta de Bloom con la
// cabecera y los retos del tema PUBLICADO.
test('resolveTemaJs: un ThemeConfig de la galería llega con SU forma, no con la de hoy', () => {
  const bloom = getThemeDefinition('bloom')!.defaults;
  const r = resolveTemaJs(bloom)!;
  assert.equal(r.variantes.cabeceraInicio, 'titular');
  assert.equal(r.variantes.retos, 'color');
  assert.equal(r.variantes.accesosRapidos, 'rejilla');
  // Bloom no declara `barra`: ese eje se queda en el aspecto de hoy sin que el
  // resto se contagie.
  assert.equal(r.variantes.barra, DEFAULT_VARIANTES.barra);
});

test('resolveTemaJs: los tres temas de la galería se distinguen por su forma', () => {
  const forma = (id: string) => resolveTemaJs(getThemeDefinition(id)!.defaults)!.variantes;
  assert.equal(forma('oliva').accesosRapidos, 'rejilla');
  assert.equal(forma('oliva').barra, 'todasRelleno');
  assert.equal(forma('noir').accesosRapidos, 'circulos');
  assert.equal(forma('noir').barra, 'todas');
  assert.notDeepEqual(forma('oliva'), forma('bloom'));
  assert.notDeepEqual(forma('bloom'), forma('noir'));
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
