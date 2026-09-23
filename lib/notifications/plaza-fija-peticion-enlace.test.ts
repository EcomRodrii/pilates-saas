// El aviso «Plaza fija por decidir» tiene que llevar a LA petición, no solo a
// la pantalla: con varias pendientes, «/dashboard» a secas deja buscando.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTOS, plantillaDe } from './catalog.ts';

const RAIZ = join(import.meta.dirname, '..', '..');

for (const rol of ['PROPIETARIO', 'MANAGER', 'RECEPCION'] as const) {
  test(`plaza_fija.peticion (${rol}) apunta a la tarjeta y a la fila`, () => {
    const p = plantillaDe(EVENTOS.PLAZA_FIJA_PETICION, rol);
    assert.ok(p, `sin plantilla para ${rol}`);
    assert.equal(p.deepLink?.({ solicitudId: 'pfs-1' }), '/dashboard?peticion=pfs-1#decidir-plazas-fijas');
    // Sin id (avisos viejos): al menos la tarjeta.
    assert.equal(p.deepLink?.({}), '/dashboard#decidir-plazas-fijas');
  });
}

test('el id de la petición viaja en el evento y va escapado en la URL', () => {
  const p = plantillaDe(EVENTOS.PLAZA_FIJA_PETICION, 'PROPIETARIO')!;
  assert.equal(p.deepLink?.({ solicitudId: 'a b&c' }), '/dashboard?peticion=a%20b%26c#decidir-plazas-fijas');
  const emit = readFileSync(join(RAIZ, 'lib/notifications/emit.ts'), 'utf8');
  assert.match(emit, /data: \{ socioId: p\.socioId, socia, peticion: p\.peticion, solicitudId: p\.solicitudId \}/);
});

test('la fila de la petición se puede localizar por data-peticion', () => {
  const card = readFileSync(join(RAIZ, 'components/dashboard/plazas-fijas-por-decidir.tsx'), 'utf8');
  assert.match(card, /data-peticion=\{p\.id\}/);
  assert.match(card, /useAnclaDeAviso\(ANCLA_DECIDIR\.plazasFijasPorDecidir/);
});
