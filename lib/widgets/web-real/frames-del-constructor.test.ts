import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Qué enmarca la pantalla del constructor de widgets («Tu web», Configuración)
// HOY, medido (17-oct-2026) y fijado aquí para que nadie lo amplíe sin darse
// cuenta. El resultado de la medición:
//
//  · Todos los <iframe> que pinta el constructor son de NUESTRO propio origen:
//    `/reservar/<slug>` (la vista previa y el escaparate de la portada) y, desde
//    esta función, `/vista-previa-web` (el documento que enmarca la web del
//    estudio). Por eso el panel no necesita ninguna `frame-src`: `proxy.ts` solo
//    pone `frame-ancestors` (quién puede enmarcar el panel), y esto lo fija.
//  · Stripe y el captcha NO se enmarcan desde el constructor: viven DENTRO de los
//    documentos de /reservar, que tienen sus propias cabeceras (y el proxy los
//    deja fuera). Una `frame-src` puesta al panel no los afecta… y una mal puesta
//    en el panel no puede romperlos; la que lleva `/vista-previa-web` solo cubre
//    ESE documento, que no ejecuta nada nuestro.
//  · La web del estudio solo se enmarca dentro de `/vista-previa-web`, con su
//    `frame-src` acotada a su dirección autorizada (marco-html.ts).
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..', '..');

function ficheros(dir: string): string[] {
  return readdirSync(dir).flatMap(nombre => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'node_modules' ? [] : ficheros(ruta);
    return /\.(ts|tsx)$/.test(nombre) && !/\.test\.ts$/.test(nombre) ? [ruta] : [];
  });
}

/** Los <iframe ... /> de un fichero (en JSX todos son autocerrados), con el texto de sus atributos. */
function iframesDe(texto: string): string[] {
  return [...texto.matchAll(/<iframe\b([\s\S]*?)\/>/g)].map(m => m[1]);
}

// Lo que el constructor pinta, por fichero, con el origen de cada marco.
const ESPERADO: Record<string, { cuantos: number; src: RegExp[] }> = {
  // Las dos capas de la vista previa (`contenido.src`, `c.src`): URLs de /reservar de NUESTRO origen.
  'components/widgets/vista-previa.tsx': { cuantos: 2, src: [/src=\{contenido\.src\}/, /src=\{c\.src\}/] },
  // El escaparate de la portada vacía.
  'components/widgets/v2/vacio-que-ensena.tsx': { cuantos: 1, src: [/src=\{src\}/] },
  // El documento propio que enmarca su web (NUNCA la dirección de su web directamente).
  'components/widgets/v2/su-web-detras.tsx': { cuantos: 1, src: [/src=\{src\}/] },
};

test('los marcos que pinta el constructor son los de siempre: solo documentos de NUESTRO origen', () => {
  const vistos: Record<string, number> = {};
  for (const f of ficheros(join(RAIZ, 'components', 'widgets'))) {
    const rel = relative(RAIZ, f);
    const marcos = iframesDe(readFileSync(f, 'utf8'));
    if (marcos.length) vistos[rel] = marcos.length;
    const esperado = ESPERADO[rel];
    assert.ok(!marcos.length || esperado, `${rel} pinta un <iframe> que esta prueba no conoce: ¿qué origen enmarca? Si es de otro origen, necesita su propia política y su permiso (ver lib/widgets/web-real/marco-html.ts)`);
    if (!esperado) continue;
    assert.equal(marcos.length, esperado.cuantos, `${rel}: cambió el número de <iframe>`);
    for (const m of marcos) {
      assert.ok(esperado.src.some(r => r.test(m)), `${rel}: un <iframe> con un src que no es el esperado (${m.trim().slice(0, 80)})`);
      // Ninguno lleva una dirección literal: todo sale de nuestras propias rutas.
      assert.doesNotMatch(m, /src=["'`]https?:/, `${rel}: un <iframe> con una dirección ajena escrita a mano`);
    }
  }
  assert.deepEqual(Object.keys(vistos).sort(), Object.keys(ESPERADO).sort(), 'los ficheros del constructor con marcos');
});

test('⚠️ la dirección que se enmarca de su web NO sale del navegador: el panel solo lleva `/vista-previa-web?t=` y manda `forzar`', () => {
  const hook = readFileSync(join(RAIZ, 'components/widgets/v2/usar-web-real.ts'), 'utf8');
  assert.match(hook, /`\/vista-previa-web\?t=\$\{encodeURIComponent\(permiso\)\}`/);
  // El cuerpo de la petición solo lleva `forzar`: ninguna dirección ni id.
  assert.match(hook, /body: JSON\.stringify\(\{ forzar \}\)/);
});

test('el panel no tiene `frame-src` global: ni en `proxy.ts` ni en `next.config.ts` (solo la lleva el documento de la web del estudio)', () => {
  for (const f of ['proxy.ts', 'next.config.ts']) {
    const t = readFileSync(join(RAIZ, f), 'utf8')
      // Los comentarios pueden hablar de ella; lo que no puede haber es una directiva real.
      .split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
    assert.doesNotMatch(t, /frame-src/, `${f} no debe fijar frame-src`);
  }
  // Y /vista-previa-web queda fuera del proxy (que pondría `frame-ancestors 'none'`).
  assert.match(readFileSync(join(RAIZ, 'proxy.ts'), 'utf8'), /\(\?!reservar[^)]*vista-previa-web\)/);
});
