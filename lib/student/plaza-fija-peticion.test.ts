import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plazaFijaEnClase, proyectarPlazasFijas, type PeticionPlazaFijaMin, type PlazaFijaMin } from './plaza-fija.ts';

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

test('la pausa que ha pedido se pega a SU plaza, no a otra', () => {
  const pausa = pide({ tipo: 'PAUSAR', plazaId: 'pf-1', diaSemana: null, horaInicio: null, salaId: null, desde: '2026-10-01', hasta: '2026-10-15' });
  const [conPausa] = proyectarPlazasFijas([PLAZA], '2026-09-16', '10:00', undefined, [pausa]);
  assert.equal(conPausa.id, 'pf-1');
  assert.deepEqual(conPausa.pausaPedida, { id: 'spf-1', desde: '2026-10-01', hasta: '2026-10-15' });
  const [otra] = proyectarPlazasFijas([{ ...PLAZA, id: 'pf-2' }], '2026-09-16', '10:00', undefined, [pausa]);
  assert.equal(otra.pausaPedida, null);
});
