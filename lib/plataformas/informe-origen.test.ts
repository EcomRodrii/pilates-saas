import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvDeFilas, filasCsvPorOrigen, resumenPorPlataforma, type ReservaInforme, type SesionInforme } from './informe-origen.ts';

const SESIONES: SesionInforme[] = [
  { id: 's1', inicio: '2026-10-02T09:00:00Z', tipoClaseId: 'tc-r' },
  { id: 's2', inicio: '2026-10-05T18:00:00Z', tipoClaseId: 'tc-m' },
  { id: 's-fuera', inicio: '2026-11-20T09:00:00Z', tipoClaseId: 'tc-r' },
  { id: 's-cancelada', inicio: '2026-10-03T09:00:00Z', cancelada: true },
];
const RESERVAS: ReservaInforme[] = [
  { id: 'a', sesionId: 's1', estado: 'ASISTIDA', origen: 'CLASSPASS', nombreExterno: 'Ana; G.' },
  { id: 'b', sesionId: 's1', estado: 'NO_ASISTIO', origen: 'CLASSPASS', nombreExterno: 'Eva' },
  { id: 'c', sesionId: 's2', estado: 'ASISTIDA', origen: 'URBAN_SPORTS_CLUB', nombreExterno: 'Luis' },
  { id: 'd', sesionId: 's2', estado: 'CANCELADA', origen: 'CLASSPASS', nombreExterno: 'Sara' },
  { id: 'socia', sesionId: 's1', estado: 'ASISTIDA', origen: 'TENTARE' },
  { id: 'fuera', sesionId: 's-fuera', estado: 'ASISTIDA', origen: 'CLASSPASS', nombreExterno: 'X' },
  { id: 'cancelada', sesionId: 's-cancelada', estado: 'ASISTIDA', origen: 'CLASSPASS', nombreExterno: 'Y' },
];
const DESDE = new Date('2026-10-01T00:00:00Z');
const HASTA = new Date('2026-10-31T23:59:59Z');

test('cuenta por plataforma solo lo del periodo, sin las socias ni las clases canceladas', () => {
  assert.deepEqual(resumenPorPlataforma(RESERVAS, SESIONES, DESDE, HASTA), [
    { plataforma: 'CLASSPASS', vinieron: 1, noVinieron: 1, pendientes: 0, canceladas: 1 },
    { plataforma: 'URBAN_SPORTS_CLUB', vinieron: 1, noVinieron: 0, pendientes: 0, canceladas: 0 },
  ]);
});

test('sin reservas de plataformas no hay filas', () => {
  assert.deepEqual(resumenPorPlataforma([RESERVAS[4]], SESIONES, DESDE, HASTA), []);
});

test('el detalle sale ordenado por fecha, legible y con el CSV bien escapado', () => {
  const filas = filasCsvPorOrigen(RESERVAS, SESIONES, DESDE, HASTA, id => (id === 'tc-r' ? 'Reformer' : 'Mat'), iso => iso.slice(0, 10));
  assert.deepEqual(filas.map(f => [f.fecha, f.persona, f.estado]), [
    ['2026-10-02', 'Ana; G.', 'Vino'], ['2026-10-02', 'Eva', 'No vino'],
    ['2026-10-05', 'Luis', 'Vino'], ['2026-10-05', 'Sara', 'Cancelada'],
  ]);
  const csv = csvDeFilas(filas).split('\n');
  assert.equal(csv[0], 'Fecha;Clase;Persona;Plataforma;Estado');
  assert.equal(csv[1], '2026-10-02;Reformer;"Ana; G.";ClassPass;Vino');
  assert.equal(csv[3], '2026-10-05;Mat;Luis;Urban Sports Club;Vino');
});
