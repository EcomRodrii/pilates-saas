import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  hashearClave, verificarClave, firmarAcceso, verificarAcceso, veredictoPagina,
  nombreCookieAcceso,
} from './acceso-pagina.ts';

const SECRETO = 'secreto-de-prueba-no-usar-en-serio';
const STUDIO = 'studio-1';
const OTRO = 'studio-2';

test('la clave se guarda hasheada, con sal distinta cada vez', () => {
  const a = hashearClave('abrete sesamo');
  const b = hashearClave('abrete sesamo');
  assert.notEqual(a, b, 'dos hashes de la misma clave no pueden coincidir: sin sal, una tabla de hashes los rompe a la vez');
  assert.ok(a.startsWith('scrypt$'));
  assert.ok(verificarClave('abrete sesamo', a));
  assert.ok(verificarClave('abrete sesamo', b));
});

test('una clave equivocada no entra, y un hash corrupto tampoco abre', () => {
  const guardado = hashearClave('correcta');
  assert.equal(verificarClave('incorrecta', guardado), false);
  assert.equal(verificarClave('', guardado), false);
  // Sin clave configurada NUNCA se abre por comparación: `null` no es «cualquiera vale».
  assert.equal(verificarClave('lo que sea', null), false);
  assert.equal(verificarClave('lo que sea', undefined), false);
  // Formatos rotos (migración a medias, edición manual) se rechazan en vez de lanzar.
  assert.equal(verificarClave('x', 'sin-dolares'), false);
  assert.equal(verificarClave('x', 'bcrypt$sal$hash'), false);
  assert.equal(verificarClave('x', 'scrypt$sal$'), false);
  assert.equal(verificarClave('x', 'scrypt$sal$zzzz'), false);
});

test('acentos y formas Unicode distintas de la MISMA clave abren igual', () => {
  // «Ábrete» tecleado en un Mac y en un Windows puede llegar en NFD y NFC. Sin
  // normalizar, la propietaria la fija en un sitio y no le entra en el otro —
  // y no hay forma de que lo entienda mirando la pantalla.
  const nfc = 'Ábrete';
  const nfd = 'Ábrete';
  assert.notEqual(nfc, nfd);
  assert.ok(verificarClave(nfd, hashearClave(nfc)));
});

test('el pase abre su estudio y solo el suyo', () => {
  const pase = firmarAcceso(STUDIO, Date.now(), SECRETO);
  assert.ok(verificarAcceso(pase, STUDIO, Date.now(), SECRETO));
  assert.equal(verificarAcceso(pase, OTRO, Date.now(), SECRETO), false);
});

test('un pase caducado, manipulado o firmado con otro secreto no abre', () => {
  const ahora = Date.now();
  const pase = firmarAcceso(STUDIO, ahora, SECRETO);
  const treintaYUnDia = ahora + 31 * 24 * 60 * 60 * 1000;
  assert.equal(verificarAcceso(pase, STUDIO, treintaYUnDia, SECRETO), false);
  assert.equal(verificarAcceso(pase, STUDIO, ahora, 'otro-secreto'), false);
  assert.equal(verificarAcceso(`${pase}x`, STUDIO, ahora, SECRETO), false);
  assert.equal(verificarAcceso('sin-punto', STUDIO, ahora, SECRETO), false);
  assert.equal(verificarAcceso(null, STUDIO, ahora, SECRETO), false);
});

test('un token de OTRO tipo firmado con el mismo secreto NO vale como pase', () => {
  // El repo firma la vista previa del Inicio con este mismo secreto. Sin el
  // campo `tipo`, ese token —que cualquier miembro del staff puede obtener—
  // serviría para abrir la página oculta de su estudio saltándose la clave.
  const payload = Buffer.from(JSON.stringify({ studioId: STUDIO, exp: Date.now() + 1000 })).toString('base64url');
  const falso = `${payload}.${createHmac('sha256', SECRETO).update(payload).digest('base64url')}`;
  assert.equal(verificarAcceso(falso, STUDIO, Date.now(), SECRETO), false);
});

test('veredicto: sin ocultar, siempre abierta', () => {
  const base = { oculta: false, tieneClave: true, pase: null, studioId: STUDIO, claveFirma: SECRETO };
  assert.equal(veredictoPagina(base), 'abierta');
});

test('veredicto: oculta con clave pide la clave; con el pase, abre', () => {
  const base = { oculta: true, tieneClave: true, studioId: STUDIO, claveFirma: SECRETO };
  assert.equal(veredictoPagina({ ...base, pase: null }), 'pide-clave');
  assert.equal(veredictoPagina({ ...base, pase: 'basura' }), 'pide-clave');
  assert.equal(veredictoPagina({ ...base, pase: firmarAcceso(STUDIO, Date.now(), SECRETO) }), 'abierta');
  // El pase de OTRO estudio no sirve aquí.
  assert.equal(veredictoPagina({ ...base, pase: firmarAcceso(OTRO, Date.now(), SECRETO) }), 'pide-clave');
});

test('veredicto: oculta SIN clave no enseña formulario, dice que está cerrada', () => {
  // Un campo de clave que no abre con ninguna clave invita a probar y además
  // miente sobre que exista una forma de entrar.
  assert.equal(
    veredictoPagina({ oculta: true, tieneClave: false, pase: null, studioId: STUDIO, claveFirma: SECRETO }),
    'cerrada',
  );
});

test('quien ya entró no se queda fuera si luego se quita la clave', () => {
  // La propietaria pasa de «oculta con clave» a «oculta a secas». Echar a
  // quien ya estaba dentro sería un efecto colateral que nadie pidió.
  const pase = firmarAcceso(STUDIO, Date.now(), SECRETO);
  assert.equal(
    veredictoPagina({ oculta: true, tieneClave: false, pase, studioId: STUDIO, claveFirma: SECRETO }),
    'abierta',
  );
});

test('la cookie va por estudio, no una global', () => {
  assert.notEqual(nombreCookieAcceso(STUDIO), nombreCookieAcceso(OTRO));
});
