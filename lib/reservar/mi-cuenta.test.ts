import { test } from 'node:test';
import assert from 'node:assert/strict';
import { saldoBono, type BonoDeLaSocia } from './mi-cuenta.ts';

// ─────────────────────────────────────────────────────────────────────────────
// «Mi cuenta → Bonos» de /reservar (F5 del rediseño): la tarjeta de cada bono.
// El saldo no se recalcula (lo da `bonoActivo()`, con sus tests): aquí solo se
// vigila que las palabras digan lo mismo que la app.
// ─────────────────────────────────────────────────────────────────────────────

const HOY = '2026-08-12';
const bono = (b: Partial<BonoDeLaSocia> = {}): BonoDeLaSocia => ({
  restantes: 5, total: 8, caducaEn: '2026-12-31', textoCaducidad: 'Caduca en 141 días', agotado: false, ...b,
});

test('«Te quedan 5 de 8 sesiones», con la barra llena de lo que QUEDA', () => {
  const s = saldoBono(bono(), HOY);
  assert.equal(s.etiqueta, 'Activo');
  assert.equal(s.cifra, 5);
  assert.equal(s.deTotal, 'de 8 sesiones');
  assert.equal(s.progreso, 5 / 8);
});

test('la caducidad es una fecha, como en la app: «caduca jue 31 dic»', () => {
  assert.equal(saldoBono(bono(), HOY).caduca, 'caduca jue 31 dic');
  assert.equal(saldoBono(bono({ caducaEn: null }), HOY).caduca, 'Sin caducidad');
});

test('un bono con la fecha ya pasada lo dice, aunque siga activo en la base', () => {
  const s = saldoBono(bono({ caducaEn: '2026-08-04' }), HOY);
  assert.equal(s.etiqueta, 'Caducado');
  assert.equal(s.caduca, 'caducó mar 4 ago');
  // El último día aún vale.
  assert.equal(saldoBono(bono({ caducaEn: HOY }), HOY).etiqueta, 'Activo');
});

test('un bono agotado se enseña con su cero (lo pagó y lo gastó), con la barra vacía', () => {
  const s = saldoBono(bono({ restantes: 0, agotado: true }), HOY);
  assert.equal(s.etiqueta, 'Agotado');
  assert.equal(s.cifra, 0);
  assert.equal(s.progreso, 0);
});

test('singular y plural', () => {
  assert.equal(saldoBono(bono({ restantes: 1, total: 1 }), HOY).deTotal, 'de 1 sesión');
  // Un plan que no dice cuántas traía: la cifra, sin inventar un total.
  const sinTotal = saldoBono(bono({ restantes: 3, total: null }), HOY);
  assert.equal(sinTotal.deTotal, 'sesiones');
  assert.equal(sinTotal.progreso, null);
});

test('⚠️ un mensual no tiene saldo ni caduca: ni «0», ni barra, ni «caduca…»', () => {
  const s = saldoBono(bono({ restantes: null, total: null, caducaEn: '2026-08-18', textoCaducidad: 'Próxima renovación en 6 días' }), HOY);
  assert.equal(s.cifra, null);
  assert.equal(s.deTotal, null);
  assert.equal(s.progreso, null);
  assert.equal(s.caduca, 'Próxima renovación en 6 días');
  assert.equal(saldoBono(bono({ restantes: null, total: null, caducaEn: null, textoCaducidad: null }), HOY).caduca, 'Sin caducidad');
});
