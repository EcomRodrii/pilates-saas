import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

test('el estudio puede parar los emails de valoración sin quitar los avisos de la app', () => {
  const migration = read('supabase/migrations/20261128140100_studios_pedir_valoracion_por_email.sql');
  const worker = read('lib/inngest/valoraciones.ts');
  const config = read('components/configuracion/secciones/seccion-comunicacion.tsx');
  assert.match(migration, /pedir_valoracion_por_email boolean not null default true/);
  assert.match(migration, /grant update \(pedir_valoracion_por_email\) on public\.studios to authenticated/);
  assert.match(worker, /step\.run\(`valoracion-email-activo-\$\{c\.id\}`/);
  assert.match(worker, /return error \? true : data\?\.pedir_valoracion_por_email !== false/);
  assert.match(worker, /if \(!pedirEmail \|\| !a\.email \|\| conAviso\.has\(a\.socio_id\)\) continue/);
  const inApp = worker.indexOf('const inapp = await step.run');
  const emitir = worker.indexOf('await emitirValorarClase', inApp);
  const filtroEmail = worker.indexOf('if (!pedirEmail', inApp);
  assert.ok(inApp >= 0 && emitir > inApp && filtroEmail > emitir, 'la notificación en la app se procesa antes y no depende del email');
  assert.match(config, /FilaInterruptor id="pedir-valoraciones-email"/);
});
