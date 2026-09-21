import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estadoEtapa, validarEtapa, type EtapaVista } from './etapas.ts';

const base = { etapa: 'FUNDADORA', planId: 'p1', desde: '2026-10-01', hasta: '2026-10-15' };

test('valida y limpia: sin cupo y sin elegir, «solo avisar» (no cambia nada)', () => {
  const r = validarEtapa(base);
  assert.deepEqual(r, { ok: true, etapa: { ...base, limitePlazas: null, alCompletar: 'AVISAR' } });
});

test('cupo como texto del formulario se convierte; cerrar se respeta', () => {
  const r = validarEtapa({ ...base, limitePlazas: '20', alCompletar: 'CERRAR' });
  assert.ok(r.ok && r.etapa.limitePlazas === 20 && r.etapa.alCompletar === 'CERRAR');
});

test('rechaza lo que no tiene sentido con un motivo legible', () => {
  assert.deepEqual(validarEtapa({ ...base, etapa: 'NORMAL' }), { ok: false, error: 'Elige el tipo de etapa' });
  assert.deepEqual(validarEtapa({ ...base, planId: '' }), { ok: false, error: 'Elige el plan que se vende en esta etapa' });
  assert.deepEqual(validarEtapa({ ...base, hasta: '2026-09-30' }), { ok: false, error: 'La fecha de fin no puede ser anterior a la de inicio' });
  assert.deepEqual(validarEtapa({ ...base, hasta: '2026-02-31' }), { ok: false, error: 'Fechas no válidas' });
  assert.deepEqual(validarEtapa({ ...base, limitePlazas: 0 }), { ok: false, error: 'El cupo debe ser un número entero mayor que 0' });
  assert.deepEqual(validarEtapa({ ...base, limitePlazas: 2.5 }), { ok: false, error: 'El cupo debe ser un número entero mayor que 0' });
});

const vista = (p: Partial<EtapaVista>): EtapaVista => ({
  id: 'e', etapa: 'FUNDADORA', planId: 'p1', planNombre: 'Fundadora', desde: '2026-10-01', hasta: '2026-10-15',
  limitePlazas: 20, alCompletar: 'CERRAR', cerrada: false, cerradaMotivo: null, ventas: 0, ...p,
});

test('estado: planificada, activa, casi llena', () => {
  assert.deepEqual(estadoEtapa(vista({}), '2026-09-25'), { texto: 'Empieza el 1 oct', tono: 'neutro' });
  assert.deepEqual(estadoEtapa(vista({ ventas: 5 }), '2026-10-03'), { texto: 'Activa hasta el 15 oct', tono: 'activo' });
  assert.deepEqual(estadoEtapa(vista({ ventas: 18 }), '2026-10-03'), { texto: 'Casi llena · hasta el 15 oct', tono: 'aviso' });
});

test('estado cerrado dice si la venta se cerró o sigue', () => {
  assert.equal(estadoEtapa(vista({ cerrada: true, cerradaMotivo: 'CUPO' }), '2026-10-03').texto, 'Cupo lleno: venta cerrada');
  assert.equal(estadoEtapa(vista({ cerrada: true, cerradaMotivo: 'CUPO', alCompletar: 'AVISAR' }), '2026-10-03').texto, 'Cupo lleno: el plan sigue a la venta');
  assert.equal(estadoEtapa(vista({ cerrada: true, cerradaMotivo: 'FECHA' }), '2026-10-20').texto, 'Terminó el 15 oct: venta cerrada');
});
