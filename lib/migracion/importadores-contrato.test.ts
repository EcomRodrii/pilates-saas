// Vigila, leyendo el código fuente, lo que los importadores deben seguir haciendo.
// Las rutas API no se pueden importar en test; el patrón del repo es este.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const leer = (r: string) => readFileSync(new URL(`../../${r}`, import.meta.url), 'utf8');

test('clases/import: los solapes se apartan ANTES de escribir, y el tipo nuevo se crea después', () => {
  const s = leer('app/api/clases/import/route.ts');
  const iSolapes = s.indexOf('detectarSolapes(');
  const iTipos = s.indexOf(".from('tipos_clase').insert(");
  const iSesiones = s.indexOf(".from('sesiones').insert(");
  assert.ok(iSolapes > 0 && iTipos > 0 && iSesiones > 0);
  assert.ok(iSolapes < iTipos, 'los tipos nuevos no se crean hasta saber qué clases sobreviven al control de solapes');
  assert.ok(iTipos < iSesiones, 'el tipo debe existir antes de las sesiones (FK)');
});

test('clases/import: ya no culpa a «sala y hora» de cualquier fallo, y limpia los tipos sueltos', () => {
  const s = leer('app/api/clases/import/route.ts');
  assert.ok(!s.includes('Revisa que todas las filas tengan sala y hora'), 'el mensaje genérico escondía los solapes');
  assert.match(s, /error\.code === '23P01'/);
  assert.match(s, /from\('tipos_clase'\)\.delete\(\)/, 'si falla el insert de sesiones, el tipo recién creado sin clases se borra');
});

test('clases/import: la guardia de permiso sigue ANTES de crear tipos (contrato heredado)', () => {
  const s = leer('app/api/clases/import/route.ts');
  assert.ok(s.indexOf('puedeGestionarSede(sesion.rol)') < s.indexOf(".from('tipos_clase').insert("));
});

test('suscripciones/import: pide la validez de la tarifa y calcula el ciclo con la regla de las ventas', () => {
  const s = leer('app/api/suscripciones/import/route.ts');
  assert.match(s, /select\('id, nombre, tipo, sesiones, validez_dias'\)/);
  assert.match(s, /cicloDeMembresiaImportada\(/);
  assert.match(s, /hoyEnEstudio\(\)/, 'hoy es el del estudio (Madrid), no el de UTC');
  assert.ok(!/new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/.test(s.slice(s.indexOf('const hoy'), s.indexOf('const hoy') + 120)));
});

test('reservas/import: el aviso de sobreaforo cuenta solo lo que toca el archivo y separa futuras de pasadas', () => {
  const s = leer('app/api/reservas/import/route.ts');
  assert.match(s, /resumirSobreAforo\(/);
  assert.match(s, /necesitaConfirmacion: 'aforo'/, 'sin OK no se escribe: contesta 409 con el detalle');
  assert.match(s, /aforo === 'ampliar'/, 'solo con el OK se amplía el aforo');
  assert.ok(s.indexOf("necesitaConfirmacion: 'aforo'") < s.indexOf("from('reservas').insert"), 'el aviso va ANTES de escribir');
  assert.ok(!s.includes('[...sesionPorClave.values()].find('), 'el find dentro del bucle era O(n·m)');
});
