import { test } from 'node:test';
import assert from 'node:assert/strict';
import { llegaDeAnuncio, verBandaPrueba, CLAVE_BANDA_PRUEBA } from './banda-prueba-reglas.ts';

test('el enlace del anuncio de Meta activa la banda', () => {
  assert.equal(llegaDeAnuncio('?utm_source=meta&utm_medium=paid_social&utm_campaign=alta_prueba_reel_b&utm_content=llenar_horas_v1'), true);
  assert.equal(llegaDeAnuncio('utm_source=meta'), true, 'vale sin el «?» delante');
  assert.equal(llegaDeAnuncio('?utm_source=Meta'), true, 'sin distinguir mayúsculas');
});

test('la landing normal NO la lleva: directo, buscador, redes propias o un enlace a medias', () => {
  assert.equal(llegaDeAnuncio(''), false);
  assert.equal(llegaDeAnuncio('?'), false);
  assert.equal(llegaDeAnuncio('?utm_source=google'), false);
  assert.equal(llegaDeAnuncio('?utm_source=newsletter&utm_medium=email'), false);
  assert.equal(llegaDeAnuncio('?utm_medium=paid_social'), false, 'sin utm_source=meta no hay oferta');
  assert.equal(llegaDeAnuncio('?fbclid=abc123'), false, 'un fbclid suelto lo trae cualquier enlace copiado de Facebook');
  assert.equal(llegaDeAnuncio('?source=meta'), false, 'solo el parámetro utm_source');
  assert.equal(llegaDeAnuncio('?utm_source=metaverso'), false, 'igualdad exacta, no «empieza por»');
});

test('quien ya vino del anuncio en esta sesión la sigue viendo aunque la URL ya no traiga el utm', () => {
  assert.equal(verBandaPrueba('', '1'), true);
  assert.equal(verBandaPrueba('?utm_source=meta', null), true);
  assert.equal(verBandaPrueba('', null), false);
  assert.equal(verBandaPrueba('', '0'), false, 'solo «1» cuenta como visto del anuncio');
  assert.equal(verBandaPrueba('?utm_source=google', 'basura'), false);
});

test('la clave de sesión es un contrato: se lee y se escribe con el mismo nombre', () => {
  assert.equal(CLAVE_BANDA_PRUEBA, 'tentare:banda-prueba');
});
