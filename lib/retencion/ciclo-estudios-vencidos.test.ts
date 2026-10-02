import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_AVISO_CONSERVACION, DIAS_AVISO_FINAL, DIAS_BAJA_AVISO_FINAL, DIAS_BAJA_PURGA, DIAS_PURGA,
  asuntoAvisoEstudioVencido, cicloDelEstudio, copiaSuspendidaPorVencimiento, debeRecalcularInforme, enCicloDeVencido,
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

test('el último aviso no promete un borrado si la purga no está armada', () => {
  // R-1 (60ª pasada): el primer correo de este ciclo sale el 25-sep-2026 a una
  // propietaria real, y `PURGA_ESTUDIOS_VENCIDOS` está apagada. Decirle «se
  // borrarán el X» cuando ese día solo se calcula un informe es una
  // declaración falsa sobre sus datos. El defecto del parámetro es `false`
  // justo para que un llamante que se olvide no vuelva a prometerlo.
  assert.doesNotMatch(asuntoAvisoEstudioVencido('aviso_final', dia(90), false), /se borrarán/);
  assert.match(asuntoAvisoEstudioVencido('aviso_final', dia(90), false), /conservamos/i);
  assert.doesNotMatch(asuntoAvisoEstudioVencido('aviso_final', dia(90)), /se borrarán/);
  // Y con el interruptor puesto, sí lo dice.
  assert.match(asuntoAvisoEstudioVencido('aviso_final', dia(90), true), /se borrarán el 24 de noviembre de 2026$/);
});

// ── Baja de un estudio de pago (contrato de encargo, 2-oct-2026) ──────────────

const BAJA = new Date('2026-10-05T09:00:00Z');
const diaBaja = (n: number) => new Date(BAJA.getTime() + n * MS_DIA);
const deBaja: EstudioCiclo = {
  trialEndsAt: '2026-06-01T00:00:00Z', subscriptionStatus: 'canceled', subscriptionId: 'sub_1',
  contratoTerminadoEn: BAJA.toISOString(),
};
const hechaBaja = (fase: FaseRegistrada['fase'], n: number): FaseRegistrada => ({ fase, ejecutadaEn: diaBaja(n), canceladaEn: null });

test('baja: plazos 0 / 23 / 30 días (⚠️ legal, cambiar aquí rompe este test a propósito)', () => {
  assert.deepEqual([DIAS_BAJA_AVISO_FINAL, DIAS_BAJA_PURGA], [23, 30]);
});

test('baja: el ancla es la fecha que pone la BD, no el estado', () => {
  assert.deepEqual(cicloDelEstudio(deBaja), { motivo: 'baja', ancla: BAJA });
  // Sin fecha no hay baja aunque el estado diga `canceled`: es lo que pasa en
  // una sede cuya cadena sí paga, y el trigger la deja en NULL a propósito.
  assert.equal(cicloDelEstudio({ ...deBaja, contratoTerminadoEn: null }), null);
  assert.equal(cicloDelEstudio({ ...deBaja, subscriptionStatus: 'active', contratoTerminadoEn: null }), null);
  // La prueba vencida sigue siendo su propio ciclo.
  assert.equal(cicloDelEstudio(vencido)?.motivo, 'prueba_vencida');
});

test('baja: el mismo día avisa y para las copias, prometiendo el día 30', () => {
  assert.equal(copiaSuspendidaPorVencimiento(deBaja, new Date(BAJA.getTime() - 1)), false);
  assert.equal(copiaSuspendidaPorVencimiento(deBaja, BAJA), true);
  const p = siguientePaso(deBaja, [], diaBaja(0));
  assert.equal(p.tipo, 'ejecutar');
  if (p.tipo !== 'ejecutar') return;
  assert.equal(p.motivo, 'baja');
  assert.equal(p.fase, 'aviso_baja');
  assert.equal(p.fechaPurga.getTime(), diaBaja(30).getTime());
});

test('baja: último aviso el 23 y purga el 30', () => {
  assert.deepEqual(siguientePaso(deBaja, [hechaBaja('aviso_baja', 0)], diaBaja(22)), { tipo: 'nada' });
  const final = siguientePaso(deBaja, [hechaBaja('aviso_baja', 0)], diaBaja(23));
  assert.equal(final.tipo === 'ejecutar' && final.fase, 'aviso_final');
  const reg = [hechaBaja('aviso_baja', 0), hechaBaja('aviso_final', 23)];
  assert.deepEqual(siguientePaso(deBaja, reg, diaBaja(29)), { tipo: 'nada' });
  const purga = siguientePaso(deBaja, reg, diaBaja(30));
  assert.equal(purga.tipo === 'ejecutar' && purga.fase, 'purga');
});

test('baja: un aviso que sale tarde corre el plazo para descargar', () => {
  // El primer aviso salió el día 5 (Resend caído): sigue habiendo 30 días enteros.
  assert.equal(fechasCiclo(BAJA, [hechaBaja('aviso_baja', 5)], 'baja').purga.getTime(), diaBaja(35).getTime());
  // Nunca se salta el primer aviso aunque ya hayan pasado los 30 días.
  const p = siguientePaso(deBaja, [], diaBaja(40));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'aviso_baja');
});

test('baja: si reactiva el plan, el ciclo se cancela', () => {
  const reactivado = { ...deBaja, subscriptionStatus: 'active', contratoTerminadoEn: null };
  assert.deepEqual(siguientePaso(reactivado, [hechaBaja('aviso_baja', 0)], diaBaja(10)), { tipo: 'cancelar' });
});

test('baja: el asunto dice que hay que descargar, con la fecha', () => {
  assert.match(asuntoAvisoEstudioVencido('aviso_baja', diaBaja(30)), /descarga los datos de tu estudio antes del 4 de noviembre de 2026$/);
  assert.doesNotMatch(asuntoAvisoEstudioVencido('aviso_baja', diaBaja(30), false), /borrar/);
});

test('baja: si la propietaria pide el borrado, va ya, sin esperar a los avisos', () => {
  const pedido = { ...deBaja, supresionPedidaEn: diaBaja(3).toISOString() };
  const p = siguientePaso(pedido, [hechaBaja('aviso_baja', 0)], diaBaja(3));
  assert.equal(p.tipo === 'ejecutar' && p.fase, 'purga');
  // Una vez hecha, nada más.
  assert.deepEqual(siguientePaso(pedido, [hechaBaja('aviso_baja', 0), hechaBaja('purga', 3)], diaBaja(4)), { tipo: 'nada' });
  // En una prueba vencida la petición no existe (la columna solo vale con contrato terminado).
  assert.equal(siguientePaso({ ...vencido, supresionPedidaEn: dia(31).toISOString() }, [], dia(31)).tipo === 'ejecutar'
    && siguientePaso({ ...vencido, supresionPedidaEn: dia(31).toISOString() }, [], dia(31)).fase, 'aviso_30');
});
