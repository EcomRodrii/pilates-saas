import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mandaLaRuta, repartirDestino } from './navegacion.ts';

// ⚠️ Regresión de un fallo que llegó a producción. El portal manda destinos
// completos; el marco de Next solo sabe de rutas. Todo lo que no era pantalla
// se perdía, y el síntoma que vio el fundador fue "pulso el día 7 y no me
// aparecen mis clases" — sí existían en la base de datos.

test('pulsar un día conserva el día, no solo la pantalla', () => {
  const { screen, estado } = repartirDestino({ screen: 'clases', tab: 'clases', day: 7 });
  assert.equal(screen, 'clases');
  assert.deepEqual(estado, { tab: 'clases', day: 7 });
});

test('abrir una clase conserva el id de la clase', () => {
  const { screen, estado } = repartirDestino({ screen: 'detalle', classId: 'ses-abc' });
  assert.equal(screen, 'detalle');
  assert.deepEqual(estado, { classId: 'ses-abc' });
});

test('un cambio de pantalla a secas no arrastra estado', () => {
  // Sin esto, cada pulsación de la barra inferior escribiría en el estado y
  // provocaría un render de más para no cambiar nada.
  const { screen, estado } = repartirDestino({ screen: 'perfil' });
  assert.equal(screen, 'perfil');
  assert.equal(estado, null);
});

test('una clave presente pero undefined no pisa lo que ya había', () => {
  // `openClass` manda `classId: id || elDeAntes`; si algún camino mandara
  // `undefined`, borrar el día o la clase seleccionada sería peor que no hacer
  // nada.
  const { estado } = repartirDestino({ screen: 'clases', day: undefined, classId: undefined });
  assert.equal(estado, null);
});

test('conserva el día aunque valga 0 (no confundir vacío con falsy)', () => {
  const { estado } = repartirDestino({ screen: 'clases', day: 0 });
  assert.deepEqual(estado, { day: 0 });
});

// ── Quién manda la pantalla ─────────────────────────────────────────────────

const SIN_RUTA = ['detalle', 'confirmada'] as const;

test('estando en una sección, manda la ruta', () => {
  assert.equal(mandaLaRuta('clases', SIN_RUTA), true);
});

test('con el detalle de una clase abierto, manda el estado', () => {
  // ⚠️ Si esto devolviera `true`, el detalle se cerraría en el mismo render en
  // el que se abre y NO SE PODRÍA RESERVAR: es la única pantalla con el botón.
  assert.equal(mandaLaRuta('detalle', SIN_RUTA), false);
});

test('sin lista, manda la ruta (la previsualización de temas)', () => {
  assert.equal(mandaLaRuta('detalle', undefined), true);
});

// ⚠️ EL bug que tumbó el portal entero. `welcome` es el estado inicial del
// store y no la pinta el portal real: si bloqueara la ruta, el portal se
// quedaría congelado ahí desde el primer render — sin barra de pestañas y sin
// responder a nada—, pintando el Inicio solo por el fallback del marco.
test('la pantalla inicial del store NO bloquea la ruta', () => {
  assert.equal(mandaLaRuta('welcome', SIN_RUTA), true);
});

// Una pantalla que este kit no pinta tampoco puede secuestrar la navegación.
test('una pantalla desconocida deja mandar a la ruta', () => {
  assert.equal(mandaLaRuta('lo-que-sea', SIN_RUTA as readonly string[]), true);
});
