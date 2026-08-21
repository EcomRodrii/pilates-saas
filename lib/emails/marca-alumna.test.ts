import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Regla de marca del repo: a una ALUMNA se le habla SIEMPRE con la marca de su
// estudio. Los nombres de producto («Tentare Manager» / «Tentare Core») son para
// el EQUIPO, y la marca paraguas «Tentare» para los correos de plataforma.
//
// ⚠️ Esto es un test de guardia, no de comportamiento, y existe porque el fallo
// real fue justo ese: `enviarEmailAvisoAlumna` mandaba con `'Tentare'` mientras
// el cuerpo del correo ya llevaba el logo y el color del estudio. Nada fallaba;
// simplemente la alumna recibía «tu clase se cancela» de una marca que no
// conoce. Un literal es fácil de colar otra vez, y aquí salta.
// ─────────────────────────────────────────────────────────────────────────────

const raiz = join(import.meta.dirname, '..', '..');

test('ningún emisor a alumnas manda con la marca de la plataforma', () => {
  const fichero = join(raiz, 'lib/sustituciones/email.ts');
  const src = readFileSync(fichero, 'utf8');

  // La función que avisa a las alumnas de que su clase cambia o se cae.
  const inicio = src.indexOf('export async function enviarEmailAvisoAlumna');
  assert.ok(inicio > 0, 'no se encuentra enviarEmailAvisoAlumna — ¿se renombró?');
  // Hasta la siguiente declaración de nivel superior. `indexOf('\n}')` no vale:
  // corta en la llave del bloque de tipos de los parámetros, antes del return.
  const resto = src.slice(inicio + 1);
  const sig = resto.search(/\n(?:export |type |async function |\/\/ ──)/);
  const conComentarios = sig === -1 ? resto : resto.slice(0, sig);
  // Sin comentarios: el propio docblock que explica el bug menciona el literal
  // que se está prohibiendo, y sin esto el test se dispara contra su explicación.
  const cuerpo = conComentarios.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  assert.ok(
    !/'Tentare'/.test(cuerpo),
    'el aviso a la alumna vuelve a mandarse con la marca de la plataforma',
  );
  assert.ok(
    /params\.estudioNombre/.test(cuerpo),
    'el aviso a la alumna debe mandarse con el nombre de SU estudio',
  );
  assert.ok(
    /replyTo/.test(cuerpo),
    'si la alumna responde, debe contestarle su estudio y no el buzón de la plataforma',
  );
});

test('los emails al EQUIPO sí conservan el nombre de producto', () => {
  // Lo contrario también importa: «Tentare Manager»/«Tentare Core» son
  // deliberados para el personal del estudio (ver nombreAppPorRol), y este
  // test no debe empujar a quitarlos de ahí.
  const src = readFileSync(join(raiz, 'lib/sustituciones/email.ts'), 'utf8');
  assert.ok(src.includes("'Tentare Manager'"), 'los avisos a gerencia perdieron su marca de producto');
  assert.ok(src.includes("'Tentare Core'"), 'los avisos a instructoras perdieron su marca de producto');
});
