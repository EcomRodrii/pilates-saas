import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENLACE_USADO, emitirInvitacion, enlaceRevocado, gastarInvitacion, mismoToken, obtenerOFirmarEnlace } from './enlaces.ts';
import { firmarTokenInstructora, firmarTokenInvitacion, verificarTokenInstructora } from './token.ts';

test('el mismo token es igual a sí mismo', () => {
  assert.equal(mismoToken('abc.def', 'abc.def'), true);
});

test('tokens de contenido distinto (misma longitud) → false', () => {
  assert.equal(mismoToken('abc.def', 'abc.xyz'), false);
});

test('tokens de longitud distinta → false (sin comparar byte a byte)', () => {
  assert.equal(mismoToken('abc', 'abc.mas.largo'), false);
});

test('cadenas vacías se consideran iguales entre sí', () => {
  assert.equal(mismoToken('', ''), true);
});

// ── Un cliente de Supabase falso ─────────────────────────────────────────────

/** La fila vigente de `instructor_enlaces_vigentes` y lo que se escribe en ella; `fallo` hace fallar el upsert. */
function clienteFalso(token: string | null, fallo = false) {
  const escrito: { token?: string; scope?: string }[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: token ? { token } : null }) }) }) }),
      upsert: async (fila: { token: string; scope: string }) => {
        if (fallo) return { error: { message: 'caído' } };
        escrito.push(fila); return { error: null };
      },
    }),
  };
  return { admin: admin as never, escrito };
}

// ── La invitación al equipo (13-oct-2026) ───────────────────────────────────

test('reenviar una invitación firma un enlace NUEVO y deja revocado el anterior', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const anterior = firmarTokenInvitacion('ins-1', 'studio-1', 'PROPIETARIO', 'INSTRUCTOR', Date.now() - 1000);
  const { admin, escrito } = clienteFalso(anterior);
  const nuevo = await emitirInvitacion(admin, 'studio-1', 'ins-1', 'PROPIETARIO', 'INSTRUCTOR');
  assert.notEqual(nuevo, anterior);
  assert.equal(escrito.length, 1);
  assert.equal(escrito[0].token, nuevo, 'el nuevo queda como el vigente');
  assert.equal(escrito[0].scope, 'invitacion');

  const conElNuevo = clienteFalso(nuevo);
  assert.equal(await enlaceRevocado(conElNuevo.admin, 'ins-1', 'invitacion', anterior), true, 'el anterior ya no vale');
  assert.equal(await enlaceRevocado(conElNuevo.admin, 'ins-1', 'invitacion', nuevo), false);
});

test('el enlace nuevo lleva quién lo pide y el rol de la ficha', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const { admin } = clienteFalso(null);
  const token = await emitirInvitacion(admin, 'studio-1', 'ins-1', 'MANAGER', 'RECEPCION');
  const claim = verificarTokenInstructora(token, 'invitacion');
  assert.equal(claim?.ref, 'MANAGER');
  assert.equal(claim?.rolFicha, 'RECEPCION');
});

test('si no se puede registrar como vigente, la invitación FALLA (no se manda un enlace que no va a valer)', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const { admin } = clienteFalso(null, true);
  await assert.rejects(emitirInvitacion(admin, 'studio-1', 'ins-1', 'PROPIETARIO', 'INSTRUCTOR'));
});

test('sin fila guardada, una invitación cuenta como revocada; disponibilidad y baja, como siempre', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const { admin } = clienteFalso(null);
  assert.equal(await enlaceRevocado(admin, 'ins-1', 'invitacion', 'x.y'), true);
  assert.equal(await enlaceRevocado(admin, 'ins-1', 'disponibilidad', 'x.y'), false);
  assert.equal(await enlaceRevocado(admin, 'ins-1', 'reportar_baja', 'x.y'), false);
});

test('canjear la invitación la deja gastada: el mismo enlace ya no vale', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const token = firmarTokenInvitacion('ins-1', 'studio-1', 'PROPIETARIO', 'INSTRUCTOR');
  const { admin, escrito } = clienteFalso(token);
  await gastarInvitacion(admin, 'studio-1', 'ins-1');
  assert.deepEqual(escrito.map(f => [f.scope, f.token]), [['invitacion', ENLACE_USADO]]);
  const gastada = clienteFalso(ENLACE_USADO);
  assert.equal(await enlaceRevocado(gastada.admin, 'ins-1', 'invitacion', token), true);
});

test('los enlaces de disponibilidad y baja se siguen reutilizando como siempre', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const vigente = firmarTokenInstructora('ins-1', 'studio-1', 'disponibilidad');
  const { admin, escrito } = clienteFalso(vigente);
  assert.equal(await obtenerOFirmarEnlace(admin, 'studio-1', 'ins-1', 'disponibilidad'), vigente);
  assert.equal(escrito.length, 0);
});
