import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { puedeGestionarCalendario } from './permisos-reglas.ts';
import type { Rol } from './types';

// Quién ve la tarjeta «reservas por aprobar» de la home.
//
// ⚠️ Esto NO puede ser un e2e. Desde #2013 (Tentare Core retirado) el panel no
// monta /dashboard para una INSTRUCTORA con el rol resuelto: el shell pinta la
// puerta a la app del estudio. Y mientras el rol carga, el rol mínimo también
// es INSTRUCTOR. INSTRUCTOR es el único rol sin `puedeGestionarCalendario`,
// así que ningún navegador llega a la home con un rol que la guardia deba
// rechazar: un e2e de «la instructora no la ve» pasaría en verde aunque se
// borrara la guardia. Lo que sí se puede fijar: la regla, que el servidor usa
// la misma, y que la tarjeta solo se monta detrás de ella.

const RAIZ = join(import.meta.dirname, '..');
const leer = (...ruta: string[]) => readFileSync(join(RAIZ, ...ruta), 'utf8');

test('solo quien gestiona el calendario decide reservas: nunca la instructora', () => {
  const esperado: Record<Rol, boolean> = { PROPIETARIO: true, MANAGER: true, RECEPCION: true, INSTRUCTOR: false };
  for (const [rol, puede] of Object.entries(esperado) as [Rol, boolean][]) {
    assert.equal(puedeGestionarCalendario(rol), puede, rol);
  }
});

// `assert.ok(re.test(…))` y no `assert.match`: un fallo de `match` vuelca el
// fichero entero en el log de CI, que es público y así ilegible.
test('el servidor exige la misma regla que la tarjeta', () => {
  const ruta = leer('app', 'api', 'reservas', 'resolver-pendiente', 'route.ts');
  assert.ok(/if \(!puedeGestionarCalendario\(sesion\.rol\)\)/.test(ruta), 'resolver-pendiente ya no comprueba puedeGestionarCalendario');
});

test('⚠️ la home monta la tarjeta una sola vez, y solo detrás de puedeGestionarCalendario', () => {
  const home = leer('app', '(dashboard)', 'dashboard', 'page.tsx');
  assert.equal(home.match(/<ReservasPorAprobar\b/g)?.length, 1, 'la tarjeta se monta en un solo sitio');
  assert.ok(/const gestionaCalendario = puedeGestionarCalendario\(rolActual\);/.test(home), 'gestionaCalendario ya no sale de puedeGestionarCalendario');
  assert.ok(/\{gestionaCalendario && <ReservasPorAprobar\b/.test(home), 'sin guardia, cualquier rol la pediría');
});
