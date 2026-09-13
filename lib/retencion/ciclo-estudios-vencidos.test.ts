import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_AVISO_CONSERVACION, DIAS_AVISO_FINAL, DIAS_PURGA,
  asuntoAvisoEstudioVencido, copiaSuspendidaPorVencimiento, debeRecalcularInforme, enCicloDeVencido,
  fechasCiclo, formatearFechaAviso, mismaAncla, purgaEstudiosActiva, siguientePaso,
  type EstudioCiclo, type FaseRegistrada,
} from './ciclo-estudios-vencidos.ts';

const MS_DIA = 86_400_000;
const FIN = new Date('2026-08-26T18:40:32Z');
const dia = (n: number) => new Date(FIN.getTime() + n * MS_DIA);
const vencido: EstudioCiclo = { trialEndsAt: FIN.toISOString(), subscriptionStatus: 'trial_expirado', subscriptionId: null };
const hecha = (fase: FaseRegistrada['fase'], n: number): FaseRegistrada => ({ fase, ejecutadaEn: dia(n), canceladaEn: null });

test('plazos: 30 / 83 / 90 días (⚠️ legal, cambiar aquí rompe este test a propósito)', () => {
  assert.deepEqual([DIAS_AVISO_CONSERVACION, DIAS_AVISO_FINAL, DIAS_PURGA], [30, 83, 90]);
});

test('enCicloDeVencido: solo la prueba LOCAL agotada con fecha', () => {
  assert.equal(enCicloDeVencido(vencido), true);
  assert.equal(enCicloDeVencido({ ...vencido, subscriptionStatus: 'active' }), false);
  assert.equal(enCicloDeVencido({ ...vencido, subscriptionId: 'sub_123' }), false);
  assert.equal(enCicloDeVencido({ ...vencido, trialEndsAt: null }), false);
  assert.equal(enCicloDeVencido({ ...vencido, trialEndsAt: 'no-es-fecha' }), false);
});

test('copiaSuspendidaPorVencimiento: a partir del día 30 exacto, y nunca si paga', () => {
  assert.equal(copiaSuspendidaPorVencimiento(vencido, new Date(dia(30).getTime() - 1)), false);
  assert.equal(copiaSuspendidaPorVencimiento(vencido, dia(30)), true);
  assert.equal(copiaSuspendidaPorVencimiento({ ...vencido, subscriptionStatus: 'active' }, dia(60)), false);
});

test('siguientePaso: antes del día 30 no hace nada', () => {
  assert.deepEqual(siguientePaso(vencido, [], dia(29)), { tipo: 'nada' });
});

test('siguientePaso: día 30 → aviso_30, prometiendo el borrado para el día 90', () => {
  const p = siguientePaso(vencido, [], dia(30));
  assert.equal(p.tipo, 'ejecutar');
  if (p.tipo !== 'ejecutar') return;
  assert.equal(p.fase, 'aviso_30');
  assert.equal(p.programadaPara.getTime(), dia(30).getTime());
  assert.equal(p.fechaPurga.getTime(), dia(90).getTime());
});

test('siguientePaso: con aviso_30 hecho, espera al 83 para el último aviso', () => {
  assert.deepEqual(siguientePaso(vencido, [hecha('aviso_30', 30)], dia(60)), { tipo: 'nada' });
  const p = siguientePaso(vencido, [hecha('aviso_30', 30)], dia(83));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'aviso_final');
});

test('siguientePaso: con los dos avisos, la purga llega el día 90', () => {
  const reg = [hecha('aviso_30', 30), hecha('aviso_final', 83)];
  assert.deepEqual(siguientePaso(vencido, reg, dia(89)), { tipo: 'nada' });
  const p = siguientePaso(vencido, reg, dia(90));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'purga');
});

test('siguientePaso: NUNCA se salta un aviso — día 100 sin nada hecho → aviso_30, no purga', () => {
  const p = siguientePaso(vencido, [], dia(100));
  assert.equal(p.tipo, 'ejecutar');
  if (p.tipo !== 'ejecutar') return;
  assert.equal(p.fase, 'aviso_30');
  // 53 días hasta el último aviso + 7 hasta el borrado, contados desde HOY.
  assert.equal(p.fechaPurga.getTime(), dia(160).getTime());
});

test('siguientePaso: un aviso que sale tarde corre los pasos siguientes', () => {
  // aviso_30 enviado el día 80 → último aviso no antes del 133.
  assert.deepEqual(siguientePaso(vencido, [hecha('aviso_30', 80)], dia(100)), { tipo: 'nada' });
  assert.equal(fechasCiclo(FIN, [hecha('aviso_30', 80)]).avisoFinal.getTime(), dia(133).getTime());
  // aviso_final enviado el día 88 → borrado no antes del 95.
  const reg = [hecha('aviso_30', 30), hecha('aviso_final', 88)];
  assert.deepEqual(siguientePaso(vencido, reg, dia(94)), { tipo: 'nada' });
  assert.equal(siguientePaso(vencido, reg, dia(95)).tipo, 'ejecutar');
});

test('siguientePaso: la purga en modo informe (fila sin ejecutada_en) sigue pendiente', () => {
  const reg: FaseRegistrada[] = [hecha('aviso_30', 30), hecha('aviso_final', 83), { fase: 'purga', ejecutadaEn: null, canceladaEn: null }];
  const p = siguientePaso(vencido, reg, dia(120));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'purga');
});

test('siguientePaso: ya purgado → nada, pase lo que pase después', () => {
  const reg = [hecha('aviso_30', 30), hecha('aviso_final', 83), hecha('purga', 90)];
  assert.deepEqual(siguientePaso(vencido, reg, dia(200)), { tipo: 'nada' });
  assert.deepEqual(siguientePaso({ ...vencido, subscriptionStatus: 'active' }, reg, dia(200)), { tipo: 'nada' });
});

test('siguientePaso: si paga en medio del ciclo, se cancela; sin filas vivas no hay nada que cancelar', () => {
  const pagado = { ...vencido, subscriptionStatus: 'active', subscriptionId: 'sub_1' };
  assert.deepEqual(siguientePaso(pagado, [hecha('aviso_30', 30)], dia(40)), { tipo: 'cancelar' });
  assert.deepEqual(siguientePaso(pagado, [], dia(40)), { tipo: 'nada' });
  assert.deepEqual(siguientePaso(pagado, [{ ...hecha('aviso_30', 30), canceladaEn: dia(35) }], dia(40)), { tipo: 'nada' });
});

test('siguientePaso: las filas canceladas no cuentan como aviso enviado', () => {
  const reg = [{ ...hecha('aviso_30', 30), canceladaEn: dia(31) }];
  const p = siguientePaso(vencido, reg, dia(84));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'aviso_30');
});

test('debeRecalcularInforme: una vez cada 23 h como mucho', () => {
  const t = new Date('2026-09-13T10:00:00Z');
  assert.equal(debeRecalcularInforme(null, t), true);
  assert.equal(debeRecalcularInforme(new Date(t.getTime() - 22 * 3_600_000), t), false);
  assert.equal(debeRecalcularInforme(new Date(t.getTime() - 23 * 3_600_000), t), true);
});

test('purgaEstudiosActiva: solo el valor exacto "activa" enciende el borrado real', () => {
  assert.equal(purgaEstudiosActiva({ PURGA_ESTUDIOS_VENCIDOS: 'activa' }), true);
  assert.equal(purgaEstudiosActiva({ PURGA_ESTUDIOS_VENCIDOS: ' activa ' }), true);
  assert.equal(purgaEstudiosActiva({ PURGA_ESTUDIOS_VENCIDOS: 'true' }), false);
  assert.equal(purgaEstudiosActiva({ PURGA_ESTUDIOS_VENCIDOS: '1' }), false);
  assert.equal(purgaEstudiosActiva({}), false);
});

test('mismaAncla: compara instantes, no el formato de la cadena', () => {
  assert.equal(mismaAncla('2026-08-26T18:40:32+00:00', '2026-08-26T18:40:32.000Z'), true);
  assert.equal(mismaAncla('2026-08-26T18:40:32Z', '2026-08-26T18:40:33Z'), false);
  assert.equal(mismaAncla(null, '2026-08-26T18:40:32Z'), false);
});

test('formatearFechaAviso y asunto: fecha en español y hora de España', () => {
  assert.equal(formatearFechaAviso(dia(90)), '24 de noviembre de 2026');
  // 23:30 UTC del 31-dic ya es 1-ene en Madrid.
  assert.equal(formatearFechaAviso(new Date('2026-12-31T23:30:00Z')), '1 de enero de 2027');
  assert.match(asuntoAvisoEstudioVencido('aviso_30', dia(90)), /hasta el 24 de noviembre de 2026$/);
  assert.match(asuntoAvisoEstudioVencido('aviso_final', dia(90)), /^Último aviso/);
});
