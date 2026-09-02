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
    barraFlotante: false,
    tabBarStyle: 'clasica',
    // Solo temas del kit; sin objeto que resolver, se queda en null (hereda).
    quickLinksStyle: null,
    // Sin tema del kit: se pinta el portal de siempre, que es lo de antes.
    temaKit: null,
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

// P1 de la auditoría del Theme Builder: `barraFlotante` viaja igual que
// `barraClasica` (eje independiente, mismo criterio defensivo) para que el
// override de `features.tab_bar_style` sobre el kit vea el borrador en vivo.
test('resolveTemaJs: `barraFlotante` real sí pasa, uno corrupto cae a false', () => {
  assert.equal(resolveTemaJs({ barraFlotante: true })?.barraFlotante, true);
  assert.equal(resolveTemaJs({ barraFlotante: 'sí' })?.barraFlotante, false);
});

test('resolveTemaJs: `quickLinksStyle` inventado cae a null (hereda), los dos válidos pasan', () => {
  assert.equal(resolveTemaJs({ quickLinksStyle: 'circulo-mágico' })?.quickLinksStyle, null);
  assert.equal(resolveTemaJs({ quickLinksStyle: 'cards' })?.quickLinksStyle, 'cards');
  assert.equal(resolveTemaJs({ quickLinksStyle: 'bare' })?.quickLinksStyle, 'bare');
});


// ── El tema del kit por el puente ───────────────────────────────────────────

test('resolveTemaJs: `temaKit` es SIEMPRE null — el kit se retiró (esTemaPortal() ahora es `false` a secas)', () => {
  // Antes esto llevaba el tema del kit que se estaba editando. Decisión del
  // fundador (2026-08-27): el sistema de temas del kit se retira por
  // completo — `esTemaPortal()` (themes/registro.ts) devuelve `false` para
  // cualquier id, así que ningún `themeId` (por válido que fuera en el
  // vocabulario viejo) puede volver a resolver un `temaKit`. La vista previa
  // del editor ya no puede montar el portal del kit, ni aunque el mensaje lo
  // pida.
  assert.equal(resolveTemaJs({ themeId: 'tentada' })?.temaKit, null);
});

test('⚠️ IDA Y VUELTA: `resolveTemaJs` sigue siendo idempotente sin el kit', () => {
  // El test que cazaba la ida-y-vuelta rota entre emisor y receptor sigue
  // vigente en espíritu — solo que ahora los DOS extremos tienen que
  // coincidir en "null", no en un id del kit.
  const config = { themeId: 'tentada', variantes: {}, barraClasica: false };
  const emitido = resolveTemaJs(config);
  const recibido = resolveTemaJs(emitido);
  assert.equal(emitido?.temaKit, null);
  assert.equal(recibido?.temaKit, null);
  assert.deepEqual(recibido, emitido, 'aplicarla dos veces tiene que dar lo mismo');
});

test('resolveTemaJs: un `themeId` de la galería del kit tampoco pasa ya, aunque sea un id que existió', () => {
  const config = { themeId: 'bloom', variantes: {}, barraClasica: false };
  assert.equal(resolveTemaJs(config)?.temaKit, null);
});

test('⚠️ resolveTemaJs: un id que no existe NO pasa — es entrada de postMessage', () => {
  assert.equal(resolveTemaJs({ themeId: 'no-existe' })?.temaKit, null);
  assert.equal(resolveTemaJs({ themeId: 42 })?.temaKit, null);
  assert.equal(resolveTemaJs({ themeId: { id: 'tentada' } })?.temaKit, null);
});

test('resolveTemaJs: un mensaje sin el campo deja el portal de siempre, no revienta', () => {
  assert.equal(resolveTemaJs({ variantes: {} })?.temaKit, null);
});
