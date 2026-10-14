import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { PLAN_ENTITLEMENTS } from '../billing/entitlements.ts';
import {
  CON_MAS_RESERVAS,
  ENTITLEMENTS_FOUNDING_GRATIS,
  FRASE_FOUNDING,
  GRATIS_ALUMNAS,
  GRATIS_RESERVAS_MES,
  GRATIS_CON_LIMITES,
  GRATIS_MARGEN_DIAS,
  LIMITES_GRATIS,
  PRECIO_FOUNDING_PAGO,
  TOPE_GRATIS,
  precioMesWeb,
} from './founding-gratis.ts';

// Founding Studio gratis en la web comercial (decisión del fundador, 15-oct-2026).

test('las cifras son las de la decisión', () => {
  assert.equal(GRATIS_ALUMNAS, 150);
  assert.equal(GRATIS_RESERVAS_MES, 250);
  assert.equal(GRATIS_MARGEN_DIAS, 30);
  assert.equal(LIMITES_GRATIS, 'hasta 150 alumnas activas y 250 reservas al mes');
  assert.equal(TOPE_GRATIS, 'Hasta 150 alumnas activas y 250 reservas al mes');
  assert.equal(GRATIS_CON_LIMITES, 'Gratis hasta 150 alumnas activas y 250 reservas al mes');
});

test('con más reservas, Founding Studio de pago a su precio de siempre (29 €)', () => {
  assert.equal(PRECIO_FOUNDING_PAGO, 29);
  assert.equal(CON_MAS_RESERVAS, 'con más reservas, 29 €/mes');
});

test('la frase del fundador va literal, con la tilde de «Tú»', () => {
  assert.equal(FRASE_FOUNDING, 'Tú eres la prioridad. Si tu estudio crece, crecemos contigo.');
});

test('Founding Studio gratis incluye todo menos varias sedes, con su tope de alumnas', () => {
  const { features, maxSocios } = ENTITLEMENTS_FOUNDING_GRATIS;
  for (const [nombre, tiene] of Object.entries(features)) {
    assert.equal(tiene, nombre !== 'multiCentro', `${nombre} debería ser ${nombre !== 'multiCentro'}`);
  }
  assert.equal(maxSocios, GRATIS_ALUMNAS);
  // Mismas features que Estudio: lo que cambia entre los dos son los límites.
  assert.deepEqual(features, PLAN_ENTITLEMENTS.ESTUDIO.features);
});

test('precio en la web: Founding Studio 0, el resto el de su plan', () => {
  assert.equal(precioMesWeb('BASE'), 0);
  assert.equal(precioMesWeb('ESTUDIO'), 59);
  assert.equal(precioMesWeb('CADENA'), 149);
});

// ─────────────────────────────────────────────────────────────────────────────
// Guardia: la web comercial no vuelve a prometer lo que la decisión quitó.
// Ya no hay prueba de 7 días ni Founding Studio a 29 €. Las cifras de la
// competencia (Bonsai también tiene «29 €», GesYoga «30 días de prueba»…) no
// caen aquí: los patrones hablan de la prueba de Tentare y de su precio.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const WEB = [
  'app/page.tsx', 'app/layout.tsx', 'app/precios', 'app/empieza', 'app/sobre-tentare', 'app/comparativa',
  'app/soluciones', 'app/funcionalidades', 'app/recursos', 'app/glosario', 'components/landing',
  'components/comparativa', 'components/soluciones', 'components/funcionalidades', 'components/recursos',
  'lib/recursos/articulos', 'lib/seo', 'public/llms.txt',
];

function ficheros(ruta: string): string[] {
  const abs = join(RAIZ, ruta);
  if (statSync(abs).isFile()) return [ruta];
  return readdirSync(abs).flatMap((n) => ficheros(join(ruta, n)));
}

const PROHIBIDO: [RegExp, string][] = [
  [/TRIAL_DIAS/, 'la web no habla de la prueba local: ya no hay'],
  [/\b(7|siete)\s+días\s+(gratis|de prueba|sin tarjeta)/i, 'ya no hay prueba de 7 días'],
  [/prueba\s+(gratuita\s+)?de\s+(7|siete)\s+días/i, 'ya no hay prueba de 7 días'],
  [/con el plan que elijas|del plan que elijas/, 'ya no se elige plan para probar: se empieza en Founding Studio gratis'],
  // Founding Studio cuesta 29 € SOLO con más de 250 reservas: el precio va siempre
  // atado a las reservas («Founding Studio gratis (…; con más reservas, 29 €/mes)»).
  [/Founding Studio(?:(?!reservas)[^.\n]){0,40}\b29\b|\b29\b[^.\n]{0,12}Founding/, 'Founding Studio es gratis; los 29 € van con «con más reservas»'],
  [/después,? 59 ?€/, 'pasado lo gratis, Founding Studio cuesta 29 €; Estudio (59 €) es para más de 150 alumnas'],
  // «+ IVA» es de la competencia (Bonsai: «desde 29 €/mes + IVA»); Tentare lo decía con IVA.
  [/[Dd]esde 29(\s|&nbsp;)*(€|euros)(?!\/mes \+ IVA)/, 'el precio de entrada de Tentare es gratis'],
];

test('la web no promete la prueba de 7 días ni Founding Studio a 29 €', () => {
  const fallos: string[] = [];
  for (const f of WEB.flatMap(ficheros)) {
    if (!/\.(tsx?|txt)$/.test(f) || f.endsWith('.test.ts')) continue;
    readFileSync(join(RAIZ, f), 'utf8').split('\n').forEach((linea, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(linea)) return; // los comentarios cuentan la historia
      for (const [re, motivo] of PROHIBIDO) {
        if (re.test(linea.replace(/ | /g, ' '))) fallos.push(`${f}:${i + 1} — ${motivo}`);
      }
    });
  }
  assert.deepEqual(fallos, []);
});

test('en la web, «150 alumnas» de Tentare va siempre con «250 reservas al mes»', () => {
  // Con 150 alumnas lo normal es pasar de 250 reservas: un límite sin el otro engaña.
  const fallos: string[] = [];
  for (const f of WEB.flatMap(ficheros)) {
    if (!/\.(tsx?|txt)$/.test(f) || f.endsWith('.test.ts')) continue;
    readFileSync(join(RAIZ, f), 'utf8').split('\n').forEach((linea, i) => {
      const l = linea.replace(/ | /g, ' ');
      if (/150 alumnas/.test(l) && !/250 reservas|GRATIS_RESERVAS_MES|LIMITES_GRATIS|TOPE_GRATIS/.test(l)) fallos.push(`${f}:${i + 1}`);
    });
  }
  assert.deepEqual(fallos, []);
});
