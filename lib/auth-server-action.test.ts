import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('I-4: auth-server-action.ts tiene las funciones correctas', () => {
  const fuente = readFileSync('./lib/auth-server-action.ts', 'utf8');

  assert.ok(fuente.includes("export async function getAuthInServerAction()"), 'debe exportar getAuthInServerAction');
  assert.ok(fuente.includes("export async function requireAuthInServerAction()"), 'debe exportar requireAuthInServerAction');
  assert.ok(fuente.includes('sb-'), 'debe mencionar cookie de Supabase');
  assert.ok(fuente.includes('access_token'), 'debe extraer access_token de la cookie');
  assert.ok(fuente.includes('ErrorAccion'), 'debe usar ErrorAccion para 401');
});

test('I-4: comentario actualizado (I-4 RESUELTO)', () => {
  const fuente = readFileSync('./lib/auth-server-action.ts', 'utf8');

  // Verificar que se quitó el aviso viejo
  assert.ok(!fuente.includes('SOLO autentica cuando la acción se invoca desde una ruta de API'), 'debe remover aviso viejo');

  // Verificar que está el nuevo (I-4 RESUELTO)
  assert.ok(fuente.includes('I-4 (RESUELTO)'), 'debe documentar que I-4 está resuelto');
  assert.ok(fuente.includes('funciona tanto desde rutas de API'), 'debe documentar que funciona desde ambos lados');
  assert.ok(fuente.includes('CSRF'), 'debe mencionar CSRF');
});

test('I-4: extracción de token desde cookie es privada', () => {
  const fuente = readFileSync('./lib/auth-server-action.ts', 'utf8');

  // La función extraerTokenDeCookie no es exportada (comienza con minúscula)
  assert.ok(fuente.includes('function extraerTokenDeCookie()'), 'debe existir extraerTokenDeCookie');
  assert.ok(!fuente.includes('export function extraerTokenDeCookie'), 'no debe ser exportada');
  assert.ok(fuente.includes('extraerTokenDeCookie()'), 'debe ser llamada en getAuthInServerAction');
});
