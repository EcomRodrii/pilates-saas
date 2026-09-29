import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CARPETAS_FUENTES_NATIVA, HOJA_FUENTES_NATIVA, RUTA_FUENTES_NATIVA, VARS_FAMILIAS_NATIVA } from './fuentes-nativa.ts';
import { varsPareja } from '../reservar/tema-app.ts';
import { TIPOGRAFIA_IDS } from '../student/apariencia.ts';

// ─────────────────────────────────────────────────────────────────────────────
// La hoja de fuentes de la nativa (app/widget-bundle/fuentes-nativa.css) es una
// COPIA de lo que `next/font` hace en la app (app/_fuentes/fuentes.ts y
// fuentes.css): si se separan, la misma pareja se ve distinta en la app, en el
// iframe y sin marco, y nadie se entera hasta que lo ve un ojo humano. Aquí se
// leen los tres ficheros como texto (como css-shadow-sin-divergencia.test.ts) y
// se comparan regla a regla.
// ─────────────────────────────────────────────────────────────────────────────

const raiz = join(import.meta.dirname, '..', '..');
const FUENTES = join(raiz, 'app/_fuentes');
const hoja = readFileSync(join(raiz, 'app/widget-bundle/fuentes-nativa.css'), 'utf8');
const fuentesTs = readFileSync(join(FUENTES, 'fuentes.ts'), 'utf8');
const fuentesCss = readFileSync(join(FUENTES, 'fuentes.css'), 'utf8');

/** Las reglas `@font-face` de la hoja, sin los comentarios. */
const reglas = [...hoja.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@font-face\s*\{([^}]*)\}/g)].map(m => m[1]);

function propiedad(regla: string, prop: string): string | null {
  return new RegExp(`(?:^|;)\\s*${prop}:\\s*([^;]+);`).exec(regla)?.[1].trim() ?? null;
}
const familiaDe = (regla: string) => propiedad(regla, 'font-family')!.replace(/^['"]|['"]$/g, '');
const urlDe = (regla: string) => /src:\s*url\(([^)]+)\)/.exec(regla)?.[1] ?? null;

/** Las familias con nombre entre comillas de una pila CSS. */
const familiasDe = (pila: string) => [...pila.matchAll(/'([^']+)'|"([^"]+)"/g)].map(m => m[1] ?? m[2]);

/** Las `var(--…)` que una pila lee. */
const variablesDe = (pila: string) => [...pila.matchAll(/var\((--[a-z0-9-]+)\)/g)].map(m => m[1]);

test('las rutas: la hoja cuelga de una carpeta versionada', () => {
  assert.equal(RUTA_FUENTES_NATIVA, '/widget-fuentes/v1');
  assert.equal(HOJA_FUENTES_NATIVA, '/widget-fuentes/v1/fuentes.css');
});

test('⚠️ toda variable a la que llegan las nueve parejas está definida (salvo --font-ui y --font-display, que pone la pareja)', () => {
  // Una que faltara se heredaría de la web del estudio (las custom properties
  // cruzan el shadow) o dejaría la declaración inválida: todo en system-ui.
  const vistas = new Set<string>();
  for (const id of TIPOGRAFIA_IDS) {
    for (const [k, v] of Object.entries(varsPareja(id))) {
      for (const x of variablesDe(v)) {
        vistas.add(x);
        if (x === '--font-ui' || x === '--font-display') continue;
        assert.ok(x in VARS_FAMILIAS_NATIVA, `${id}: ${k} lee ${x}, que la nativa no define`);
      }
    }
  }
  // Y ninguna de más: todo lo que se define lo usa alguna pareja.
  for (const k of Object.keys(VARS_FAMILIAS_NATIVA)) assert.ok(vistas.has(k), `${k} no lo usa ninguna pareja`);
  // Las dos que pone la pareja nunca se definen aquí: se pisarían con la suya.
  assert.equal('--font-ui' in VARS_FAMILIAS_NATIVA, false);
  assert.equal('--font-display' in VARS_FAMILIAS_NATIVA, false);
});

test('⚠️ cada familia que se nombra (las de la hoja y sus reservas) tiene su @font-face en la hoja', () => {
  const declaradas = new Set(reglas.map(familiaDe));
  const nombradas = new Set<string>();
  for (const v of Object.values(VARS_FAMILIAS_NATIVA)) for (const f of familiasDe(v)) nombradas.add(f);
  for (const id of TIPOGRAFIA_IDS) {
    for (const v of Object.values(varsPareja(id))) for (const f of familiasDe(v)) nombradas.add(f);
  }
  assert.ok(nombradas.size > 10);
  for (const f of nombradas) assert.ok(declaradas.has(f), `«${f}» se nombra y la hoja no la declara`);
});

test('las variables encadenan base, extendida y la MISMA reserva que en la app', () => {
  // `--font-jakarta: var(--font-jakarta-latin), var(--font-jakarta-ext), 'Plus Jakarta Sans Fallback'` en fuentes.css.
  const comparadas: string[] = [];
  for (const m of fuentesCss.matchAll(/^\s*(--font-[a-z-]+): var\(\1-latin\), var\(\1-ext\), '([^']+ Fallback)';/gm)) {
    const [, variable, reserva] = m;
    if (!(variable in VARS_FAMILIAS_NATIVA)) continue;
    comparadas.push(variable);
    const [base, ext, suReserva, ...resto] = familiasDe(VARS_FAMILIAS_NATIVA[variable]);
    assert.equal(resto.length, 0, variable);
    assert.match(base, /^Tentare /, variable);
    assert.equal(ext, `${base} Ext`, variable);
    assert.equal(suReserva, reserva, variable);
  }
  // Las seis familias con nombre propio; si el formato de fuentes.css cambia, esto no se queda en nada.
  assert.deepEqual(comparadas.sort(), ['--font-cormorant', '--font-figtree', '--font-jakarta', '--font-libre-caslon', '--font-outfit', '--font-poppins']);
  // Las de Instrument (las que componen `--font-ui`/`--font-display`): base y extendida sueltas, como `-latin`/`-ext`.
  assert.equal(VARS_FAMILIAS_NATIVA['--font-ui-ext'], VARS_FAMILIAS_NATIVA['--font-ui-latin'].replace(/'$/, " Ext'"));
  assert.equal(VARS_FAMILIAS_NATIVA['--font-display-ext'], VARS_FAMILIAS_NATIVA['--font-display-latin'].replace(/'$/, " Ext'"));
});

/** (fichero, peso, estilo, unicode-range) de cada entrada de las `localFont` de fuentes.ts, por familia de la hoja. */
function deFuentesTs(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const m of fuentesTs.matchAll(/const (\w+) = localFont\(\{([\s\S]*?)\n\}\);/g)) {
    const [, constante, cuerpo] = m;
    // El nombre de la constante es el de la familia (fuentes.ts lo explica): `Plus_Jakarta_Sans_Ext`.
    const familia = `Tentare ${constante.replace(/_Ext$/, '').replace(/_/g, ' ')}${constante.endsWith('_Ext') ? ' Ext' : ''}`;
    const rango = /prop: 'unicode-range', value: '([^']+)'/.exec(cuerpo)?.[1] ?? null;
    const entradas = new Set<string>();
    for (const s of cuerpo.matchAll(/\{ path: '\.\/([^']+)', weight: '(\d+)'(?:, style: '(\w+)')? \}/g)) {
      entradas.add(JSON.stringify([s[1], s[2], s[3] ?? 'normal', rango]));
    }
    out.set(familia, entradas);
  }
  return out;
}

test('⚠️ paridad: de cada familia, los ficheros, pesos, estilos y rangos son EXACTAMENTE los de la app', () => {
  const app = deFuentesTs();
  const deLaHoja = new Map<string, Set<string>>();
  for (const r of reglas) {
    const url = urlDe(r);
    if (!url) continue;
    const f = familiaDe(r);
    const clave = JSON.stringify([url, propiedad(r, 'font-weight'), propiedad(r, 'font-style'), propiedad(r, 'unicode-range')]);
    const set = deLaHoja.get(f) ?? new Set<string>();
    assert.equal(set.has(clave), false, `regla repetida: ${f} ${clave}`);
    deLaHoja.set(f, set.add(clave));
  }
  // Las dieciséis llamadas de las ocho familias: base y extendida de cada una.
  assert.equal(deLaHoja.size, 16);
  for (const [f, entradas] of deLaHoja) {
    assert.ok(app.has(f), `${f} no está en fuentes.ts`);
    assert.deepEqual([...entradas].sort(), [...app.get(f)!].sort(), f);
  }
  // Y cada una de las 8 carpetas tiene sus dos familias aquí.
  for (const [f, entradas] of app) {
    const carpetas = new Set([...entradas].map(e => (JSON.parse(e) as string[])[0].split('/')[0]));
    const viaja = [...carpetas].every(c => (CARPETAS_FUENTES_NATIVA as readonly string[]).includes(c));
    assert.equal(deLaHoja.has(f), viaja, f);
  }
});

test('las reservas ajustadas en métrica son, carácter a carácter, las de la app (sin Plex Mono ni Sacramento)', () => {
  const lineasApp = fuentesCss.split('\n').filter(l => l.startsWith('@font-face'));
  const lineasHoja = hoja.split('\n').filter(l => l.startsWith('@font-face') && !l.includes('src: url('));
  assert.equal(lineasHoja.length, 8);
  for (const l of lineasHoja) assert.ok(lineasApp.includes(l), l);
  assert.deepEqual(
    lineasApp.filter(l => !lineasHoja.includes(l)).map(l => familiasDe(l)[0]).sort(),
    ['IBM Plex Mono Fallback', 'Sacramento Fallback'],
  );
});

test('⚠️ cada url(...) existe en app/_fuentes, en una carpeta que viaja, y cada carpeta lleva su licencia', () => {
  const usadas = new Set<string>();
  for (const r of reglas) {
    const url = urlDe(r);
    if (!url) continue;
    assert.ok(existsSync(join(FUENTES, url)), `${url} no existe en app/_fuentes`);
    const carpeta = url.split('/')[0];
    assert.ok((CARPETAS_FUENTES_NATIVA as readonly string[]).includes(carpeta), `${carpeta} no está en CARPETAS_FUENTES_NATIVA`);
    usadas.add(carpeta);
  }
  // Ni una carpeta de más: `build:widget` copia lo que diga la lista.
  assert.deepEqual([...usadas].sort(), [...CARPETAS_FUENTES_NATIVA].sort());
  // Son OFL: la licencia viaja al lado de cada familia.
  for (const c of CARPETAS_FUENTES_NATIVA) assert.ok(existsSync(join(FUENTES, c, 'OFL.txt')), `${c} sin OFL.txt`);
});

test('toda regla con url carga con `font-display: swap` (la carga nunca bloquea el pintado)', () => {
  const conUrl = reglas.filter(urlDe);
  assert.equal(conUrl.length, 66);
  for (const r of conUrl) assert.equal(propiedad(r, 'font-display'), 'swap', r);
});

test('⚠️ la hoja no pide nada fuera de Tentare: rutas relativas, sin `http` ni `//`', () => {
  assert.equal(hoja.includes('http'), false);
  assert.equal(hoja.includes('//'), false);
  for (const r of reglas) {
    const url = urlDe(r);
    if (url) assert.match(url, /^[a-z]+\/[a-z0-9-]+\.woff2$/, url);
  }
});

test('⚠️ `build:widget` copia exactamente las carpetas de CARPETAS_FUENTES_NATIVA', () => {
  // El .mjs no importa TypeScript, así que lleva la lista escrita a mano. Si se
  // separan, una letra elegida pide un woff2 que no se sirve (y cae a la de
  // reserva sin ningún error en su web), o se publican fuentes que nadie usa.
  const script = readFileSync(join(raiz, 'scripts/build-widget-bundle.mjs'), 'utf8');
  const lista = /const CARPETAS_FUENTES_NATIVA = \[([\s\S]*?)\];/.exec(script)?.[1];
  assert.ok(lista, 'no encuentro CARPETAS_FUENTES_NATIVA en scripts/build-widget-bundle.mjs');
  const carpetas = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(carpetas, [...CARPETAS_FUENTES_NATIVA]);
  // Y deja la hoja donde la pide el bundle (`HOJA_FUENTES_NATIVA`).
  assert.ok(script.includes(`path.join(raiz, 'public${RUTA_FUENTES_NATIVA}')`), 'la carpeta de destino no es RUTA_FUENTES_NATIVA');
  assert.ok(HOJA_FUENTES_NATIVA.endsWith('/fuentes.css') && script.includes("'fuentes.css'"));
});
