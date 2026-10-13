// ─────────────────────────────────────────────────────────────────────────────
// Guardia de los tutoriales de pantalla (P1.1/P1.2), al estilo de
// `lib/tour/capitulos.test.ts`: lo que el tutorial dice tiene que existir.
//   · catálogo (`pantallas.ts`) y pasos (`tutoriales-pasos.ts`), las mismas pantallas;
//   · 3–4 pasos, títulos cortos y textos de dos líneas;
//   · cada selector existe en el código (`data-tour` o un id de Configuración);
//   · cada pantalla existe y no está congelada;
//   · cada nombre entre «» existe en la app (no se le habla de un botón que no hay);
//   · la tarjeta llega SOLO con `dynamic()` (nada en el chunk inicial);
//   · axe solo en los e2e (devDependency, nunca en el bundle).
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { AYUDA_POR_PANTALLA } from './pantallas.ts';
import { PASOS_TUTORIAL, hazloConmigoPara, pasosVisibles, type TutorialPasos } from './tutoriales-pasos.ts';
import { EJEMPLOS } from './ejemplos.ts';
import { resolverHref } from '../configuracion/destino.ts';
import { esRutaCongelada } from '../frozen-features.ts';

const raiz = join(import.meta.dirname, '..', '..');

function ficheros(dir: string, re = /\.(ts|tsx)$/): string[] {
  const salida: string[] = [];
  let entradas: string[];
  try { entradas = readdirSync(dir); } catch { return salida; }
  for (const e of entradas) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const ruta = join(dir, e);
    if (statSync(ruta).isDirectory()) salida.push(...ficheros(ruta, re));
    else if (re.test(e) && !/\.test\.tsx?$/.test(e)) salida.push(ruta);
  }
  return salida;
}

const CODIGO = ['app', 'components'].flatMap(d => ficheros(join(raiz, d))).map(f => ({ f, s: readFileSync(f, 'utf8') }));
const TODO = CODIGO.map(c => c.s).join('\n');
const SECCIONES = readFileSync(join(raiz, 'lib/configuracion/secciones.ts'), 'utf8');

const TUTORIALES = Object.entries(PASOS_TUTORIAL) as [string, TutorialPasos][];
const CON_TUTORIAL = Object.entries(AYUDA_POR_PANTALLA).filter(([, f]) => 'tutorial' in f).map(([r]) => r);

test('catálogo y pasos son las mismas pantallas (y hay las seis de P1.2)', () => {
  assert.deepEqual(TUTORIALES.map(([r]) => r).sort(), [...CON_TUTORIAL].sort());
  assert.ok(TUTORIALES.length >= 6, `Solo hay ${TUTORIALES.length} tutoriales: P1.2 son seis pantallas`);
});

test('de 3 a 4 pasos, títulos de 6 palabras como mucho y textos de dos líneas', () => {
  for (const [ruta, t] of TUTORIALES) {
    assert.ok(t.pasos.length >= 3 && t.pasos.length <= 4, `${ruta}: ${t.pasos.length} pasos (3–4)`);
    for (const p of t.pasos) {
      assert.ok(p.titulo.trim().split(/\s+/).length <= 6, `${ruta}: título largo «${p.titulo}»`);
      assert.ok(p.texto.length <= 160, `${ruta}: texto de más de dos líneas «${p.texto}»`);
      assert.match(p.texto, /[.?!]$/, `${ruta}: el texto acaba sin punto «${p.texto}»`);
    }
  }
});

test('cada persona, en cada ancho, ve al menos dos pasos (los filtros no lo vacían)', () => {
  for (const [ruta, t] of TUTORIALES) {
    for (const escritorio of [true, false]) {
      for (const moverDinero of [true, false]) {
        const n = pasosVisibles(t, { escritorio, moverDinero }).length;
        assert.ok(n >= 2, `${ruta}: ${n} paso(s) con escritorio=${escritorio}, moverDinero=${moverDinero}`);
      }
    }
  }
});

test('«Hazlo conmigo» del bono, solo para quien puede crear tarifas', () => {
  assert.equal(hazloConmigoPara(PASOS_TUTORIAL['/productos'], { moverDinero: false }), null);
  assert.equal(hazloConmigoPara(PASOS_TUTORIAL['/productos'], { moverDinero: true })?.ejemplo, 'bono');
  assert.equal(hazloConmigoPara(PASOS_TUTORIAL['/configuracion?tab=clases&abrir=tipos-de-clase'], { moverDinero: false })?.ejemplo, 'tipo-clase');
});

function selectorExiste(selector: string): boolean {
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    // Las filas de Configuración llevan de id el de su tarjeta (`secciones.ts`).
    return SECCIONES.includes(`id: '${id}'`) || TODO.includes(`id="${id}"`);
  }
  return TODO.includes(`data-tour="${selector}"`)
    || CODIGO.some(({ s }) => s.split('\n').some(l => l.includes('data-tour=') && l.includes(`'${selector}'`)));
}

test('cada paso señala un control que existe en el código', () => {
  const fuera = TUTORIALES.flatMap(([ruta, t]) => t.pasos.filter(p => !selectorExiste(p.selector)).map(p => `${ruta}: «${p.selector}»`));
  assert.deepEqual(fuera, [], `Selectores que no existen (añade el data-tour en su control):\n${fuera.join('\n')}`);
});

test('cada pantalla existe y no está congelada', () => {
  for (const [ruta] of TUTORIALES) {
    if (ruta.startsWith('/configuracion?')) {
      const d = resolverHref(ruta);
      assert.ok('tab' in d && d.tab, `${ruta}: no es una sección de Configuración`);
      const abrir = new URL(ruta, 'https://x.invalid').searchParams.get('abrir');
      if (abrir) assert.equal('abrir' in d ? d.abrir : null, abrir, `${ruta}: la herramienta «${abrir}» no existe`);
      continue;
    }
    assert.ok(existsSync(join(raiz, 'app/(dashboard)', ruta, 'page.tsx')), `${ruta}: no hay page.tsx`);
    assert.equal(esRutaCongelada(ruta), false, `${ruta}: está congelada`);
  }
});

test('cada nombre entre «» existe en la app', () => {
  const textos = TUTORIALES.flatMap(([ruta, t]) => [...t.pasos.map(p => p.texto), ...(t.hazloConmigo ? [t.hazloConmigo.texto] : [])].map(x => ({ ruta, x })));
  const fuera: string[] = [];
  for (const { ruta, x } of textos) {
    for (const m of x.matchAll(/«([^»]+)»/g)) if (!TODO.includes(m[1])) fuera.push(`${ruta}: «${m[1]}»`);
  }
  assert.deepEqual(fuera, [], `Nombres que la pantalla no tiene:\n${fuera.join('\n')}`);
});

test('nada de funciones congeladas en los textos', () => {
  const congeladas = /\b(kiosko|vídeo|vod|on ?demand|chat de equipo|network)\b/i;
  for (const [ruta, t] of TUTORIALES) for (const p of t.pasos) assert.doesNotMatch(`${p.titulo} ${p.texto}`, congeladas, ruta);
});

test('«Hazlo conmigo» pide un ejemplo que existe', () => {
  for (const [ruta, t] of TUTORIALES) if (t.hazloConmigo) assert.ok(t.hazloConmigo.ejemplo in EJEMPLOS, ruta);
});

test('la tarjeta del tutorial llega SOLO con dynamic()', () => {
  const conLib = [...CODIGO, ...ficheros(join(raiz, 'lib')).map(f => ({ f, s: readFileSync(f, 'utf8') }))];
  const quienes = conLib.filter(({ s }) => /tutorial\/tutorial-de-pantalla/.test(s)).map(({ f, s }) => ({ f: relative(raiz, f), s }));
  assert.ok(quienes.length > 0, 'nadie carga la tarjeta: ¿cambió la ruta del fichero?');
  for (const { f, s } of quienes) {
    // Solo las líneas que IMPORTAN (un comentario que cita la ruta no cuenta).
    for (const l of s.split('\n').filter(x => x.includes('tutorial/tutorial-de-pantalla') && /\bimport\b|\bfrom\b/.test(x))) {
      assert.match(l, /import\(\s*['"]@\/components\/tutorial\/tutorial-de-pantalla['"]\s*\)/, `${f}: import estático de la tarjeta: «${l.trim()}»`);
    }
  }
});

test('axe solo en los e2e', () => {
  const fuera = [...CODIGO, ...ficheros(join(raiz, 'lib')).map(f => ({ f, s: readFileSync(f, 'utf8') }))]
    .filter(({ s }) => /@axe-core\//.test(s)).map(({ f }) => relative(raiz, f));
  assert.deepEqual(fuera, [], `axe fuera de e2e/ (entraría en el bundle):\n${fuera.join('\n')}`);
});
