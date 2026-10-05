import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Guardia de contrato: abrir un hilo apaga sus avisos de la campana, en la app
// de la alumna y en el panel, y cada lado solo toca los SUYOS. Si falla, se
// arregla la ruta, no la guardia.
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = join(import.meta.dirname, '..', '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8');
const ALUMNA = leer('app/api/public/mensajeria/conversaciones/[id]/leido/route.ts');
const PANEL = leer('app/api/mensajeria/conversaciones/[id]/leido/route.ts');
const HELPER = leer('lib/mensajeria/avisos-leidos.ts');

test('las dos rutas de «leído» apagan los avisos del hilo después de marcarlo, y si falla responden 500', () => {
  for (const [nombre, ruta, lado] of [['alumna', ALUMNA, 'alumna'], ['panel', PANEL, 'equipo']] as const) {
    const llamada = ruta.indexOf('marcarAvisosDeConversacionLeidos(');
    assert.ok(llamada > 0, `${nombre}: no apaga los avisos del hilo`);
    assert.ok(llamada > ruta.lastIndexOf(".from('conversacion_participantes')"), `${nombre}: apaga avisos antes de marcar el hilo`);
    assert.match(ruta.slice(llamada), new RegExp(`lado: '${lado}'`), `${nombre}: lado equivocado`);
    assert.match(ruta.slice(llamada), /if \(errorAvisos\) return errorInterno\(/, `${nombre}: un fallo al apagarlos no puede responder 204`);
  }
  // La identidad sale de la sesión verificada, nunca del body.
  assert.match(ALUMNA, /userId: user\.userId, studioId: body\.studioId, conversacionId: id/);
  assert.match(ALUMNA, /socioAutenticado\(user\.userId, body\.studioId\)/);
  assert.match(PANEL, /userId: sesion\.userId, studioId: sesion\.studioId, conversacionId: id/);
});

test('cada lado solo apaga sus avisos: la alumna los de SOCIA, el panel los demás, siempre de esa cuenta y ese estudio', () => {
  assert.match(HELPER, /\.eq\('recipient_user_id', p\.userId\)/);
  assert.match(HELPER, /\.eq\('studio_id', p\.studioId\)/);
  assert.match(HELPER, /p\.lado === 'alumna' \? q\.eq\('recipient_role', 'SOCIA'\) : q\.neq\('recipient_role', 'SOCIA'\)/);
  assert.match(HELPER, /\.eq\('data->>conversacionId', p\.conversacionId\)/);
});
