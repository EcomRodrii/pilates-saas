import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mismoToken, obtenerOFirmarEnlace } from './enlaces.ts';
import { firmarTokenInstructora, verificarTokenInstructora } from './token.ts';

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

// ── obtenerOFirmarEnlace: una invitación no se reutiliza entre roles ─────────

/** Un cliente de Supabase falso con la fila vigente de `instructor_enlaces_vigentes` y lo que se escribe en ella. */
function clienteFalso(token: string | null) {
  const escrito: { token?: string }[] = [];
  const admin = {
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: token ? { token } : null }) }) }) }),
      upsert: async (fila: { token: string }) => { escrito.push(fila); return { error: null }; },
    }),
  };
  return { admin: admin as never, escrito };
}

test('una invitación firmada por la propietaria NO se le entrega a un MANAGER: se firma una nueva a su nombre', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const deLaPropietaria = firmarTokenInstructora('ins-1', 'studio-1', 'invitacion', 'PROPIETARIO');
  const { admin, escrito } = clienteFalso(deLaPropietaria);
  const token = await obtenerOFirmarEnlace(admin, 'studio-1', 'ins-1', 'invitacion', 'MANAGER');
  assert.notEqual(token, deLaPropietaria, 'no reutiliza el token de otro rol');
  assert.equal(verificarTokenInstructora(token, 'invitacion')?.ref, 'MANAGER', 'el nuevo lleva el rol de quien lo pide');
  assert.equal(escrito.length, 1, 'y queda como el vigente (el anterior, revocado)');
});

test('la misma persona que ya invitó recibe el mismo enlace (no se regenera por reenviar)', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const suyo = firmarTokenInstructora('ins-1', 'studio-1', 'invitacion', 'PROPIETARIO');
  const { admin, escrito } = clienteFalso(suyo);
  assert.equal(await obtenerOFirmarEnlace(admin, 'studio-1', 'ins-1', 'invitacion', 'PROPIETARIO'), suyo);
  assert.equal(escrito.length, 0, 'sin escribir nada');
});

test('los enlaces sin rol (disponibilidad, reportar baja) se siguen reutilizando como siempre', async () => {
  process.env.SUSTITUCION_TOKEN_SECRET ||= 'secreto-de-prueba';
  const vigente = firmarTokenInstructora('ins-1', 'studio-1', 'disponibilidad');
  const { admin, escrito } = clienteFalso(vigente);
  assert.equal(await obtenerOFirmarEnlace(admin, 'studio-1', 'ins-1', 'disponibilidad'), vigente);
  assert.equal(escrito.length, 0);
});
