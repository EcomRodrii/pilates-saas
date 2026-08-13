import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLAVES_PREVIEW_PERMITIDAS, varsDePreview, varsKitDePreview } from './theme-preview-vars.ts';
// `themeToCssVars` es literalmente lo que HomePreview/ThemeThumbVivo mandan
// por postMessage — mejor oráculo que la interna que lo alimenta.
import { themeToCssVars } from './theme-runtime.ts';
import { THEME_DEFINITIONS } from './theme-definitions.ts';

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
    })),
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
    })),
    // Estilos que declaran vars propias frente a los que heredan el fallback.
    { buttonStyle: 'outline' }, { buttonStyle: 'ghost' },
    { cardStyle: 'elevated' }, { cardStyle: 'bordered' },
    { portalHeadingFontId: 'instrumentSansBold' },
  ];
  for (const tema of temas) for (const c of Object.keys(themeToCssVars(tema))) emitidas.add(c);

  const sobran = [...CLAVES_PREVIEW_PERMITIDAS].filter((c) => !emitidas.has(c)).sort();
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
