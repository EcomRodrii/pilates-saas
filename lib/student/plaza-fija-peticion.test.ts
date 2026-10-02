import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plazaFijaEnClase, plazaFijaEnFranja, plazaFijaViva, proyectarPlazasFijas, type PeticionPlazaFijaMin, type PlazaFijaMin } from './plaza-fija.ts';

// Plaza fija desde la app: la alumna PIDE (migr 20260915231920). Aquí solo se
// decide qué se le enseña; el servidor vuelve a comprobarlo todo.

// 2026-09-17 es jueves (dow 4).
const CLASE = { id: 'ses-1', fecha: '2026-09-17', hora: '18:00', salaId: 'sala-1' };
const OTRA_SEMANA = { id: 'ses-2', fecha: '2026-09-24', hora: '18:00', salaId: 'sala-1', cancelada: false };
const PLAZA: PlazaFijaMin = {
  id: 'pf-1', diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', tipoClaseId: null,
  vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA',
};
const pide = (over: Partial<PeticionPlazaFijaMin>): PeticionPlazaFijaMin => ({
  id: 'spf-1', tipo: 'CREAR', plazaId: null, diaSemana: 4, horaInicio: '18:00:00', salaId: 'sala-1', desde: null, hasta: null, ...over,
});

test('se ofrece pedir plaza fija solo en una clase que se repite', () => {
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [], []), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [], [], []), { estado: 'NO_SE_REPITE' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [{ ...OTRA_SEMANA, cancelada: true }], [], []), { estado: 'NO_SE_REPITE' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [{ ...OTRA_SEMANA, salaId: 'sala-2' }], [], []), { estado: 'NO_SE_REPITE' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [{ ...OTRA_SEMANA, hora: '19:00' }], [], []), { estado: 'NO_SE_REPITE' });
});

test('no se ofrece si ya la tiene (también en pausa) o ya la ha pedido', () => {
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [PLAZA], []), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [{ ...PLAZA, estado: 'PAUSADA' }], []), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [{ ...PLAZA, estado: 'BAJA' }], []), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [], [pide({})]), { estado: 'PEDIDA', peticionId: 'spf-1' });
  // Una pausa pedida no es una plaza pedida.
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [], [pide({ tipo: 'PAUSAR', plazaId: 'pf-9' })]), { estado: 'PUEDE_PEDIR' });
});

// `plazaFijaEnFranja`: lo mismo que `plazaFijaEnClase`, pero para una franja del
// horario general («Clases fijas disponibles», sin oferta con nombre) — no
// comprueba «repite» porque quien llama ya sabe que sí (sale de `construirHorario`).
const FRANJA = { diaSemana: 4, hora: '18:00', salaId: 'sala-1' };

test('sin cuota, se dice por qué; con cuota, se puede pedir', () => {
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [], [], false), { estado: 'SOLO_CON_CUOTA' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [], [], true), { estado: 'PUEDE_PEDIR' });
});

test('ya la tiene (también en pausa) o ya la ha pedido: no se ofrece', () => {
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [PLAZA], []), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [{ ...PLAZA, estado: 'PAUSADA' }], []), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [{ ...PLAZA, estado: 'BAJA' }], []), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [], [pide({})]), { estado: 'PEDIDA', peticionId: 'spf-1' });
});

test('una plaza o petición de OTRO hueco no la tapa', () => {
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [{ ...PLAZA, salaId: 'sala-2' }], []), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [], [pide({ horaInicio: '19:00' })]), { estado: 'PUEDE_PEDIR' });
});

test('la pausa que ha pedido se pega a SU plaza, no a otra', () => {
  const pausa = pide({ tipo: 'PAUSAR', plazaId: 'pf-1', diaSemana: null, horaInicio: null, salaId: null, desde: '2026-10-01', hasta: '2026-10-15' });
  const [conPausa] = proyectarPlazasFijas([PLAZA], '2026-09-16', '10:00', undefined, [pausa]);
  assert.equal(conPausa.id, 'pf-1');
  assert.deepEqual(conPausa.pausaPedida, { id: 'spf-1', desde: '2026-10-01', hasta: '2026-10-15' });
  const [otra] = proyectarPlazasFijas([{ ...PLAZA, id: 'pf-2' }], '2026-09-16', '10:00', undefined, [pausa]);
  assert.equal(otra.pausaPedida, null);
});

// ─── Una plaza fija cuya fecha «hasta» ya pasó no es suya: la ficha no puede decir «Ya es tu clase fija» ─────────────
const HOY = '2026-10-02';

test('plazaFijaViva: baja no; vencida no (si se sabe «hoy»); vale hasta el final de su último día', () => {
  assert.equal(plazaFijaViva({ estado: 'BAJA', vigenciaHasta: null }, HOY), false);
  assert.equal(plazaFijaViva({ estado: 'ACTIVA', vigenciaHasta: null }, HOY), true, 'sin fecha no vence');
  assert.equal(plazaFijaViva({ estado: 'ACTIVA', vigenciaHasta: '2026-10-02' }, HOY), true, 'el último día aún vale');
  assert.equal(plazaFijaViva({ estado: 'ACTIVA', vigenciaHasta: '2026-10-01' }, HOY), false);
  assert.equal(plazaFijaViva({ estado: 'PAUSADA', vigenciaHasta: '2026-09-30' }, HOY), false, 'una en pausa también vence');
  assert.equal(plazaFijaViva({ estado: 'ACTIVA', vigenciaHasta: '2026-09-30' }), true, 'sin «hoy» no se mira la fecha: nada cambia para quien aún no la pasa');
});

test('⚠️ la ficha de la clase: una plaza vencida deja volver a pedirla, una vigente sigue siendo suya', () => {
  const vencida: PlazaFijaMin = { ...PLAZA, vigenciaHasta: '2026-09-30' };
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [vencida], [], true, HOY), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [{ ...PLAZA, vigenciaHasta: '2026-10-02' }], [], true, HOY), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [vencida], [], true), { estado: 'TIENE_PLAZA' }, 'sin «hoy», como antes');
  // Y si ya la ha vuelto a pedir, se ve como pedida (no como suya ni como pidiéndola de nuevo).
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [vencida], [pide({})], true, HOY), { estado: 'PEDIDA', peticionId: 'spf-1' });
});

test('⚠️ la franja del horario: igual que la ficha', () => {
  const FRANJA = { diaSemana: 4, hora: '18:00', salaId: 'sala-1' };
  const vencida: PlazaFijaMin = { ...PLAZA, vigenciaHasta: '2026-09-30' };
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [vencida], [], true, HOY), { estado: 'PUEDE_PEDIR' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [vencida], [], false, HOY), { estado: 'SOLO_CON_CUOTA' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [PLAZA], [], true, HOY), { estado: 'TIENE_PLAZA' });
  assert.deepEqual(plazaFijaEnFranja(FRANJA, [vencida], [], true), { estado: 'TIENE_PLAZA' }, 'sin «hoy», como antes');
});

test('la ficha y la lista «Mis clases» dicen lo mismo de una plaza vencida', () => {
  // `proyectarPlazasFijas` ya la descartaba; ahora la ficha de la clase también.
  const vencida: PlazaFijaMin = { ...PLAZA, vigenciaHasta: '2026-09-30' };
  assert.deepEqual(proyectarPlazasFijas([vencida], HOY), []);
  assert.deepEqual(plazaFijaEnClase(CLASE, [OTRA_SEMANA], [vencida], [], true, HOY), { estado: 'PUEDE_PEDIR' });
});
