import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  frasePlazoCancelacion, fraseAntelacionMinima, enHorasOMinutos,
  type ReglasEstudio, type ReglasTipo,
} from './promesas.ts';

const ESTUDIO: ReglasEstudio = { cancelacionVentanaHoras: 12, reservaVentanaMinimaMinutos: 0 };
const tipo = (c: number | null, m: number | null = null): ReglasTipo =>
  ({ ventanaCancelacionHoras: c, reservaVentanaMinimaMinutos: m });

// ── Plazo de cancelación ────────────────────────────────────────────────────

test('sin tipos de clase, manda el plazo del estudio', () => {
  assert.equal(frasePlazoCancelacion(ESTUDIO, []), 'Cancela gratis hasta 12 h antes.');
});

test('con todos los tipos heredando, sigue siendo el del estudio', () => {
  assert.equal(
    frasePlazoCancelacion(ESTUDIO, [tipo(null), tipo(null)]),
    'Cancela gratis hasta 12 h antes.',
  );
});

test('⚠️ cuando los tipos NO coinciden se anuncia el MÁS ESTRICTO', () => {
  // Este es el bug que motivó el módulo: la caja decía «hasta 12 h» (el valor
  // del estudio) en un estudio donde el Reformer exige 24. Quien cancelaba a
  // 18 h creía llegar a tiempo y perdía la clase.
  const r = frasePlazoCancelacion(ESTUDIO, [tipo(null), tipo(24)]);
  assert.equal(r, 'Cancela gratis hasta 24 h antes, según la clase.');
});

test('equivocarse hacia el lado estricto es el único error que no cuesta dinero', () => {
  // Con 6 y 24, decir 6 dejaría a la clienta fuera de la de 24. Decir 24 solo
  // hace que cancele antes de lo necesario en la de 6.
  assert.match(frasePlazoCancelacion(ESTUDIO, [tipo(6), tipo(24)]), /24 h/);
});

test('un tipo con override IGUAL al del estudio no cuenta como variación', () => {
  // Es el mismo plazo escrito dos veces, no dos reglas: decir «según la clase»
  // ahí mandaría a comprobar algo que no cambia.
  assert.equal(
    frasePlazoCancelacion(ESTUDIO, [tipo(12), tipo(null)]),
    'Cancela gratis hasta 12 h antes.',
  );
});

test('sin ningún plazo en ninguna clase, se dice que no lo hay', () => {
  const sinPlazo: ReglasEstudio = { ...ESTUDIO, cancelacionVentanaHoras: 0 };
  assert.equal(frasePlazoCancelacion(sinPlazo, []), 'Cancela gratis cuando quieras.');
  assert.equal(frasePlazoCancelacion(sinPlazo, [tipo(null)]), 'Cancela gratis cuando quieras.');
});

test('si UNA sola clase tiene plazo, deja de ser «cuando quieras»', () => {
  // El caso peligroso del anterior: con el estudio a 0 y un tipo a 24, prometer
  // «cuando quieras» es exactamente la mentira que este módulo viene a quitar.
  const sinPlazo: ReglasEstudio = { ...ESTUDIO, cancelacionVentanaHoras: 0 };
  assert.equal(
    frasePlazoCancelacion(sinPlazo, [tipo(null), tipo(24)]),
    'Cancela gratis hasta 24 h antes, según la clase.',
  );
});

// ── Antelación mínima ───────────────────────────────────────────────────────

test('sin antelación mínima no se dice NADA, ni una frase vacía', () => {
  // Anunciar «reserva con 0 minutos de antelación» es ruido, y además hace
  // dudar de si hay truco.
  assert.equal(fraseAntelacionMinima(ESTUDIO, []), null);
  assert.equal(fraseAntelacionMinima(ESTUDIO, [tipo(null, null)]), null);
});

test('con antelación mínima, se anuncia ANTES de intentar reservar', () => {
  const e: ReglasEstudio = { ...ESTUDIO, reservaVentanaMinimaMinutos: 120 };
  assert.equal(fraseAntelacionMinima(e, []), 'Reserva con al menos 2 h de antelación.');
});

test('si varía por clase se anuncia la MÁS LARGA, al revés que la cancelación', () => {
  // Aquí quedarse corto haría llegar tarde a la más estricta. En los dos casos
  // se elige el número que evita que alguien se quede fuera — que no es el
  // mismo extremo en ambos.
  const e: ReglasEstudio = { ...ESTUDIO, reservaVentanaMinimaMinutos: 30 };
  assert.equal(
    fraseAntelacionMinima(e, [tipo(null, null), tipo(null, 180)]),
    'Reserva con al menos 3 h de antelación, según la clase.',
  );
});

// ── Formato ─────────────────────────────────────────────────────────────────

test('minutos por debajo de la hora, horas por encima', () => {
  assert.equal(enHorasOMinutos(30), '30 min');
  assert.equal(enHorasOMinutos(59), '59 min');
  assert.equal(enHorasOMinutos(60), '1 h');
  assert.equal(enHorasOMinutos(120), '2 h');
  assert.equal(enHorasOMinutos(150), '2 h 30 min');
});
