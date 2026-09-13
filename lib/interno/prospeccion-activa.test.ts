import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prospeccionActiva, bloqueoProspeccion, MOTIVO_PROSPECCION_DESACTIVADA } from './prospeccion-activa.ts';

test('apagada por defecto: sin variable no se prepara ni se envía nada', () => {
  assert.equal(prospeccionActiva({}), false);
  const b = bloqueoProspeccion({});
  assert.equal(b?.status, 403);
  assert.equal(b?.codigo, 'PROSPECCION_DESACTIVADA');
  assert.match(b!.error, /art\. 14/);
  assert.match(b!.error, /supresión/);
});

test('solo el valor EXACTO «1» la enciende', () => {
  assert.equal(prospeccionActiva({ PROSPECCION_ACTIVA: '1' }), true);
  assert.equal(bloqueoProspeccion({ PROSPECCION_ACTIVA: '1' }), null);
  for (const casi of ['true', 'TRUE', ' 1', '1 ', 'yes', 'on', '0', '', '01']) {
    assert.equal(prospeccionActiva({ PROSPECCION_ACTIVA: casi }), false, `«${casi}» no debe encenderla`);
  }
});

test('todas las puertas que preparan o envían consultan el interruptor', () => {
  const raiz = join(import.meta.dirname, '..', '..');
  const leer = (r: string) => readFileSync(join(raiz, r), 'utf8');
  for (const ruta of [
    'app/api/interno/prospeccion/route.ts',
    'app/api/interno/prospeccion/generar/route.ts',
    'app/api/interno/prospeccion/borrador/route.ts',
    'app/api/interno/prospeccion/enviar/route.ts',
  ]) {
    assert.match(leer(ruta), /bloqueoProspeccion\(process\.env\)/, `${ruta} no comprueba el interruptor`);
  }
  assert.match(leer('lib/inngest/prospeccion.ts'), /prospeccionActiva\(process\.env\)/);
  assert.match(leer('lib/marketing/prospeccion-smtp.ts'), /prospeccionActiva\(process\.env\)/);
  // La pantalla lo explica en vez de ofrecer botones que el servidor rechazará.
  assert.match(leer('app/interno/crecimiento/prospeccion.tsx'), /motivoDesactivada/);
  assert.ok(MOTIVO_PROSPECCION_DESACTIVADA.startsWith('Desactivada hasta revisión legal'));
});
