import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CARPETAS_FUENTES_NATIVA, FAMILIAS_SERVIDAS_NATIVA, HOJA_FUENTES_NATIVA, RUTA_FUENTES_NATIVA, VARS_FAMILIAS_NATIVA,
  familiaServida, fuenteDelPago, letraNativa,
} from './fuentes-nativa.ts';
import { varsPareja } from '../reservar/tema-app.ts';
import { TIPOGRAFIA_IDS } from '../student/apariencia.ts';
import { familiaCssDe, urlFuenteGoogle } from '../reservar/config-widget.ts';
import { FUENTES_WIDGET, RESERVA_SANS, RESERVA_SERIF } from '../reservar/fuentes-catalogo.ts';

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

test('⚠️ la hoja solo declara familias «Tentare …», también las de reserva: nada que pise una de su web', () => {
  // Vive en el documento del estudio: una «Poppins Fallback» nuestra se sumaría a la suya y le cambiaría la letra.
  assert.ok(reglas.length > 0);
  for (const r of reglas) assert.match(familiaDe(r), /^Tentare /, r);
});

/** Una pila de la pareja, con las variables de la nativa sustituidas (las demás, tal cual). */
const conVariablesNativa = (pila: string) =>
  pila.replace(/var\((--[a-z0-9-]+)\)/g, (todo, v: string) => VARS_FAMILIAS_NATIVA[v] ?? todo);

test('⚠️ cada familia que se nombra tiene su @font-face en la hoja; las que no son nuestras, nunca, y con la nuestra delante', () => {
  const declaradas = new Set(reglas.map(familiaDe));
  const nombradas = new Set<string>();
  for (const v of Object.values(VARS_FAMILIAS_NATIVA)) {
    for (const f of familiasDe(v)) {
      assert.match(f, /^Tentare /, f);
      nombradas.add(f);
    }
  }
  // La pareja es la de la app (`FUENTE_BASE` nombra «'Instrument Sans Fallback'» sin
  // prefijo): esa no se declara, y en la pila de la nativa la de Tentare va antes.
  let ajenas = 0;
  for (const id of TIPOGRAFIA_IDS) {
    for (const [k, v] of Object.entries(varsPareja(id))) {
      const pila = familiasDe(conVariablesNativa(v));
      for (const [i, f] of pila.entries()) {
        if (f.startsWith('Tentare ')) {
          nombradas.add(f);
          continue;
        }
        ajenas++;
        assert.equal(declaradas.has(f), false, `${id} ${k}: la hoja declara «${f}», que no es nuestra`);
        assert.ok(pila.slice(0, i).includes(`Tentare ${f}`), `${id} ${k}: «${f}» sin «Tentare ${f}» delante`);
      }
    }
  }
  assert.ok(ajenas > 0, 'la pareja ya no nombra ninguna reserva sin prefijo: sobra la de Tentare al final de `-ext`');
  assert.ok(nombradas.size > 10);
  for (const f of nombradas) assert.ok(declaradas.has(f), `«${f}» se nombra y la hoja no la declara`);
});

test('las variables encadenan base, extendida y la MISMA reserva que en la app (con el prefijo de Tentare)', () => {
  // `--font-jakarta: var(--font-jakarta-latin), var(--font-jakarta-ext), 'Plus Jakarta Sans Fallback'` en fuentes.css.
  const comparadas: string[] = [];
  const instrument: string[] = [];
  for (const m of fuentesCss.matchAll(/^\s*(--font-[a-z-]+): var\(\1-latin\), var\(\1-ext\), '([^']+ Fallback)';/gm)) {
    const [, variable, reserva] = m;
    if (variable === '--font-ui' || variable === '--font-display') {
      // Las de Instrument (las que componen `--font-ui`/`--font-display`): base y
      // extendida sueltas, como `-latin`/`-ext`, y la reserva de Tentare al final de `-ext`.
      instrument.push(variable);
      const [base, ...restoBase] = familiasDe(VARS_FAMILIAS_NATIVA[`${variable}-latin`]);
      assert.equal(restoBase.length, 0, variable);
      assert.match(base, /^Tentare /, variable);
      assert.deepEqual(familiasDe(VARS_FAMILIAS_NATIVA[`${variable}-ext`]), [`${base} Ext`, `Tentare ${reserva}`], variable);
      continue;
    }
    if (!(variable in VARS_FAMILIAS_NATIVA)) continue;
    comparadas.push(variable);
    const [base, ext, suReserva, ...resto] = familiasDe(VARS_FAMILIAS_NATIVA[variable]);
    assert.equal(resto.length, 0, variable);
    assert.match(base, /^Tentare /, variable);
    assert.equal(ext, `${base} Ext`, variable);
    assert.equal(suReserva, `Tentare ${reserva}`, variable);
  }
  // Las seis familias con nombre propio y las dos de Instrument; si el formato de fuentes.css cambia, esto no se queda en nada.
  assert.deepEqual(comparadas.sort(), ['--font-cormorant', '--font-figtree', '--font-jakarta', '--font-libre-caslon', '--font-outfit', '--font-poppins']);
  assert.deepEqual(instrument.sort(), ['--font-display', '--font-ui']);
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

test('las reservas ajustadas en métrica son, carácter a carácter, las de la app salvo el prefijo (sin Plex Mono ni Sacramento)', () => {
  const lineasApp = fuentesCss.split('\n').filter(l => l.startsWith('@font-face'));
  const lineasHoja = hoja.split('\n').filter(l => l.startsWith('@font-face') && !l.includes('src: url('));
  assert.equal(lineasHoja.length, 8);
  const sinPrefijo = lineasHoja.map(l => {
    assert.ok(l.includes('font-family: "Tentare '), l);
    return l.replace('font-family: "Tentare ', 'font-family: "');
  });
  for (const l of sinPrefijo) assert.ok(lineasApp.includes(l), l);
  assert.deepEqual(
    lineasApp.filter(l => !sinPrefijo.includes(l)).map(l => familiasDe(l)[0]).sort(),
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

// ─────────────────────────────────────────────────────────────────────────────
// La letra de un código con diseño propio (`data-fuente` / `data-fuente-display`):
// si Tentare la sirve, de su hoja; si no, no se pide a nadie. Nunca a Google.
// ─────────────────────────────────────────────────────────────────────────────

/** Las familias de la hoja que no son extendida ni reserva, sin el prefijo: las que Tentare sirve de verdad. */
const familiasDeLaHoja = [...new Set(reglas.map(familiaDe))]
  .filter(f => !/ (Ext|Fallback)$/.test(f))
  .map(f => f.replace(/^Tentare /, ''));

test('⚠️ se sirven exactamente las familias que lleva la hoja: ni una que no esté (su woff2 no bajaría), ni una que falte', () => {
  assert.deepEqual([...FAMILIAS_SERVIDAS_NATIVA].sort(), familiasDeLaHoja.sort());
  assert.equal(FAMILIAS_SERVIDAS_NATIVA.length, 8);
});

test('una familia servida en su web: las «Tentare …» de la hoja, empezando por la suya, y la reserva de su tipo al final', () => {
  const declaradas = new Set(reglas.map(familiaDe));
  for (const familia of FAMILIAS_SERVIDAS_NATIVA) {
    const { pila, servida } = letraNativa(familia, 'web');
    assert.equal(servida, true, familia);
    const nombradas = familiasDe(pila).filter(f => f.startsWith('Tentare '));
    // La primera es la fuente de verdad, no su extendida ni su reserva.
    assert.equal(nombradas[0], `Tentare ${familia}`, familia);
    for (const f of nombradas) assert.ok(declaradas.has(f), `${familia}: nombra «${f}», que la hoja no declara`);
    // Y la reserva genérica de su tipo, la misma que la hoja: Times para las de remates.
    const reserva = reglas.find(r => familiaDe(r) === `Tentare ${familia} Fallback`);
    assert.ok(reserva, `${familia} sin reserva ajustada en la hoja`);
    const serif = /local\("Times New Roman"\)/.test(reserva);
    assert.ok(pila.endsWith(serif ? RESERVA_SERIF : RESERVA_SANS), `${familia}: ${pila}`);
    // Nada fuera de la hoja: ni `var()` (en su web no existe ninguna), ni un nombre de Google delante.
    assert.equal(pila.includes('var('), false, pila);
    assert.equal(familiasDe(pila).includes(familia), false, `${familia}: su nombre de Google no pinta nada en su web`);
  }
});

test('la misma familia en el panel: las variables de `next/font`, que la app ya tiene cargadas', () => {
  // Las públicas de fuentes.css (`--font-jakarta`) y las de cada `localFont` de fuentes.ts (`--font-ui-latin`).
  const definidas = new Set([
    ...[...fuentesCss.matchAll(/^\s*(--font-[a-z-]+):/gm)].map(m => m[1]),
    ...[...fuentesTs.matchAll(/variable: '(--font-[a-z-]+)'/g)].map(m => m[1]),
  ]);
  for (const familia of FAMILIAS_SERVIDAS_NATIVA) {
    const web = letraNativa(familia, 'web');
    const panel = letraNativa(familia, 'panel');
    assert.equal(panel.servida, true);
    const vars = variablesDe(panel.pila);
    assert.ok(vars.length > 0, familia);
    for (const v of vars) assert.ok(definidas.has(v), `${familia}: ${v} no la define la app`);
    // ⚠️ Nunca `--font-ui`/`--font-display`: la vista previa las fija ella misma con esta pila.
    assert.equal(vars.some(v => v === '--font-ui' || v === '--font-display'), false, panel.pila);
    // Las mismas variables que en su web, allí con su valor de la hoja, y la
    // misma reserva detrás: la previa no puede decir otra letra que su web.
    const reserva = web.pila.endsWith(RESERVA_SERIF) ? RESERVA_SERIF : RESERVA_SANS;
    assert.equal(`${vars.map(v => VARS_FAMILIAS_NATIVA[v]).join(', ')}, ${reserva}`, web.pila, familia);
    assert.ok(panel.pila.endsWith(reserva), familia);
  }
});

test('⚠️ del selector del diseño propio, Tentare sirve seis; las otras cuatro no se ofrecen sin marco', () => {
  const servidas = FUENTES_WIDGET.filter(f => familiaServida(f.familia)).map(f => f.familia);
  assert.deepEqual(servidas, ['Instrument Sans', 'Plus Jakarta Sans', 'Poppins', 'Outfit', 'Instrument Serif', 'Cormorant Garamond']);
  assert.deepEqual(
    FUENTES_WIDGET.filter(f => !familiaServida(f.familia)).map(f => f.familia),
    ['Inter', 'DM Sans', 'Playfair Display', 'Fraunces'],
  );
  // Las de remates del catálogo son de remates también aquí.
  for (const f of FUENTES_WIDGET.filter(x => familiaServida(x.familia))) {
    assert.ok(letraNativa(f.familia, 'web').pila.endsWith(f.categoria === 'serif' ? RESERVA_SERIF : RESERVA_SANS), f.familia);
  }
});

test('el nombre se reconoce como en el catálogo: sin distinguir mayúsculas ni espacios de sobra', () => {
  assert.equal(familiaServida('  poppins '), 'Poppins');
  assert.equal(familiaServida('PLUS JAKARTA SANS'), 'Plus Jakarta Sans');
  assert.equal(letraNativa('instrument serif', 'web').pila.startsWith("'Tentare Instrument Serif'"), true);
  assert.equal(familiaServida(''), null);
  assert.equal(familiaServida(null), null);
  assert.equal(familiaServida('Poppins Ext'), null);
});

test('⚠️ una que Tentare no sirve (un código de antes, o escrita a mano): se nombra con su reserva y no se pide a nadie', () => {
  for (const familia of ['Inter', 'Playfair Display', 'Space Grotesk', 'Lobster']) {
    for (const donde of ['web', 'panel'] as const) {
      const r = letraNativa(familia, donde);
      assert.equal(r.servida, false, familia);
      // La misma pila de siempre (con la reserva de su tipo): si su web ya la carga, se ve.
      assert.equal(r.pila, familiaCssDe(familia), familia);
    }
  }
  assert.ok(letraNativa('Playfair Display', 'web').pila.endsWith(RESERVA_SERIF));
});

test('el pago (iframe de Stripe): una «Tentare …» va con la hoja de Tentare, nunca a Google', () => {
  const hoja = `https://www.tentare.app${HOJA_FUENTES_NATIVA}`;
  assert.deepEqual(fuenteDelPago("'Tentare Poppins'", hoja), { familia: 'Tentare Poppins', cssSrc: hoja });
  assert.deepEqual(fuenteDelPago(' "Tentare Figtree"', hoja), { familia: 'Tentare Figtree', cssSrc: hoja });
  // Sin la hoja en la página no hay de dónde sacarla: el pago usa la de siempre.
  assert.equal(fuenteDelPago("'Tentare Poppins'", null), null);
  // Lo de siempre fuera de la nativa: un nombre limpio va a Google, un alias de next/font no.
  assert.deepEqual(fuenteDelPago("'Space Grotesk'", hoja), { familia: 'Space Grotesk', cssSrc: urlFuenteGoogle('Space Grotesk') });
  assert.equal(fuenteDelPago('Instrument_Sans', hoja), null);
  assert.equal(fuenteDelPago('  ', hoja), null);
  // Con la pila real de una letra servida, la primera familia es la de la hoja.
  const primera = letraNativa('Poppins', 'web').pila.split(',')[0];
  assert.equal(fuenteDelPago(primera, hoja)?.cssSrc, hoja);
});

test('⚠️ el bundle no le pide fuentes a Google: ni la URL ni la función que la construye', () => {
  // Pasó: `montarUno` metía un `<link>` a fonts.googleapis.com en la web del
  // estudio con cualquier `data-fuente`. La guardia es de texto, como la de
  // arriba: basta que alguien lo vuelva a importar para que se note aquí.
  const bundle = readFileSync(join(raiz, 'app/widget-bundle/main.tsx'), 'utf8');
  assert.equal(bundle.includes('urlFuenteGoogle'), false);
  assert.equal(bundle.includes('googleapis'), false);
  assert.equal(bundle.includes('familiaCssDe'), false, 'la letra del código pasa por `letraNativa`');
});
