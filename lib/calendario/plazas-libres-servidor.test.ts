import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contarPlazasLibres, IDS_POR_CONSULTA, type LecturasPlazasLibres } from './plazas-libres-servidor.ts';
import type { BloqueoMaquina, PlazaFija } from '../types.ts';

const AHORA = Date.parse('2026-10-13T10:00:00Z');
const P = { desdeIso: '2026-11-01T00:00:00Z', hastaIso: '2026-12-01T00:00:00Z', ahoraMs: AHORA };
const sesion = (id: string, extra: Record<string, unknown> = {}) => ({
  id, inicio: '2026-11-03T17:00:00.000Z', fin: '2026-11-03T17:50:00.000Z', salaId: 'sala-r', tipoClaseId: 'tc', aforoMaximo: 8, cancelada: false, ...extra,
});
const fija = (socioId: string, extra: Partial<PlazaFija> = {}): PlazaFija => ({
  id: `pf-${socioId}`, studioId: 's', socioId, diaSemana: 2, horaInicio: '18:00:00', salaId: 'sala-r', tipoClaseId: null,
  spotId: null, vigenciaDesde: '2026-01-01', vigenciaHasta: null, estado: 'ACTIVA', creadaEn: '2026-01-01T00:00:00Z', ...extra,
});
const averia = (extra: Partial<BloqueoMaquina> = {}): BloqueoMaquina => ({
  id: 'b1', studioId: 's', salaId: 'sala-r', spotId: null, desde: '2026-10-01T00:00:00Z', hasta: null, motivo: null, creadoEn: '2026-10-01T00:00:00Z', ...extra,
});

function lecturas(extra: Partial<LecturasPlazasLibres> = {}, datos?: { sesiones?: ReturnType<typeof sesion>[]; reservas?: { id: string; sesionId: string; socioId: string | null; estado: string }[] }) {
  const llamadas = { apartadas: [] as string[][], retiradas: [] as string[][] };
  const l: LecturasPlazasLibres = {
    rango: async () => ({ sesiones: datos?.sesiones ?? [sesion('a')], reservas: datos?.reservas ?? [] }),
    plazasFijas: async () => [],
    ofertaOcupa: async () => false,
    apartadas: async (ids) => { llamadas.apartadas.push(ids); return []; },
    retiradas: async (ids) => { llamadas.retiradas.push(ids); return []; },
    averias: async () => [],
    ...extra,
  };
  return { l, llamadas };
}

test('falla cerrado: si cualquiera de las lecturas falla, lanza (nunca un número)', async () => {
  const fallos: (keyof LecturasPlazasLibres)[] = ['rango', 'plazasFijas', 'ofertaOcupa', 'apartadas', 'retiradas', 'averias'];
  for (const f of fallos) {
    const { l } = lecturas({ [f]: async () => null } as Partial<LecturasPlazasLibres>);
    await assert.rejects(contarPlazasLibres(l, P), Error, f);
  }
});

test('las apartadas y las retiradas, por trozos de 100 sesiones (PostgREST corta a mil filas)', async () => {
  const sesiones = Array.from({ length: 250 }, (_, i) => sesion(`s${i}`));
  const { l, llamadas } = lecturas({}, { sesiones });
  await contarPlazasLibres(l, P);
  assert.deepEqual(llamadas.apartadas.map(x => x.length), [IDS_POR_CONSULTA, IDS_POR_CONSULTA, 50]);
  assert.deepEqual(llamadas.retiradas.map(x => x.length), [IDS_POR_CONSULTA, IDS_POR_CONSULTA, 50]);
});

test('el aforo es el efectivo: una máquina averiada que solapa la clase resta una plaza; una ya arreglada, no', async () => {
  const conAveria = lecturas({ averias: async () => [averia()] });
  const [h] = (await contarPlazasLibres(conAveria.l, P)).sesiones;
  assert.deepEqual([h.aforo, h.libres], [7, 7]);
  const arreglada = lecturas({ averias: async () => [averia({ hasta: '2026-10-20T00:00:00Z' })] });
  assert.equal((await contarPlazasLibres(arreglada.l, P)).sesiones[0].aforo, 8);
  const otraSala = lecturas({ averias: async () => [averia({ salaId: 'sala-m' })] });
  assert.equal((await contarPlazasLibres(otraSala.l, P)).sesiones[0].aforo, 8);
});

test('una reserva retirada por el sistema (sin cuota, pausa) no cuenta como «ya tiene su fila»: el motor se la vuelve a reservar', async () => {
  const reservas = [{ id: 'r-bea', sesionId: 'a', socioId: 'bea', estado: 'CANCELADA' }];
  const retirada = lecturas({ plazasFijas: async () => [fija('bea')], retiradas: async () => ['r-bea'] }, { reservas });
  assert.equal((await contarPlazasLibres(retirada.l, P)).sesiones[0].fijasPorVenir, 1);
  // La cancelación de ella misma sí: esa semana no se le vuelve a reservar.
  const suya = lecturas({ plazasFijas: async () => [fija('bea')] }, { reservas });
  assert.equal((await contarPlazasLibres(suya.l, P)).sesiones[0].fijasPorVenir, 0);
  // Y con la plaza PAUSADA sin fechas (la pausa antigua retira todas sus reservas): cuenta.
  const pausada = lecturas({ plazasFijas: async () => [fija('bea', { estado: 'PAUSADA' })], retiradas: async () => ['r-bea'] }, { reservas });
  assert.equal((await contarPlazasLibres(pausada.l, P)).sesiones[0].fijasPorVenir, 1);
});

test('devuelve el ajuste de la lista de espera, para que la leyenda diga la verdad en cada estudio', async () => {
  const { l } = lecturas({ ofertaOcupa: async () => true });
  assert.equal((await contarPlazasLibres(l, P)).ofertaOcupa, true);
});
