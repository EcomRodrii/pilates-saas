import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referidorDeAlta, referidorUtilizable, enlaceInvitacion, fraseInvitacion, textoInvitacion } from './referido.ts';

test('sin referidor no hay nada que mandar', () => {
  assert.equal(referidorUtilizable(null, 'soc-1'), false);
  assert.equal(referidorUtilizable('', 'soc-1'), false);
  assert.equal(referidorUtilizable('   ', 'soc-1'), false);
});

test('nadie se invita a sí misma', () => {
  // Sería un crédito por darse de alta, que no es lo que premia la regla.
  assert.equal(referidorUtilizable('soc-1', 'soc-1'), false);
  assert.equal(referidorUtilizable('soc-2', 'soc-1'), true);
});

test('lo que no tiene forma de id se descarta antes de salir', () => {
  // `socios.referido_por` tiene clave foránea: un valor inventado NO se
  // ignora, hace fallar el INSERT y deja a la invitada sin cuenta. Esto no
  // sustituye a la comprobación del servidor, la precede.
  for (const malo of ['../../etc', 'a b', "'; drop", 'a'.repeat(65), '<script>', 'a/b']) {
    assert.equal(referidorUtilizable(malo, null), false, malo);
  }
  assert.equal(referidorUtilizable('9f8e7d6c-1234-4abc-9def-0123456789ab', null), true);
  // Y un id corto es válido: `socios.id` es `text`, su formato no lo decide
  // esta app. Exigir una longitud mínima rompería altas legítimas.
  assert.equal(referidorUtilizable('soc-2', null), true);
});

test('el enlace lleva el estudio y el referidor, y escapa lo que haga falta', () => {
  const u = enlaceInvitacion('https://app.tentare.es/', 'mi estudio', 'soc-1');
  assert.equal(u, 'https://app.tentare.es/portal/mi%20estudio/acceso/registro?ref=soc-1');
  // Sin barra doble aunque el origen la traiga.
  assert.ok(!u.includes('es//portal'));
});

test('el texto invita y NO promete un premio que la alumna no controla', () => {
  // La regla de créditos es opcional por estudio y se paga cuando la invitada
  // ASISTE, no al registrarse. Prometer «ganáis las dos» aquí sería vender
  // algo que puede no existir.
  const t = textoInvitacion('Estudio Alma', 'https://x/y');
  assert.match(t, /Estudio Alma/);
  assert.match(t, /https:\/\/x\/y/);
  assert.doesNotMatch(t, /gratis|regalo|gana|premio/i);
  // La hoja de compartir manda frase y enlace por separado; copiado, van juntos.
  assert.equal(t, `${fraseInvitacion('Estudio Alma')}\nhttps://x/y`);
});

// ── Quién invita en la página pública (P04: «Compartir esta clase») ──────────

test('referidorDeAlta: `ref` primero, luego `invita`, luego lo guardado; todo pasa por la misma criba', () => {
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: 'socio-amiga', guardado: null, nuevoId: 'soc-nueva' }), 'socio-amiga');
  assert.equal(referidorDeAlta({ refValido: 'socio-ref', invitaUrl: 'socio-amiga', guardado: null, nuevoId: 'soc-nueva' }), 'socio-ref');
  // Volviendo del correo en la misma pestaña, la URL ya no lo lleva: vale lo guardado.
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: null, guardado: 'socio-amiga', nuevoId: 'soc-nueva' }), 'socio-amiga');
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: null, guardado: null, nuevoId: 'soc-nueva' }), null);
});

test('referidorDeAlta: un `invita` con forma rota no sale; nadie se invita a sí misma', () => {
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: '../x', guardado: null, nuevoId: 'soc-nueva' }), null);
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: '../x', guardado: 'socio-amiga', nuevoId: 'soc-nueva' }), 'socio-amiga');
  assert.equal(referidorDeAlta({ refValido: null, invitaUrl: 'soc-nueva', guardado: null, nuevoId: 'soc-nueva' }), null);
});
