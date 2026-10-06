import { test } from 'node:test';
import assert from 'node:assert/strict';
import { huellaDeLaSocia, proyectarAlumna, type PayloadMin } from './mapeo.ts';

// Sin `@/`: con el alias este test dejaría de ejecutarse sin avisar.

const socio = { id: 'soc-1', nombre: 'Ana', apellidos: 'Test', email: 'ana@example.com', fechaAlta: '2026-09-30' };
const base = (socia: Record<string, unknown> | null) => ({ studio: { id: 'st-1' }, socia } as unknown as PayloadMin);

test('huellaDeLaSocia: cuenta lo que tiene, y una reserva cancelada o una cita cancelada no cuentan', () => {
  const h = huellaDeLaSocia(base({
    socio,
    reservas: [{ id: 'r1', sesionId: 's', estado: 'CANCELADA' }, { id: 'r2', sesionId: 's', estado: 'PENDIENTE_APROBACION' }],
    suscripciones: [{ id: 'x', estado: 'CANCELADA' }],
    plazasFijas: [{ id: 'p', estado: 'BAJA' }],
    recuperaciones: [],
    citas: [{ estado: 'CANCELADA' }, { estado: 'CONFIRMADA' }],
  }));
  assert.deepEqual(h, { reservasNoCanceladas: 1, suscripciones: 1, plazasFijas: 1, recuperaciones: 0, citas: 1, fechaAlta: '2026-09-30' });
});

test('huellaDeLaSocia: sin ficha o con el payload incompleto, no se sabe (null)', () => {
  assert.equal(huellaDeLaSocia(base(null)), null);
  assert.equal(huellaDeLaSocia(base({ socio: null })), null);
  assert.equal(huellaDeLaSocia(base({ socio, incompleta: true, reservas: [] })), null);
});

test('proyectarAlumna lleva el género, y solo los dos que se conocen', () => {
  assert.equal(proyectarAlumna(base({ socio: { ...socio, genero: 'HOMBRE' } }))?.genero, 'HOMBRE');
  assert.equal(proyectarAlumna(base({ socio: { ...socio, genero: 'OTRO' } }))?.genero, null);
  assert.equal(proyectarAlumna(base({ socio }))?.genero, null);
});
