import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canceladasCompensables, derechoDeRecuperaciones, llegoAOcuparPlaza } from './derecho-semanal.ts';

// «No voy» a su clase fija del lunes y, después, la vuelve a reservar desde la
// ficha: va a esa clase. Con una cuota de 2 a la semana y solo esa clase,
// `derechoDeRecuperaciones(2, 1, 1)` daría 1 — una recuperación por una clase a
// la que fue. La cancelación de una sesión a la que volvió no se compensa.
test('la cancelación de una clase a la que volvió a apuntarse no se compensa', () => {
  const suyas = [
    { id: 'res-pf-lunes', sesion_id: 'ses-lunes', estado: 'CANCELADA' },
    { id: 'res-a-mano', sesion_id: 'ses-lunes', estado: 'CONFIRMADA' },
    { id: 'res-pf-jueves', sesion_id: 'ses-jueves', estado: 'CANCELADA' },
  ];
  const canceladas = suyas.filter((r) => r.estado === 'CANCELADA');
  assert.deepEqual(canceladasCompensables(canceladas, suyas).map((r) => r.id), ['res-pf-jueves']);
  // Fue (o faltó sin avisar): también cuenta como que volvió.
  for (const estado of ['ASISTIDA', 'NO_ASISTIO']) {
    assert.deepEqual(canceladasCompensables(canceladas, [...canceladas, { id: 'x', sesion_id: 'ses-jueves', estado }]).map((r) => r.id), ['res-pf-lunes']);
  }
  // Volver a la lista de espera no es ir: esa sí se compensa.
  assert.equal(canceladasCompensables(canceladas, [...canceladas, { id: 'y', sesion_id: 'ses-jueves', estado: 'LISTA_ESPERA' }]).length, 2);
});

// «No voy» a la del lunes, vuelve a reservarla (la pantalla lo invita) y la cancela
// otra vez, a tiempo: con una cuota de 2 y nada más esa semana, `usadas` = 0 y
// salían dos cancelaciones de la MISMA clase → dos recuperaciones por una clase.
test('cancelar → volver a reservar → cancelar la misma clase es UNA clase perdida (la primera)', () => {
  const suyas = [
    { id: 'res-x', sesion_id: 'ses-lunes', estado: 'CANCELADA', creado_en: '2026-10-03T10:00:00Z', bono_consumo_rastreado: true, bono_decidido_en: '2026-10-03T10:00:00Z' },
    { id: 'res-pf-lunes', sesion_id: 'ses-lunes', estado: 'CANCELADA', creado_en: '2026-09-01T00:00:00Z' },
  ];
  const compensables = canceladasCompensables(suyas, suyas);
  assert.deepEqual(compensables.map((r) => r.id), ['res-pf-lunes']);
  assert.equal(derechoDeRecuperaciones(2, 0, compensables.length), 1);
});

// Salir de la lista de espera, una oferta rechazada o caducada, o una reserva que el
// estudio no aprobó: acaban en CANCELADA a tiempo, pero nunca tuvo plaza.
test('una cancelación que nunca tuvo plaza no se compensa; una que subió de la lista y luego canceló, sí', () => {
  const espera = { id: 'res-espera', sesion_id: 'ses-mie', estado: 'CANCELADA', creado_en: '2026-10-01T09:00:00Z', bono_consumo_rastreado: true, bono_decidido_en: null };
  assert.equal(llegoAOcuparPlaza(espera), false, 'en espera (u oferta, o pendiente de aprobar) nunca se decidió su cobro');
  assert.deepEqual(canceladasCompensables([espera], [espera]), []);
  // Subió de la lista (la promoción decide el cobro y lo marca), y después canceló a tiempo.
  const subio = { ...espera, id: 'res-subio', bono_decidido_en: '2026-10-02T08:00:00Z' };
  assert.equal(llegoAOcuparPlaza(subio), true);
  assert.deepEqual(canceladasCompensables([subio], [subio]).map((r) => r.id), ['res-subio']);
  // Lo que no se puede saber, como antes: su clase fija (nace confirmada) y las no rastreadas.
  assert.equal(llegoAOcuparPlaza({ id: 'res-pf-1', sesion_id: 's', estado: 'CANCELADA', bono_consumo_rastreado: false, bono_decidido_en: null }), true);
  assert.equal(llegoAOcuparPlaza({ id: 'res-legada', sesion_id: 's', estado: 'CANCELADA', bono_consumo_rastreado: null, bono_decidido_en: null }), true);
  // Primero en espera y luego con plaza en la misma clase: cuenta la que tuvo plaza.
  const conPlaza = { ...espera, id: 'res-luego', creado_en: '2026-10-02T09:00:00Z', bono_decidido_en: '2026-10-02T09:00:00Z' };
  assert.deepEqual(canceladasCompensables([conPlaza, espera], [espera, conPlaza]).map((r) => r.id), ['res-luego']);
});

test('el barrido semanal pasa sus cancelaciones por `canceladasCompensables`', async () => {
  const { readFileSync } = await import('node:fs');
  const codigo = readFileSync(new URL('./otorgar-semanales.ts', import.meta.url), 'utf8');
  assert.match(codigo, /const canceladas = canceladasCompensables\(suyas/);
  // Con las columnas que dicen si tuvo plaza (sin ellas, toda rastreada parecería «sin plaza»… o al revés).
  assert.match(codigo, /select\('[^']*bono_consumo_rastreado, bono_decidido_en'\)/);
});

// El caso que da nombre a la funcionalidad: 2 por semana, cancela una a tiempo
// y ya no le cabe otra → recupera una.
test('canceló a tiempo y no llegó a recuperar el hueco → 1', () => {
  assert.equal(derechoDeRecuperaciones(2, 1, 1), 1);
});

// ⚠️ El caso que impide regalar clases: canceló, PERO volvió a reservar y
// llenó su semana. No perdió nada.
test('canceló pero volvió a llenar la semana → 0', () => {
  assert.equal(derechoDeRecuperaciones(2, 2, 1), 0);
});

test('sin cancelar nada no se otorga nada, por muchos huecos libres que deje', () => {
  assert.equal(derechoDeRecuperaciones(3, 0, 0), 0);
});

// Dejó 2 huecos pero solo canceló 1: el otro lo dejó libre ella.
test('nunca más recuperaciones que cancelaciones', () => {
  assert.equal(derechoDeRecuperaciones(3, 1, 1), 1);
});

// Y al revés: canceló 3 veces pero solo le quedaba 1 hueco por llenar.
test('nunca más recuperaciones que huecos sin usar', () => {
  assert.equal(derechoDeRecuperaciones(2, 1, 3), 1);
});

test('sin límite semanal no hay nada que recuperar', () => {
  assert.equal(derechoDeRecuperaciones(0, 0, 5), 0);
});

// Puede pasar: reservó de más con una recuperación previa y encima canceló.
test('usadas por encima del límite no da negativo', () => {
  assert.equal(derechoDeRecuperaciones(2, 3, 1), 0);
});

// ── semanaCerrada ─────────────────────────────────────────────────────────────
// El barrido corre el lunes y reparte por la semana que ACABA de cerrarse, no
// por la que empieza. Equivocarse aquí reparte por una semana a medias.
import { semanaCerrada } from './otorgar-semanales-fechas.ts';

test('un lunes reparte por la semana anterior completa', () => {
  // 2026-09-07 es lunes.
  assert.deepEqual(semanaCerrada(new Date('2026-09-07T06:00:00Z')),
    { desde: '2026-08-31', hasta: '2026-09-06' });
});

test('da igual el día en que corra: siempre la semana anterior', () => {
  // Miércoles 9 → sigue siendo la semana del 31 al 6.
  assert.deepEqual(semanaCerrada(new Date('2026-09-09T23:00:00Z')),
    { desde: '2026-08-31', hasta: '2026-09-06' });
});

test('un domingo sigue mirando la semana anterior, no la que está acabando', () => {
  // 2026-09-06 es domingo: la semana en curso es la del 31, así que cierra la del 24.
  assert.deepEqual(semanaCerrada(new Date('2026-09-06T22:00:00Z')),
    { desde: '2026-08-24', hasta: '2026-08-30' });
});

test('la ventana es de 7 días, lunes a domingo', () => {
  const { desde, hasta } = semanaCerrada(new Date('2026-01-05T10:00:00Z'));
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  assert.equal(dias, 6);
  assert.equal(new Date(desde + 'T00:00:00Z').getUTCDay(), 1, 'desde debe ser lunes');
  assert.equal(new Date(hasta + 'T00:00:00Z').getUTCDay(), 0, 'hasta debe ser domingo');
});
