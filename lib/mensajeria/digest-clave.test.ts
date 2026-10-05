import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sufijoDedupDelResumen } from './digest-reglas.ts';

// El cron del resumen pasa cada 3 h y lo que hay sin leer cambia entre pasadas.
// La clave de cada resumen tiene que depender SOLO de su lado: si dependiera de
// lo que trae la pasada, a quien es instructora y alumna le llegaban dos de
// equipo y ninguno de alumna el mismo día.
test('la clave del resumen depende solo de su lado, no de lo que traiga la pasada', () => {
  assert.equal(sufijoDedupDelResumen('STAFF'), 'equipo');
  assert.equal(sufijoDedupDelResumen('SOCIO'), null);
});

test('una fila sin lado (la función de antes de la migración) se publica con la clave de siempre', () => {
  assert.equal(sufijoDedupDelResumen(undefined), null);
  assert.equal(sufijoDedupDelResumen(null), null);
});
