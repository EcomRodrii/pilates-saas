import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PlanTarifa, Suscripcion } from '../types.ts';
import { DIAS_CADUCAN_PRONTO, bonoPorCaducar, estadoDeLosBonos } from './bonos.ts';

const HOY = '2026-10-15';
const plan = (id: string, tipo: PlanTarifa['tipo'], sesiones: number | null): PlanTarifa =>
  ({ id, nombre: id, tipo, sesiones, precio: 0, activo: true } as unknown as PlanTarifa);
const sus = (id: string, socioId: string, planId: string, sesionesRestantes: number | null, fechaFin: string | null, estado = 'ACTIVA'): Suscripcion =>
  ({ id, socioId, planId, estado, sesionesRestantes, fechaFin, fechaInicio: '2026-09-01' } as unknown as Suscripcion);

const PLANES = [plan('bono10', 'BONO', 10), plan('suelta', 'PUNTUAL', 1), plan('mensual', 'MENSUAL', null)];

test('«a punto de caducar»: activa, con sesiones y con fin dentro del tramo, los dos extremos incluidos', () => {
  const tramo = { desde: HOY, hasta: '2026-11-14' };
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-10-15'), tramo), true);
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-11-14'), tramo), true);
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-11-15'), tramo), false);
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-10-14'), tramo), false, 'ya caducó');
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 0, '2026-10-20'), tramo), false, 'sin sesiones no se pierde nada');
  assert.equal(bonoPorCaducar(sus('a', 's', 'mensual', null, '2026-10-20'), tramo), false, 'una cuota no tiene sesiones');
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, null), tramo), false, 'sin caducidad');
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-10-20', 'PAUSADA'), tramo), false);
  // Un instante cuenta por su día.
  assert.equal(bonoPorCaducar(sus('a', 's', 'bono10', 3, '2026-11-14T22:00:00+00:00'), tramo), true);
});

test('el estado de los bonos: vivos y sesiones de saldoSesionesBono, y los que caducan en 30 días', () => {
  const e = estadoDeLosBonos([
    sus('b1', 'ana', 'bono10', 6, '2026-12-14'), // vivo, caduca en 60 días
    sus('b2', 'ana', 'suelta', 1, '2026-11-12'), // vivo, caduca en 28 días
    sus('b3', 'eva', 'bono10', 2, '2026-10-20'), // vivo, caduca en 5 días
    sus('b4', 'eva', 'bono10', 4, '2026-10-01'), // caducado: ni vivo ni por caducar
    sus('c1', 'lia', 'mensual', null, '2026-11-01'), // cuota: no es saldo
    sus('b5', 'mar', 'bono10', 0, '2026-12-01'), // agotado pero vigente: cuenta como bono vivo, con 0
  ], PLANES, HOY);
  assert.equal(e.vivos, 4);
  assert.equal(e.sesionesQueQuedan, 6 + 1 + 2 + 0);
  assert.deepEqual(e.caducanPronto.map(b => b.suscripcionId), ['b3', 'b2'], 'el más cercano primero');
  assert.equal(e.sesionesQueCaducan, 3);
  assert.equal(DIAS_CADUCAN_PRONTO, 30);
});

test('sin bonos, todo a cero (y no se inventa nada)', () => {
  const e = estadoDeLosBonos([sus('c1', 'lia', 'mensual', null, '2026-11-01')], PLANES, HOY);
  assert.deepEqual(e, { vivos: 0, sesionesQueQuedan: 0, caducanPronto: [], sesionesQueCaducan: 0 });
});

test('la regla es la de leerBonosPorCaducar: si cambia el filtro SQL, esto falla', () => {
  // El aviso automático y el asistente leen «a punto de caducar» con esta consulta.
  // Informes aplica el mismo filtro en el navegador: las dos tienen que decir lo mismo.
  const src = readFileSync(new URL('../notificaciones/bonos-inactivas-cron.ts', import.meta.url), 'utf8');
  const cuerpo = src.slice(src.indexOf('export async function leerBonosPorCaducar('), src.indexOf('async function bonos('));
  assert.match(cuerpo, /\.eq\('estado', 'ACTIVA'\)/);
  assert.match(cuerpo, /\.not\('sesiones_restantes', 'is', null\)\.gt\('sesiones_restantes', 0\)/);
  assert.match(cuerpo, /\.not\('fecha_fin', 'is', null\)\.gte\('fecha_fin', tramo\.desde\)\.lte\('fecha_fin', tramo\.hasta\)/);
});
