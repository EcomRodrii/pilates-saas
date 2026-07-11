import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confianzaRecuperarSocia, confianzaRecuperarSociaPorNoShow, confianzaEnviarReactivacion, confianzaAbrirSesion, confianzaRecuperarPagos, resolverNivelAutonomia, resolverNivelAutonomiaPorTipo } from './confianza.ts';

test('confianzaRecuperarSocia: a+b+d → ALTA, autonomía máxima 2', () => {
  const c = confianzaRecuperarSocia({ ausenciaFrecuenciaValida: true, renovacionCerca: true, sinContactoPrevio: true });
  assert.equal(c?.nivel, 'ALTA');
  assert.equal(c?.autonomiaMaxima, 2);
  assert.equal(c?.evidencia.length, 3);
});

test('confianzaRecuperarSocia: a+d (sin b) → MEDIA', () => {
  const c = confianzaRecuperarSocia({ ausenciaFrecuenciaValida: true, renovacionCerca: false, sinContactoPrevio: true });
  assert.equal(c?.nivel, 'MEDIA');
  assert.equal(c?.autonomiaMaxima, 1);
});

test('confianzaRecuperarSocia: solo a → BAJA, autonomía 0', () => {
  const c = confianzaRecuperarSocia({ ausenciaFrecuenciaValida: true, renovacionCerca: false, sinContactoPrevio: false });
  assert.equal(c?.nivel, 'BAJA');
  assert.equal(c?.autonomiaMaxima, 0);
});

test('confianzaRecuperarSocia: sin a → null (no se emite, suelo de emisión)', () => {
  const c = confianzaRecuperarSocia({ ausenciaFrecuenciaValida: false, renovacionCerca: true, sinContactoPrevio: true });
  assert.equal(c, null);
});

test('confianzaRecuperarSociaPorNoShow: no depende de ausenciaAnomala, tiene su propio suelo', () => {
  const c = confianzaRecuperarSociaPorNoShow({ patronNoShowClaro: true, renovacionCerca: false, sinContactoPrevio: false });
  assert.equal(c?.nivel, 'BAJA');
  assert.equal(confianzaRecuperarSociaPorNoShow({ patronNoShowClaro: false, renovacionCerca: true, sinContactoPrevio: true }), null);
});

test('confianzaEnviarReactivacion: a+b+c → ALTA; solo a → BAJA; sin a → null', () => {
  assert.equal(confianzaEnviarReactivacion({ ausenciaCritica: true, historicoRespuestaEmails: true, sinVetoDescuentos: true })?.nivel, 'ALTA');
  assert.equal(confianzaEnviarReactivacion({ ausenciaCritica: true, historicoRespuestaEmails: false, sinVetoDescuentos: false })?.nivel, 'BAJA');
  assert.equal(confianzaEnviarReactivacion({ ausenciaCritica: false, historicoRespuestaEmails: true, sinVetoDescuentos: true }), null);
});

test('confianzaAbrirSesion: a+b+c → ALTA; a+b → MEDIA; solo a → BAJA', () => {
  assert.equal(confianzaAbrirSesion({ franjaLlenaConsistente: true, demandaInsatisfecha: true, patronSostenido: true })?.nivel, 'ALTA');
  assert.equal(confianzaAbrirSesion({ franjaLlenaConsistente: true, demandaInsatisfecha: true, patronSostenido: false })?.nivel, 'MEDIA');
  assert.equal(confianzaAbrirSesion({ franjaLlenaConsistente: true, demandaInsatisfecha: false, patronSostenido: false })?.nivel, 'BAJA');
});

test('confianzaRecuperarPagos: a+b+c → ALTA; a+b → MEDIA; solo a → BAJA; sin a → null', () => {
  assert.equal(confianzaRecuperarPagos({ tarjetaValida: true, vencidoMenos30d: true, socioActivo: true })?.nivel, 'ALTA');
  assert.equal(confianzaRecuperarPagos({ tarjetaValida: true, vencidoMenos30d: true, socioActivo: false })?.nivel, 'MEDIA');
  assert.equal(confianzaRecuperarPagos({ tarjetaValida: true, vencidoMenos30d: false, socioActivo: false })?.nivel, 'BAJA');
  assert.equal(confianzaRecuperarPagos({ tarjetaValida: false, vencidoMenos30d: true, socioActivo: true }), null);
});

test('resolverNivelAutonomia: nunca supera el techo de la confianza aunque la regla declare más', () => {
  const confianzaMedia = { nivel: 'MEDIA' as const, evidencia: [], autonomiaMaxima: 1 as const };
  assert.equal(resolverNivelAutonomia(2, confianzaMedia), 1);
  assert.equal(resolverNivelAutonomia(0, confianzaMedia), 0);
});

test('resolverNivelAutonomiaPorTipo: ENVIAR_REACTIVACION declara 2, capado por confianza MEDIA a 1', () => {
  const confianzaMedia = { nivel: 'MEDIA' as const, evidencia: [], autonomiaMaxima: 1 as const };
  const confianzaAlta = { nivel: 'ALTA' as const, evidencia: [], autonomiaMaxima: 2 as const };
  assert.equal(resolverNivelAutonomiaPorTipo('ENVIAR_REACTIVACION', confianzaMedia), 1);
  assert.equal(resolverNivelAutonomiaPorTipo('ENVIAR_REACTIVACION', confianzaAlta), 2);
  assert.equal(resolverNivelAutonomiaPorTipo('RECUPERAR_SOCIA', confianzaAlta), 1); // declara 1, aunque la confianza permita más
});
