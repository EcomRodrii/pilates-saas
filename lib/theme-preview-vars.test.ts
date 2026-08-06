import { test } from 'node:test';
import assert from 'node:assert/strict';

import { CLAVES_PREVIEW_PERMITIDAS } from './theme-preview-vars.ts';
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
