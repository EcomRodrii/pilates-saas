import test from 'node:test';
import assert from 'node:assert/strict';
import { comoVieneSinBono, notaSinBono } from './como-se-paga.ts';
import { sinBonoDeClase } from './como-viene-sin-bono.ts';
import { proyectarClases, type PayloadMin } from './mapeo.ts';
import type { PlanTarifa } from '../types.ts';

// P01 (6-oct-2026): sin nada que cubra la clase, la hoja sabe ANTES de pulsar
// cuál de los cuatro casos es. Antes ofrecía «Confirmar · 15 €», el servidor
// contestaba «Necesitas un plan o bono» y la mandaba a Perfil → Comprar.

const base = { pagosOnline: true, desde: 15, precioEspecial: false, importeEnEstudio: 15 };

test('matriz: exige plan × pagos online × algo a la venta', () => {
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: true }), { caso: 'PAGA_AQUI', desde: 15 });
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: true, pagosOnline: false }), { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' });
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: true, desde: null }), { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'nada-a-la-venta' });
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: true, precioEspecial: true }), { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'precio-especial' });
  // Sin exigir plan: se reserva y se paga en el estudio (lo que cobra el mostrador), o sin pagar si no hay precio.
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: false }), { caso: 'PAGA_EN_ESTUDIO', importe: 15 });
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: false, pagosOnline: false }), { caso: 'PAGA_EN_ESTUDIO', importe: 15 });
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: false, importeEnEstudio: null }), { caso: 'RESERVA_SIN_PAGAR' });
  // Sin saber el ajuste no se inventa un muro: decide el servidor.
  assert.deepEqual(comoVieneSinBono({ ...base, exigePlan: null }), { caso: 'RESERVA_SIN_PAGAR' });
});

test('la nota de cada caso: muro, coste o la de siempre', () => {
  assert.equal(notaSinBono({ caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' }, false)?.texto,
    'Para esta clase necesitas un bono. Este estudio no vende online: pídelo en recepción.');
  assert.equal(notaSinBono({ caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' }, false)?.tono, 'bloqueo');
  assert.match(notaSinBono({ caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' }, true)!.texto, /^Tu bono no incluye este tipo de clase\./);
  assert.match(notaSinBono({ caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'precio-especial' }, false)!.texto, /precio especial/);
  assert.equal(notaSinBono({ caso: 'PAGA_EN_ESTUDIO', importe: 15 }, false)?.texto, 'Pagas 15 € en el estudio, el día de la clase.');
  assert.match(notaSinBono({ caso: 'PAGA_AQUI', desde: 12 }, false)!.texto, /desde 12 €/);
  assert.equal(notaSinBono({ caso: 'RESERVA_SIN_PAGAR' }, false), null);
});

const SUELTA = { id: 'suelta', studioId: 'st', nombre: 'Clase suelta', tipo: 'PUNTUAL', sesiones: 1, precio: 15, activo: true } as PlanTarifa;
const BONO = { id: 'bono8', studioId: 'st', nombre: 'Bono 8', tipo: 'BONO', sesiones: 8, precio: 96, activo: true } as PlanTarifa;
const PRUEBA = { id: 'prueba', studioId: 'st', nombre: 'Prueba', tipo: 'PUNTUAL', sesiones: 1, precio: 5, activo: true, esPrueba: true } as PlanTarifa;

function payload(o: { exigeEstudio?: boolean | null; exigeTipo?: boolean | null; planes?: PlanTarifa[]; precioPuntual?: number | null }): PayloadMin {
  return {
    studio: { reservaExigirPlan: o.exigeEstudio },
    sesiones: [{ id: 's1', inicio: '2026-10-07T10:00:00+02:00', fin: '2026-10-07T10:50:00+02:00', aforoMaximo: 10, tipoClaseId: 'tc', salaId: 'sa', instructorId: 'in', cancelada: false, precioPuntual: o.precioPuntual ?? null }],
    tiposClase: [{ id: 'tc', nombre: 'Reformer', reservaExigirPlan: o.exigeTipo ?? null }],
    salas: [{ id: 'sa', nombre: 'Sala' }],
    planesTarifa: o.planes ?? [SUELTA, BONO],
  } as unknown as PayloadMin;
}

test('la proyección resuelve «exige plan» como el servidor: el tipo hereda del estudio y hace falta algo que contratar', () => {
  assert.equal(proyectarClases(payload({ exigeEstudio: true }))[0].exigePlan, true);
  assert.equal(proyectarClases(payload({ exigeEstudio: true, exigeTipo: false }))[0].exigePlan, false);
  assert.equal(proyectarClases(payload({ exigeEstudio: false, exigeTipo: true }))[0].exigePlan, true);
  // Solo la prueba a la venta: exigir plan sería un callejón sin salida (`hayAlgoQueContratar`).
  assert.equal(proyectarClases(payload({ exigeEstudio: true, planes: [PRUEBA] }))[0].exigePlan, false);
  // Un payload sin el ajuste: no se sabe.
  assert.equal(proyectarClases(payload({ exigeEstudio: null }))[0].exigePlan, null);
  assert.equal(proyectarClases(payload({ exigeEstudio: true, precioPuntual: 25 }))[0].precioPuntual, 25);
});

test('sinBonoDeClase: monta el caso con las opciones y lo que cobra el mostrador', () => {
  const [c] = proyectarClases(payload({ exigeEstudio: true }));
  assert.deepEqual(sinBonoDeClase(c, [SUELTA, BONO], true)?.caso, { caso: 'PAGA_AQUI', desde: 15 });
  assert.deepEqual(sinBonoDeClase(c, [SUELTA, BONO], false)?.caso, { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'sin-pagos-online' });
  const [especial] = proyectarClases(payload({ exigeEstudio: true, precioPuntual: 25 }));
  assert.deepEqual(sinBonoDeClase(especial, [SUELTA, BONO], true)?.caso, { caso: 'PIDE_BONO_EN_ESTUDIO', motivo: 'precio-especial' });
  const [libre] = proyectarClases(payload({ exigeEstudio: false }));
  assert.deepEqual(sinBonoDeClase(libre, [SUELTA, BONO], true)?.caso, { caso: 'PAGA_EN_ESTUDIO', importe: 15 });
  assert.deepEqual(sinBonoDeClase(libre, [BONO], true)?.caso, { caso: 'RESERVA_SIN_PAGAR' });
  const [nose] = proyectarClases(payload({ exigeEstudio: null }));
  assert.equal(sinBonoDeClase(nose, [SUELTA, BONO], true), null);
});
