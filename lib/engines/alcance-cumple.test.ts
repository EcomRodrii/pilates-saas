import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alcanceCumple, correosCandidatosCumple, type FilaAlcanceCumple } from './alcance-cumple.ts';

const TEXTO = 'texto-vigente';
const fila = (p: Partial<FilaAlcanceCumple>): FilaAlcanceCumple =>
  ({ activo: true, email: 'a@b.c', fecha_nacimiento: '1990-01-01', consentimiento_marketing_texto: TEXTO, ...p });

test('alcance del cumpleaños: cuenta lo mismo que el motor exige (fecha, 18 años, consentimiento vigente y email)', () => {
  const a = alcanceCumple([
    fila({}),                                            // alcanzable
    fila({ fecha_nacimiento: null }),                    // sin fecha
    fila({ consentimiento_marketing_texto: null }),      // sin consentimiento
    fila({ consentimiento_marketing_texto: 'otro' }),    // consintió otro texto: no vale
    fila({ fecha_nacimiento: '2012-05-05' }),            // menor
    fila({ email: null }),                               // sin email
    fila({ activo: false }),                             // de baja: ni cuenta
    fila({ fecha_nacimiento: '1990-02-30' }),            // fecha imposible = sin fecha
    fila({ fecha_nacimiento: '1900-01-01' }),            // de relleno (126 años) = sin fecha
  ], TEXTO, '2026-10-13');
  assert.deepEqual(a, { activas: 8, conFecha: 5, conConsentimiento: 6, alcanzables: 1 });
});

test('alcance del cumpleaños: no cuenta un correo al que el envío no escribiría (rebote, dominio de ejemplo)', () => {
  const filas = [fila({ email: 'bien@b.c' }), fila({ email: 'rota@b.c' }), fila({ email: 'menor@b.c', fecha_nacimiento: '2012-01-01' })];
  assert.deepEqual(correosCandidatosCumple(filas, TEXTO, '2026-10-13'), ['bien@b.c', 'rota@b.c'], 'solo pregunta por las que cumplen lo demás');
  const a = alcanceCumple(filas, TEXTO, '2026-10-13', e => e === 'rota@b.c');
  assert.equal(a.alcanzables, 1);
});

test('alcance del cumpleaños: sin nadie, todo a cero', () => {
  assert.deepEqual(alcanceCumple([], TEXTO, '2026-10-13'), { activas: 0, conFecha: 0, conConsentimiento: 0, alcanzables: 0 });
});
