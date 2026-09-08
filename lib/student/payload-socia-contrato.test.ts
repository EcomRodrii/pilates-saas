import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardián: todo campo de `socia` que la app de alumna DECLARA leer tiene que
// existir en el objeto que el servidor MONTA.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// `PayloadMin` (lib/student/mapeo.ts) es una lista blanca escrita a mano sobre
// un `res.json()` que llega como `any`. Declarar un campo que el servidor no
// manda compila, pasa el lint y no lanza: llega `undefined` y la pantalla se
// comporta como si el dato no existiera. El comentario que ya vivía junto a
// `memberCredits` lo dice con todas las letras — «sin nombrarlo aquí llegaría
// `undefined` en silencio, como todo en esta frontera»— pero era una nota, no
// una comprobación.
//
// Se nota al añadir uno nuevo: #1776 empezó a leer `socia.rewardRedemptions`
// para saber qué recompensas ha agotado ya la socia por límite. Si mañana el
// servidor lo renombra, el tope por clienta deja de mostrarse en la app y NADA
// falla: la RPC lo sigue impidiendo, así que la socia pulsa «Canjear» y recibe
// un error en vez de ver el botón bloqueado. Un fallo mudo, del lado peor.
//
// Mismo enfoque que `rpc-columnas-declaradas.test.ts`: la deriva entre dos
// ficheros que ningún compilador cruza se caza leyéndolos.
//
// ── Si esto falla ────────────────────────────────────────────────────────────
// O el servidor dejó de mandar ese campo (y hay una pantalla leyendo humo), o
// se ha declarado en `PayloadMin` algo que nunca se pidió. Las dos cosas se
// arreglan en el fichero que las causó, no aflojando este test.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');

/**
 * Las claves del PRIMER nivel de un literal/bloque de objeto.
 *
 * Se cuenta la profundidad de llaves para no confundir los campos anidados
 * (`socio: { id, nombre, ... }`) con los de arriba. No es un parser de
 * TypeScript y no pretende serlo: los dos bloques que lee son literales
 * planos, y si algún día dejan de serlo, este test se vuelve ruidoso —que es
 * mejor que volverse silencioso.
 */
function clavesDelPrimerNivel(fuente: string, apertura: RegExp): string[] {
  const m = fuente.match(apertura);
  assert.ok(m?.index != null, `no se encontró el bloque ${apertura}`);
  let i = fuente.indexOf('{', m.index);
  let prof = 0;
  const claves: string[] = [];
  for (; i < fuente.length; i++) {
    const c = fuente[i];
    if (c === '{') { prof++; continue; }
    if (c === '}') { prof--; if (prof === 0) break; continue; }
    if (prof !== 1) continue;
    // Principio de línea (saltando espacios) + identificador + `?:` o `:`.
    if (c === '\n') {
      const finLinea = fuente.indexOf('\n', i + 1);
      const linea = fuente.slice(i + 1, finLinea === -1 ? fuente.length : finLinea);
      const k = linea.match(/^\s*([A-Za-z_$][\w$]*)\s*\??\s*:/);
      if (k) claves.push(k[1]);
    }
  }
  assert.ok(prof === 0, 'llaves desbalanceadas: el bloque no se cerró');
  return claves;
}

const mapeo = readFileSync(join(RAIZ, 'lib/student/mapeo.ts'), 'utf8');
const servidor = readFileSync(join(RAIZ, 'lib/db/supabase-data-admin.ts'), 'utf8');

// `socia?: {` en PayloadMin — lo que la app dice que va a leer.
const declarados = clavesDelPrimerNivel(mapeo, /socia\?:\s*\{/);
// `socia: {` en el payload que devuelve el servidor — lo que de verdad manda.
const emitidos = clavesDelPrimerNivel(servidor, /\n\s*socia:\s*\{/);

test('los dos bloques se han leído de verdad, no están vacíos', () => {
  // Sin esto, un cambio de formato que hiciera fallar al lector dejaría el
  // test en verde comparando dos listas vacías. Verde por vacío, otra vez no.
  assert.ok(declarados.length >= 10, `PayloadMin.socia leído a medias: ${declarados.join(', ')}`);
  assert.ok(emitidos.length >= 10, `payload del servidor leído a medias: ${emitidos.join(', ')}`);
  // Un par de anclas conocidas, por si el lector cogiera el bloque equivocado.
  assert.ok(declarados.includes('reservas'), 'PayloadMin.socia sin `reservas`');
  assert.ok(emitidos.includes('reservas'), 'el payload del servidor sin `reservas`');
});

test('cada campo que la app declara leer lo manda el servidor', () => {
  const huerfanos = declarados.filter((d) => !emitidos.includes(d));
  assert.deepEqual(
    huerfanos, [],
    `PayloadMin declara campos que el servidor NO manda (llegarían undefined en silencio): ${huerfanos.join(', ')}`,
  );
});

test('los campos de gamificación de los que depende el tope por clienta siguen ahí', () => {
  // Explícito y por nombre, no solo por la comprobación general de arriba: son
  // los que decidieron el diseño de #1776 y los que romperían el aviso de
  // «ya la has canjeado» sin que nada falle.
  for (const campo of ['memberCredits', 'rewardRedemptions']) {
    assert.ok(declarados.includes(campo), `PayloadMin.socia ya no declara ${campo}`);
    assert.ok(emitidos.includes(campo), `el servidor ya no manda socia.${campo}`);
  }
});
