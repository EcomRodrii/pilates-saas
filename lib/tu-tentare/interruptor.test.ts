import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tuTentareVisible } from './interruptor.ts';

// El formato (`on` / `estudios:`) lo prueba lib/interruptor-por-estudio.test.ts.
test('solo la propietaria, y solo con el interruptor encendido', () => {
  assert.equal(tuTentareVisible('PROPIETARIO', 'on', 's'), true);
  for (const rol of ['MANAGER', 'RECEPCION', 'INSTRUCTOR']) assert.equal(tuTentareVisible(rol, 'on', 's'), false, rol);
  assert.equal(tuTentareVisible('PROPIETARIO', undefined, 's'), false);
  assert.equal(tuTentareVisible('PROPIETARIO', 'estudios:otro', 's'), false);
});

test('guardia: la variable solo se lee en el servidor, y no hay una pública', () => {
  const ruta = readFileSync(new URL('../../app/api/configuracion/tu-tentare/route.ts', import.meta.url), 'utf8');
  assert.match(ruta, /process\.env\.TU_TENTARE/);
  // Lo que corre en el navegador no lee el entorno (ni hay una variable pública).
  for (const f of ['../../components/configuracion/tu-tentare/tus-modulos.tsx', '../../components/configuracion/secciones/seccion-panel.tsx', './cliente.ts']) {
    const codigo = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(codigo, /process\.env|NEXT_PUBLIC_TU_TENTARE/, f);
  }
});
