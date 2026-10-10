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

test('clases/import: las instructoras que faltan se crean tras los solapes, antes de las sesiones, y solo si quien importa gestiona el equipo', () => {
  const s = leer('app/api/clases/import/route.ts');
  const iSolapes = s.indexOf('detectarSolapes(');
  const iInstr = s.indexOf(".from('instructores').insert(");
  const iSesiones = s.indexOf(".from('sesiones').insert(");
  assert.ok(iSolapes > 0 && iInstr > 0 && iSesiones > 0);
  assert.ok(iSolapes < iInstr, 'no se da de alta a nadie que luego se quede sin ninguna clase por un solape');
  assert.ok(iInstr < iSesiones, 'la instructora debe existir antes de las sesiones (FK)');
  assert.match(s, /if \(puedeGestionarEquipo\(sesion\.rol\)\)/, 'dar de alta equipo es de la propietaria o la gerencia');
  assert.match(s, /entidad: 'instructores'/, 'entran en el lote: «Deshacer migración» las borra');
  assert.match(s, /email: null/, 'sin email no se invita a nadie desde un import');
  assert.match(s, /from\('instructores'\)\.delete\(\)/, 'si falla el insert de sesiones, la instructora sin clases se borra');
});

test('deshacer: las instructoras importadas se borran las últimas (la tarifa que se les pone luego no bloquea a mitad)', async () => {
  const { ORDEN_DESHACER } = await import('./batches.ts');
  const i = ORDEN_DESHACER.indexOf('instructores');
  assert.equal(i, ORDEN_DESHACER.length - 1);
  assert.ok(i > ORDEN_DESHACER.indexOf('sesiones'), 'las clases que las usan, fuera antes');
  assert.ok(i > ORDEN_DESHACER.indexOf('citas'));
});

test('clases/import: un marcador de «nadie» en la columna de instructora no crea una instructora', () => {
  const s = leer('app/api/clases/import/route.ts');
  assert.match(s, /esNombreDeInstructora\(nombre\)/);
});

test('los importadores devuelven hasta MAX_ERRORES_DEVUELTOS errores por fila, no 50: el acta los lista', () => {
  for (const r of ['reservas', 'clases', 'citas', 'pagos-historicos']) {
    const s = leer(`app/api/${r}/import/route.ts`);
    assert.ok(!s.includes('errores.slice(0, 50)'), `${r}: el tope de 50 dejaba incidencias sin listar`);
    assert.match(s, /MAX_ERRORES_DEVUELTOS/);
  }
});

test('recuperaciones/import: lo que YA existía es una duplicada, no una incidencia', () => {
  const s = leer('app/api/recuperaciones/import/route.ts');
  assert.match(s, /yaExistian\+\+/);
  assert.ok(!s.includes("'Ya la tenía importada'"), 'reimportar un archivo correcto no puede llenar el acta de incidencias');
  assert.match(s, /duplicadas: tope \+ yaExistian/);
});

test('clases/import: una instructora de nombre de pila se empareja con la única ficha que empieza así, antes de crear', () => {
  const s = leer('app/api/clases/import/route.ts');
  assert.ok(s.indexOf('emparejarPorNombreDePila(') < s.indexOf('nuevasInstructoras.push('));
  assert.match(s, /MAX_INSTRUCTORAS_NUEVAS/);
});
