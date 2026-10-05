import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// El ejecutor del Decision OS (`ejecutarRecomendacion`) y su medición
// (`construirSenalMedicion`) corren con service-role, sin RLS, y leen por los ids
// que lleva la recomendación: `socio_id`, `accion.reciboIds`, `sesion_id`. Esos
// ids no bastan solos —la FK a socios es global, y la fila la podía escribir la
// propietaria con su sesión hasta la migración 20261005121107—: una recomendación
// de este estudio con el id de una socia de otro le escribía a esa socia, dejaba
// su email en la Actividad de este y medía el outcome con datos ajenos. Cada
// consulta de esta parte del fichero va acotada al estudio de la recomendación.
// Una nueva sin `studio_id` hace fallar esto.

const SRC = readFileSync(join(import.meta.dirname, 'decision.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

test('cada consulta del ejecutor y de la medición va acotada al estudio de la recomendación', () => {
  const desde = SRC.indexOf('async function crearCodigoReactivacion(');
  assert.ok(desde >= 0, 'falta el ejecutor');
  const tramo = SRC.slice(desde);
  const consultas = [...tramo.matchAll(/\.from\('([a-z_]+)'\)/g)];
  assert.ok(consultas.length >= 10, `solo ${consultas.length} consultas: ¿se ha movido el ejecutor?`);
  for (const [i, c] of consultas.entries()) {
    const inicio = c.index ?? 0;
    // La cadena de esa consulta: hasta el `;` o hasta la consulta siguiente (las
    // de un `Promise.all` comparten el `;`).
    const fin = Math.min(
      ...[tramo.indexOf(';', inicio), consultas[i + 1]?.index ?? Infinity].filter(x => x >= 0),
    );
    const cadena = tramo.slice(inicio, fin);
    assert.match(cadena, /studio_id/, `.from('${c[1]}') sin acotar al estudio: ${cadena.slice(0, 160)}`);
  }
});

test('el ejecutor no deja en Actividad datos de una socia que no es del estudio: sin su ficha, no se le envía nada', () => {
  for (const firma of ['async function ejecutarEnvioEmail(', 'async function ejecutarContactoSocia(']) {
    const i = SRC.indexOf(firma);
    const cuerpo = SRC.slice(i, SRC.indexOf('\n}\n', i));
    assert.match(cuerpo, /\.from\('socios'\)\.select\([^)]*\)\.eq\('id', r\.socioId\)\.eq\('studio_id', r\.studioId\)\.maybeSingle\(\)/, firma);
    assert.match(cuerpo, /if \(!socio\) return \{ ok: false,/, `${firma}: sin ficha en su estudio tiene que fallar`);
  }
});
