import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoNoQuitar, MENSAJE_NO_QUITAR, type CuentaParaQuitar } from './quitar-doble-factor-reglas.ts';

const base: CuentaParaQuitar = {
  tieneCuenta: true,
  factoresVerificados: 1,
  esDelEquipo: false,
  enNetwork: false,
  estudiosComoAlumna: [{ studioId: 'est-a', cadenaId: null }],
  estudio: { studioId: 'est-a', cadenaId: null },
};

test('alumna solo de este estudio, con la verificación activada: se puede quitar', () => {
  assert.equal(motivoNoQuitar(base), null);
});

test('sin cuenta o sin verificación no hay nada que quitar', () => {
  assert.equal(motivoNoQuitar({ ...base, tieneCuenta: false }), 'sin_cuenta');
  assert.equal(motivoNoQuitar({ ...base, factoresVerificados: 0 }), 'sin_verificacion');
});

test('una cuenta del equipo de cualquier estudio nunca se toca desde una ficha de alumna', () => {
  assert.equal(motivoNoQuitar({ ...base, esDelEquipo: true }), 'cuenta_de_equipo');
});

test('con perfil en Tentare Network: no se toca desde un estudio', () => {
  assert.equal(motivoNoQuitar({ ...base, enNetwork: true }), 'otro_estudio');
});

test('equipo y otro estudio dicen lo MISMO: no se cuenta dónde más está la alumna', () => {
  assert.equal(MENSAJE_NO_QUITAR.cuenta_de_equipo, MENSAJE_NO_QUITAR.otro_estudio);
  assert.doesNotMatch(MENSAJE_NO_QUITAR.otro_estudio, /otro estudio|equipo/);
});

test('alumna también de otro estudio que no es de la cadena: no se toca', () => {
  assert.equal(motivoNoQuitar({ ...base, estudiosComoAlumna: [...base.estudiosComoAlumna, { studioId: 'est-b', cadenaId: null }] }), 'otro_estudio');
  // Que el otro estudio tenga cadena no basta si este no la tiene.
  assert.equal(motivoNoQuitar({ ...base, estudiosComoAlumna: [...base.estudiosComoAlumna, { studioId: 'est-b', cadenaId: 'cad-1' }] }), 'otro_estudio');
  // Ni que este tenga una cadena distinta.
  assert.equal(motivoNoQuitar({
    ...base,
    estudio: { studioId: 'est-a', cadenaId: 'cad-1' },
    estudiosComoAlumna: [{ studioId: 'est-a', cadenaId: 'cad-1' }, { studioId: 'est-b', cadenaId: 'cad-2' }],
  }), 'otro_estudio');
});

test('alumna de varias sedes de la MISMA cadena: se puede quitar', () => {
  assert.equal(motivoNoQuitar({
    ...base,
    estudio: { studioId: 'est-a', cadenaId: 'cad-1' },
    estudiosComoAlumna: [{ studioId: 'est-a', cadenaId: 'cad-1' }, { studioId: 'est-b', cadenaId: 'cad-1' }],
  }), null);
});

test('cada motivo tiene su frase', () => {
  for (const m of ['sin_cuenta', 'sin_verificacion', 'cuenta_de_equipo', 'otro_estudio'] as const) {
    assert.ok(MENSAJE_NO_QUITAR[m].length > 10);
  }
});
