import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  accionesDisponibles, estadoVisible, itemsParaPasarAAnual, resumenDeVistaPrevia, type EntradaAcciones,
} from './reglas.ts';

const base: EntradaAcciones = {
  estado: 'active', plan: 'BASE', intervalo: 'mensual', bajaProgramada: false, esCadena: false,
  tieneComplementos: false, anualDisponible: true,
};

test('una Founding mensual al día puede subir a Estudio, pasar a anual y cancelar', () => {
  const a = accionesDisponibles(base);
  assert.deepEqual(a, {
    actualizarTarjeta: true, cambiarAAnual: true, pasarAEstudio: true, cancelar: true, reactivar: false, motivoSinCambios: null,
  });
});

test('Estudio mensual no ofrece subir; anual no ofrece pasar a anual', () => {
  assert.equal(accionesDisponibles({ ...base, plan: 'ESTUDIO' }).pasarAEstudio, false);
  assert.equal(accionesDisponibles({ ...base, intervalo: 'anual' }).cambiarAAnual, false);
});

test('con la baja programada solo se puede reactivar o cambiar la tarjeta', () => {
  const a = accionesDisponibles({ ...base, bajaProgramada: true });
  assert.deepEqual([a.reactivar, a.cancelar, a.cambiarAAnual, a.pasarAEstudio, a.actualizarTarjeta], [true, false, false, false, true]);
  assert.equal(a.motivoSinCambios, 'baja-programada');
});

test('en impago se arregla la tarjeta y se puede cancelar, pero no se cambia de plan', () => {
  const a = accionesDisponibles({ ...base, estado: 'past_due' });
  assert.deepEqual([a.actualizarTarjeta, a.cancelar, a.cambiarAAnual, a.pasarAEstudio], [true, true, false, false]);
  assert.equal(a.motivoSinCambios, 'impago');
});

test('una cadena solo cambia la tarjeta: nada de cancelar ni de planes desde una sede', () => {
  const a = accionesDisponibles({ ...base, esCadena: true, plan: 'CADENA' });
  assert.deepEqual([a.actualizarTarjeta, a.cancelar, a.reactivar, a.cambiarAAnual, a.pasarAEstudio], [true, false, false, false, false]);
  assert.equal(a.motivoSinCambios, 'cadena');
});

test('sin suscripción viva no hay nada que hacer', () => {
  for (const estado of [null, 'canceled', 'incomplete_expired', 'gratis']) {
    const a = accionesDisponibles({ ...base, estado });
    assert.equal(Object.entries(a).filter(([k, v]) => k !== 'motivoSinCambios' && v).length, 0, String(estado));
    assert.equal(a.motivoSinCambios, 'sin-suscripcion');
  }
});

test('si no están los precios anuales no se ofrece pasar a anual y se dice por qué', () => {
  const a = accionesDisponibles({ ...base, anualDisponible: false });
  assert.equal(a.cambiarAAnual, false);
  assert.equal(a.motivoSinCambios, 'anual-no-disponible');
  assert.equal(a.pasarAEstudio, true, 'lo demás sigue disponible');
});

test('el estado visible prioriza impago y baja programada sobre «al día»', () => {
  assert.equal(estadoVisible('active', false), 'al_dia');
  assert.equal(estadoVisible('active', true), 'baja_programada');
  assert.equal(estadoVisible('past_due', true), 'impago');
  assert.equal(estadoVisible('trialing', false), 'prueba');
  assert.equal(estadoVisible('canceled', false), 'cancelada');
  assert.equal(estadoVisible(null, false), 'sin_suscripcion');
});

// ── A anual ─────────────────────────────────────────────────────────────────
const mapa = {
  plan: (p: string | null | undefined) => ({ pm_base: 'BASE' as const, pm_est: 'ESTUDIO' as const })[p as 'pm_base'] ?? null,
  addon: (p: string | null | undefined) => ({ am_cdc: 'decisiones' as const })[p as 'am_cdc'] ?? null,
  precioAnualPlan: (p: 'BASE' | 'ESTUDIO' | 'CADENA') => ({ BASE: 'pa_base', ESTUDIO: 'pa_est', CADENA: 'pa_cad' })[p],
  precioAnualAddon: (a: string) => (a === 'decisiones' ? 'aa_cdc' : null),
};

test('pasar a anual cambia cada línea a su precio anual, en una sola actualización', () => {
  const r = itemsParaPasarAAnual([{ id: 'si_1', priceId: 'pm_base' }, { id: 'si_2', priceId: 'am_cdc' }], mapa);
  assert.deepEqual(r, [{ id: 'si_1', price: 'pa_base' }, { id: 'si_2', price: 'aa_cdc' }]);
});

test('una línea desconocida, un complemento sin precio anual o dos planes: no se toca nada', () => {
  assert.equal(itemsParaPasarAAnual([{ id: 'a', priceId: 'pm_base' }, { id: 'b', priceId: 'otra' }], mapa), null);
  assert.equal(itemsParaPasarAAnual([{ id: 'a', priceId: 'pm_base' }, { id: 'b', priceId: 'am_cdc' }], { ...mapa, precioAnualAddon: () => null }), null);
  assert.equal(itemsParaPasarAAnual([{ id: 'a', priceId: 'pm_base' }, { id: 'b', priceId: 'pm_est' }], mapa), null);
  assert.equal(itemsParaPasarAAnual([{ id: 'a', priceId: 'am_cdc' }], mapa), null, 'sin línea de plan');
});

// ── Vista previa ────────────────────────────────────────────────────────────
test('la vista previa de un cambio de periodo cobra ahora y no inventa fecha', () => {
  const v = resumenDeVistaPrevia({
    amount_due: 79000, total: 79000, period_end: 1_800_000_000,
    lines: { data: [{ description: 'Crédito por tiempo no usado', amount: -2600 }, { description: 'Estudio (anual)', amount: 81600 }, { description: 'Cero', amount: 0 }] },
  }, 'ahora', '2026-12-16T00:00:00Z');
  assert.equal(v.cuando, 'ahora');
  assert.equal(v.fecha, null);
  assert.equal(v.importeCents, 79000);
  assert.deepEqual(v.lineas.map((l) => l.importeCents), [-2600, 81600], 'las líneas a 0 no se enseñan');
});

test('subir de plan se suma a la próxima factura, con su fecha', () => {
  const v = resumenDeVistaPrevia({ amount_due: 7900, total: 7900, period_end: null, lines: { data: [{ description: 'Estudio', amount: 7900 }] } }, 'proxima_factura', '2026-12-16T00:00:00Z');
  assert.deepEqual([v.cuando, v.fecha, v.importeCents], ['proxima_factura', '2026-12-16T00:00:00Z', 7900]);
});

test('un importe negativo (crédito mayor que el cargo) se enseña como 0, nunca como devolución', () => {
  const v = resumenDeVistaPrevia({ amount_due: -500, total: -500, period_end: null, lines: { data: [] } }, 'ahora', null);
  assert.equal(v.importeCents, 0);
});
