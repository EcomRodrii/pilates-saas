import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// El enlace para guardar una tarjeta cambia con qué se le cobrará a la clienta:
// desde el equipo, solo quien puede mover dinero. El resto, como cualquier socia,
// solo para su propia ficha (camino 2). Estático: el módulo importa el servidor.
test('el camino del equipo exige puedeMoverDinero; sin él no se da por bueno, sigue al de la socia', () => {
  const fuente = readFileSync(join(import.meta.dirname, 'socia-autorizada.ts'), 'utf8');
  const staff = fuente.slice(fuente.indexOf('const staff = await verificarSesionStaff(req);'), fuente.indexOf('const usuario = await verificarUsuarioSupabase(req);'));
  assert.match(staff, /if \(puedeMoverDinero\(staff\.rol\)\) return \{ ok: true, socioId: socioIdPedido \};/);
  assert.equal((staff.match(/ok: true/g) ?? []).length, 1, 'ningún otro «sí» en el camino del equipo');
});
