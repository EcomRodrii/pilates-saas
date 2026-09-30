import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// La versión de Node se decide UNA vez: `.nvmrc`. Antes cada workflow llevaba su
// número a mano (nueve `node-version: '22'`) y las claves de la caché de
// `node_modules` llevaban `node22` escrito en cinco sitios: el CI probaba con
// Node 22 mientras producción corría la 24, y subir de versión obligaba a
// acordarse de los catorce sitios. Uno solo que se olvidara restauraba un
// `node_modules` compilado para otra versión, o probaba con una distinta a la
// del resto del pipeline, y no se vería nada raro: solo dejaría de ser cierto que
// «el CI prueba lo que corre en producción».
//
// Este test no decide la versión: comprueba que todo lo que la repite coincide
// con `.nvmrc`. Para subirla, se cambia `.nvmrc` y este test dice qué falta.
const raiz = new URL('../', import.meta.url);
const major = readFileSync(new URL('.nvmrc', raiz), 'utf8').trim().replace(/^v/, '').split('.')[0];

const workflows = readdirSync(new URL('.github/workflows/', raiz))
  .filter(f => /\.ya?ml$/.test(f))
  .map(f => ({ f, texto: readFileSync(new URL(`.github/workflows/${f}`, raiz), 'utf8') }));

test('.nvmrc es un número de versión mayor válido', () => {
  assert.match(major, /^\d+$/, `.nvmrc tiene que empezar por el número de versión mayor, y dice «${major}»`);
});

test('todo `node-version` de un workflow coincide con .nvmrc', () => {
  for (const { f, texto } of workflows) {
    for (const [, valor] of texto.matchAll(/^\s*node-version:\s*['"]?([\w.]+)['"]?\s*$/gm)) {
      assert.equal(valor.split('.')[0], major,
        `${f}: node-version ${valor}, pero .nvmrc dice ${major}. El CI tiene que probar lo que corre en producción.`);
    }
  }
});

test('las claves de caché con la versión de Node coinciden con .nvmrc', () => {
  for (const { f, texto } of workflows) {
    for (const [, valor] of texto.matchAll(/-node(\d+)-/g)) {
      assert.equal(valor, major,
        `${f}: una clave de caché lleva node${valor}, pero .nvmrc dice ${major}. Restauraría un node_modules de otra versión.`);
    }
  }
});

test('hay al menos un workflow que fija la versión (el test no puede pasar en vacío)', () => {
  const total = workflows.reduce((n, w) => n + [...w.texto.matchAll(/^\s*node-version:/gm)].length, 0);
  assert.ok(total >= 5, `solo se encontraron ${total} node-version en los workflows`);
});
