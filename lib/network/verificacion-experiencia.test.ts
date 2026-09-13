import { test } from 'node:test';
import assert from 'node:assert/strict';
import { motivoVerificadorNoPermitido, nombreEstudioVisible } from './verificacion-experiencia.ts';

const YO = 'uid-instructora';

test('no se puede pedir la verificación a un estudio cuya dueña es la misma cuenta', () => {
  assert.equal(motivoVerificadorNoPermitido({ perfilAuthUserId: YO, ownerAuthUserId: YO, gestionaElEstudio: false }), 'ES_SU_ESTUDIO');
});

test('tampoco a un estudio que gestiona (PROPIETARIO/MANAGER en su ficha de equipo)', () => {
  assert.equal(motivoVerificadorNoPermitido({ perfilAuthUserId: YO, ownerAuthUserId: 'otra', gestionaElEstudio: true }), 'GESTIONA_EL_ESTUDIO');
});

test('un estudio ajeno sí puede verificar', () => {
  assert.equal(motivoVerificadorNoPermitido({ perfilAuthUserId: YO, ownerAuthUserId: 'otra', gestionaElEstudio: false }), null);
  // Un estudio sin dueña enlazada (owner NULL) no se confunde con «es suyo».
  assert.equal(motivoVerificadorNoPermitido({ perfilAuthUserId: YO, ownerAuthUserId: null, gestionaElEstudio: false }), null);
});

test('ficha pública: verificada enseña el nombre REAL del estudio verificador, no el texto libre', () => {
  assert.equal(
    nombreEstudioVisible({ estadoVerificacion: 'confirmada', nombreEstudio: 'Estudio Famoso', estudioVerificadorNombre: 'Pilates de Barrio' }),
    'Pilates de Barrio',
  );
});

test('ficha pública: sin verificar (o sin estudio verificador) se queda el texto libre', () => {
  assert.equal(nombreEstudioVisible({ estadoVerificacion: 'pendiente', nombreEstudio: 'Estudio Famoso', estudioVerificadorNombre: 'Pilates de Barrio' }), 'Estudio Famoso');
  assert.equal(nombreEstudioVisible({ estadoVerificacion: 'sin_solicitar', nombreEstudio: 'Estudio Famoso' }), 'Estudio Famoso');
  assert.equal(nombreEstudioVisible({ estadoVerificacion: 'confirmada', nombreEstudio: 'Estudio Famoso', estudioVerificadorNombre: null }), 'Estudio Famoso');
  assert.equal(nombreEstudioVisible({ estadoVerificacion: 'confirmada', nombreEstudio: 'Estudio Famoso', estudioVerificadorNombre: '   ' }), 'Estudio Famoso');
});
