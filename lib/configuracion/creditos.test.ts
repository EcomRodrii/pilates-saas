import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDITOS_SUGERIDOS, accionesAFormulario, accionesConCreditosMal, cambiosReglasCreditos, enteroPositivo,
  escriturasDeAcciones, reglasCreditosAFormulario, type ReglaGuardada,
} from './creditos.ts';
import { REWARD_TRIGGERS } from '../engines/reward-engine.ts';

// Las reglas de los créditos se guardaban al salir de cada campo. Ahora van en
// dos cajones con un solo «Guardar», y lo que se fija aquí es QUÉ se escribe:
// solo lo que cambia de verdad, normalizado como lo lee el servidor.

test('un entero positivo, o nada', () => {
  assert.equal(enteroPositivo('12'), 12);
  assert.equal(enteroPositivo(' 3 '), 3);
  for (const v of ['', '0', '-2', 'abc']) assert.equal(enteroPositivo(v), null, v);
});

test('cómo funcionan tus créditos: solo las columnas que cambian, normalizadas', () => {
  const guardado = { creditosNombre: 'puntos', creditosCaducanMeses: 12, rachaClasesSemana: null };
  const form = reglasCreditosAFormulario(guardado);
  assert.deepEqual(form, { nombre: 'puntos', caducanMeses: '12', rachaClases: '' });
  // Tocar y dejarlo igual no escribe nada.
  assert.deepEqual(cambiosReglasCreditos(form, guardado), {});
  assert.deepEqual(cambiosReglasCreditos({ ...form, nombre: '  puntos ' }, guardado), {});
  // Volver a «créditos» es NULL, no el literal.
  assert.deepEqual(cambiosReglasCreditos({ ...form, nombre: '  Créditos  ' }, guardado), { creditosNombre: null });
  // 0 meses es «no caducan» (NULL): con 0 caducaría todo esta noche.
  assert.deepEqual(cambiosReglasCreditos({ ...form, caducanMeses: '0' }, guardado), { creditosCaducanMeses: null });
  assert.deepEqual(cambiosReglasCreditos({ ...form, rachaClases: '2' }, guardado), { rachaClasesSemana: 2 });
  // Sin cargar, el formulario sale vacío y no inventa valores.
  assert.deepEqual(reglasCreditosAFormulario(null), { nombre: '', caducanMeses: '', rachaClases: '' });
});

const regla = (trigger: ReglaGuardada['trigger'], extra: Partial<ReglaGuardada> = {}): ReglaGuardada => ({
  id: `rwr-${trigger}`, trigger, creditos: 10, activa: true, unidadEuros: null, topeMensual: null, ...extra,
});

test('créditos por acción: sin regla guardada sale apagada, con la cifra sugerida', () => {
  const form = accionesAFormulario([regla('ASISTENCIA_CLASE', { creditos: 15 })]);
  assert.deepEqual(Object.keys(form), REWARD_TRIGGERS.map(d => d.trigger));
  assert.deepEqual(form.ASISTENCIA_CLASE, { creditos: '15', activa: true, unidadEuros: '', topeMensual: '' });
  // Sin regla no se da ningún crédito: nunca encendida por defecto.
  assert.deepEqual(form.REFERIDO_AMIGO, { creditos: String(CREDITOS_SUGERIDOS.REFERIDO_AMIGO), activa: false, unidadEuros: '', topeMensual: '' });
  assert.equal(form.COMPRA.creditos, '1');
});

test('créditos por acción: solo las reglas que cambian, y de las que existen solo sus campos', () => {
  const reglas = [regla('ASISTENCIA_CLASE'), regla('COMPRA', { creditos: 1, unidadEuros: 5 })];
  const base = accionesAFormulario(reglas);
  assert.deepEqual(escriturasDeAcciones(base, reglas), []);

  const form = {
    ...base,
    ASISTENCIA_CLASE: { ...base.ASISTENCIA_CLASE, creditos: '100' },
    COMPRA: { ...base.COMPRA, unidadEuros: '' },
    RENOVACION_PLAN: { ...base.RENOVACION_PLAN, activa: true },
  };
  assert.deepEqual(escriturasDeAcciones(form, reglas), [
    { trigger: 'ASISTENCIA_CLASE', id: 'rwr-ASISTENCIA_CLASE', cambios: { creditos: 100 } },
    { trigger: 'RENOVACION_PLAN', id: null, nueva: { creditos: 40, activa: true, unidadEuros: null, topeMensual: null } },
    // Vacío = cada euro (NULL), como lo lee el servidor.
    { trigger: 'COMPRA', id: 'rwr-COMPRA', cambios: { unidadEuros: null } },
  ]);
});

test('créditos por acción: el tope y los euros solo cuentan donde existen, y una cifra que no es un número bloquea', () => {
  const base = accionesAFormulario([]);
  const form = {
    ...base,
    REFERIDO_AMIGO: { ...base.REFERIDO_AMIGO, topeMensual: '3' },
    // Un tope escrito donde no aplica no es un cambio.
    ASISTENCIA_CLASE: { ...base.ASISTENCIA_CLASE, topeMensual: '9' },
  };
  assert.deepEqual(escriturasDeAcciones(form, []), [
    { trigger: 'REFERIDO_AMIGO', id: null, nueva: { creditos: 100, activa: false, unidadEuros: null, topeMensual: 3 } },
  ]);
  assert.deepEqual(accionesConCreditosMal(base), []);
  assert.deepEqual(accionesConCreditosMal({ ...base, SEMANA_COMPLETA: { ...base.SEMANA_COMPLETA, creditos: '' } }), ['SEMANA_COMPLETA']);
});
