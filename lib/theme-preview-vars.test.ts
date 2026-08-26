import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLAVES_PREVIEW_PERMITIDAS, CLAVES_KIT_PERMITIDAS, varsDePreview, varsKitDePreview } from './theme-preview-vars.ts';
// `themeToCssVars` es literalmente lo que HomePreview/ThemeThumbVivo mandan
// por postMessage — mejor oráculo que la interna que lo alimenta.
import { themeToCssVars, varsKitMap } from './theme-runtime.ts';
import { THEME_DEFINITIONS } from './theme-definitions.ts';
import { TEMAS_PORTAL_IDS } from '../themes/registro.ts';
import { DEFAULT_THEME, RADIOS, ESTILOS_BOTON, ESTILOS_TARJETA, ESTILOS_TITULAR_PORTAL } from './theme-schema.ts';

// Ejes de FORMA del tema: son los que hacen que un tema declare vars que otro
// no declara, y por tanto los que pueden dejar la whitelist corta.
const EJES_BOOLEANOS = ['barraOscura', 'barraClasica', 'barraFlotante'] as const;

function combinaciones(): Record<string, unknown>[] {
  const salida: Record<string, unknown>[] = [];
  for (let mascara = 0; mascara < 1 << EJES_BOOLEANOS.length; mascara++) {
    const base: Record<string, unknown> = {};
    EJES_BOOLEANOS.forEach((eje, i) => { base[eje] = Boolean(mascara & (1 << i)); });
    salida.push(base);
  }
  return salida;
}

// P2 de la auditoría del Theme Builder: antes, cada eje de enum (buttonStyle,
// cardStyle, portalHeadingFontId, radius) se probaba con una lista de valores
// escrita a mano — y ESE fue el punto ciego real detrás de los huecos P0/P1
// de esta misma auditoría (`--btn-primary-*`, el preset de `radius`): un
// valor real del eje que nadie se acordó de añadir a la lista. Peor, la lista
// de `buttonStyle` llevaba tiempo probando `'ghost'`, que no es un
// `ButtonStyleId` real — `'soft'` nunca se probó ahí pese a estar en la
// lista de al lado.
//
// `ejesDeEnum` deriva las combinaciones DIRECTAMENTE del catálogo de
// theme-schema.ts (`ESTILOS_BOTON`, `ESTILOS_TARJETA`, `RADIOS`,
// `ESTILOS_TITULAR_PORTAL`): un valor nuevo en cualquiera de esos catálogos
// entra solo en la cobertura de estos 4 tests, sin que nadie tenga que
// acordarse de escribir una línea más aquí.
function ejesDeEnum(campo: string, catalogo: readonly { id: string }[]): Record<string, unknown>[] {
  return catalogo.map((v) => ({ [campo]: v.id }));
}

// Comunes a los dos vocabularios (de siempre y kit): los 4 ejes de enum que
// ambos emisores traducen a CSS vars propias según el valor.
const EJES_ENUM = [
  ...ejesDeEnum('buttonStyle', ESTILOS_BOTON),
  ...ejesDeEnum('cardStyle', ESTILOS_TARJETA),
  ...ejesDeEnum('portalHeadingFontId', ESTILOS_TITULAR_PORTAL),
];

// Solo el kit traduce el preset de `radius` (Recto/Redondeado/Píldora) a sus
// propios tokens — `themeToCssVars` (de siempre) no lo usa como tal.
const EJES_ENUM_KIT = [...EJES_ENUM, ...ejesDeEnum('radius', RADIOS)];

// ⚠️ El test que de verdad importa: una var que el motor emite y la whitelist
// no conoce se descarta EN SILENCIO en el preview y en las miniaturas. Así se
// perdieron las 7 de `varsBarraFlotante`/`varsRadioTema` durante varias PRs —
// los temas se veían todos iguales y nada fallaba.
test('ninguna var que emita el motor se queda fuera de la whitelist del preview', () => {
  const fuera = new Set<string>();

  const temas: unknown[] = [
    ...THEME_DEFINITIONS.map((d) => d.defaults),
    // Además de los temas reales, todas las combinaciones de ejes de forma y
    // un `radioTema` con las cuatro piezas: un tema guardado puede tener una
    // mezcla que hoy ningún tema de fábrica usa.
    ...combinaciones().map((ejes) => ({
      ...ejes,
      radioTema: { card: 20, boton: 12, chip: 999, acceso: 16 },
      destacado: '#D9B166',
      background: '#101820',
    })),
    ...EJES_ENUM,
  ];

  for (const tema of temas) {
    for (const clave of Object.keys(themeToCssVars(tema))) {
      if (!CLAVES_PREVIEW_PERMITIDAS.has(clave)) fuera.add(clave);
    }
  }

  assert.deepEqual([...fuera].sort(), [], 'vars emitidas que el preview descartaría');
});

// El otro lado: una clave en la whitelist que ya nadie emite es ruido, y peor,
// hace creer que ese eje llega al preview cuando el motor ya no lo manda.
test('la whitelist no tiene claves que el motor ya no emita', () => {
  const emitidas = new Set<string>();
  const temas: unknown[] = [
    ...THEME_DEFINITIONS.map((d) => d.defaults),
    ...combinaciones().map((ejes) => ({
      ...ejes,
      radioTema: { card: 20, boton: 12, chip: 999, acceso: 16 },
      destacado: '#D9B166',
      background: '#101820',
    })),
    ...EJES_ENUM,
  ];
  for (const tema of temas) for (const c of Object.keys(themeToCssVars(tema))) emitidas.add(c);

  const sobran = [...CLAVES_PREVIEW_PERMITIDAS].filter((c) => !emitidas.has(c)).sort();
  assert.deepEqual(sobran, []);
});

// ⚠️ El MISMO test, para el vocabulario del KIT. No existía, y por eso las 6
// claves `--size-*` que `varsEscalaSobreTema` emite de verdad llevaban meses
// fuera de la whitelist sin que nada avisara (auditoría 21-ago): la escala
// tipográfica cambiaba en producción y no en la vista previa. Las de arriba
// cubren `themeToCssVars`; estas dos cubren `varsKitMap`, que es el otro emisor.
test('ninguna var del KIT que emita el motor se queda fuera de su whitelist', () => {
  const fuera = new Set<string>();
  for (const id of TEMAS_PORTAL_IDS) {
    for (const ejes of [
      {},
      { radioTema: { card: 20, boton: 12, chip: 999, acceso: 16 } },
      // La escala se pide por PASOS (`escalaTexto`), y el motor deriva un
      // factor; con un paso desviado ya emite la escala entera del tema.
      { escalaTexto: { seccion: 30 } }, { escalaTexto: { tituloHero: 60, saludo: 20 } },
      { background: '#101820' },
      // `destacado`/`barraOscura` sobre un tema del KIT (`varsColorSobreTema`
      // con `accent`, `varsBarraOscuraSobreTema`): mismo tipo de hueco que
      // buttonStyle — P1 de la auditoría, cableando el kit de verdad.
      { destacado: '#D9B166' }, { barraOscura: true },
      ...EJES_ENUM_KIT,
    ]) {
      const tema = { ...DEFAULT_THEME, themeId: id, ...ejes } as never;
      for (const clave of Object.keys(varsKitMap(tema))) {
        if (!CLAVES_KIT_PERMITIDAS.has(clave)) fuera.add(clave);
      }
    }
  }
  assert.deepEqual([...fuera].sort(), [], 'vars del kit que el preview descartaría');
});

test('la whitelist del kit no tiene claves que ningún tema emita', () => {
  const emitidas = new Set<string>();
  for (const id of TEMAS_PORTAL_IDS) {
    for (const ejes of [
      {},
      { radioTema: { card: 20, boton: 12, chip: 999, acceso: 16 } },
      { escalaTexto: { seccion: 30 } },
      { background: '#101820' },
      { destacado: '#D9B166' }, { barraOscura: true },
      ...EJES_ENUM_KIT,
    ]) {
      const tema = { ...DEFAULT_THEME, themeId: id, ...ejes } as never;
      for (const c of Object.keys(varsKitMap(tema))) emitidas.add(c);
    }
  }
  const sobran = [...CLAVES_KIT_PERMITIDAS].filter((c) => !emitidas.has(c)).sort();
  assert.deepEqual(sobran, []);
});

// ── Lo que se escribe en el preview ─────────────────────────────────────────
//
// ⚠️ Regresión del fallo que reportó el fundador: "el editor de temas no
// muestra el tema que se va a publicar, muestra otra cosa". Con Noir
// publicado, las miniaturas de Clásico, Oliva y Bloom salían las tres con la
// barra negra de Noir. Comprobado en el navegador: la propiedad de línea
// estaba vacía y la calculada venía del `<style>` del tema publicado.

test('varsDePreview: lo que el tema declara, se aplica', () => {
  const r = varsDePreview({ '--portal-brand': '#7C5CFC' }, new Set(['--portal-brand']));
  assert.equal(r['--portal-brand'], '#7C5CFC');
});

test('varsDePreview: lo que el tema NO declara se neutraliza, no se omite', () => {
  // Omitirlo (o borrarlo) deja ver el valor del tema PUBLICADO, que vive en
  // una regla `:root` por debajo. `initial` hace que cada `var(--x, respaldo)`
  // use su respaldo, igual que en un portal sin esa var.
  const r = varsDePreview({ '--portal-brand': '#7C5CFC' }, new Set(['--portal-brand', '--portal-tabbar-bg']));
  assert.equal(r['--portal-tabbar-bg'], 'initial');
});

test('varsDePreview: escribe TODAS las claves permitidas, siempre', () => {
  // El listener recorre lo que devuelve esto: si una clave faltara, esa var se
  // quedaría con el valor del mensaje anterior o del tema publicado.
  const permitidas = new Set(['--a', '--b', '--c']);
  assert.deepEqual(Object.keys(varsDePreview({}, permitidas)).sort(), ['--a', '--b', '--c']);
});

test('varsDePreview: un valor que no es texto no se cuela', () => {
  // El mensaje llega de otra ventana: un número o un objeto no puede acabar
  // en `setProperty`.
  const r = varsDePreview({ '--portal-brand': 42 }, new Set(['--portal-brand']));
  assert.equal(r['--portal-brand'], 'initial');
});


// ── Los tokens del kit: la regla de limpieza es la CONTRARIA ────────────────

test('varsKitDePreview: lo que viene se aplica', () => {
  const { aplicar } = varsKitDePreview({ '--brand': '#B03060', '--bg': '#FFF5F8' });
  assert.equal(aplicar['--brand'], '#B03060');
  assert.equal(aplicar['--bg'], '#FFF5F8');
});

test('⚠️ varsKitDePreview: lo que NO viene se BORRA, no se pone a `initial`', () => {
  // Debajo de la propiedad en línea está el fichero del propio tema, que es
  // justo el valor al que se quiere volver. Con `initial`,
  // `border-radius: var(--radius-card)` —que no lleva respaldo— dejaría las
  // tarjetas cuadradas. Es la diferencia con `varsDePreview`, donde debajo
  // está el tema PUBLICADO y por eso allí sí se escribe `initial`.
  const { aplicar, borrar } = varsKitDePreview({ '--brand': '#B03060' });
  assert.equal(aplicar['--radius-card'], undefined);
  assert.ok(borrar.includes('--radius-card'));
  assert.ok(!Object.values(aplicar).includes('initial'));
});

test('varsKitDePreview: una clave fuera de la lista no entra', () => {
  const { aplicar } = varsKitDePreview({ '--brand': '#000', '--lo-que-sea': 'x' });
  assert.equal(aplicar['--lo-que-sea'], undefined);
});
