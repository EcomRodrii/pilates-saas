import test from 'node:test';
import assert from 'node:assert/strict';
import { esJwtCaducado, esSesionAnonimaInesperada, decidirRecuperacionJwt, VENTANA_ANTIBUCLE_MS } from './recuperar-sesion.ts';

// A-3 (auditoría 20-ago): tabla de verdad de la recuperación de sesión.

// ── esJwtCaducado ───────────────────────────────────────────────────────────

test('el error real de PostgREST: code PGRST303', () => {
  assert.equal(esJwtCaducado({ code: 'PGRST303', message: 'JWT expired' }), true);
});

test('el mensaje solo también basta (por si el code no viaja)', () => {
  assert.equal(esJwtCaducado({ message: 'JWT expired' }), true);
  assert.equal(esJwtCaducado(new Error('jwt expired')), true);
});

test('⚠️ otros errores de permisos NO son sesión caducada', () => {
  // Confundir un 42501 (RLS de verdad denegando) con un token caducado haría
  // recargar en bucle una pantalla a la que ese rol nunca tuvo acceso.
  assert.equal(esJwtCaducado({ code: '42501', message: 'permission denied for table socios' }), false);
  assert.equal(esJwtCaducado({ code: 'PGRST301', message: 'JWS invalid' }), false);
  assert.equal(esJwtCaducado({ message: 'row-level security violation' }), false);
  assert.equal(esJwtCaducado(null), false);
  assert.equal(esJwtCaducado('cualquier cosa'), false);
});

// ── esSesionAnonimaInesperada (JAVASCRIPT-NEXTJS-29) ────────────────────────

test('42501 con el hint nombrando a "anon": la petición viajó sin sesión', () => {
  assert.equal(esSesionAnonimaInesperada({
    code: '42501', message: 'permission denied for table tipos_clase',
    hint: 'Grant the required privileges to the current role with: GRANT SELECT ON public.tipos_clase TO anon;',
  }), true);
});

test('⚠️ un 42501 SIN mención de "anon" en el hint es RLS de verdad denegando: NO es sesión caducada', () => {
  // Este es justo el caso que ya cubre esJwtCaducado==false — una usuaria
  // autenticada sin permiso real. Confundirlo la mandaría a "reintenta, ya
  // se está arreglando" cuando en realidad nunca va a tener acceso.
  assert.equal(esSesionAnonimaInesperada({
    code: '42501', message: 'permission denied for table socios',
    hint: 'Grant the required privileges to the current role with: GRANT SELECT ON public.socios TO authenticated;',
  }), false);
  assert.equal(esSesionAnonimaInesperada({ code: '42501', message: 'permission denied for table socios' }), false);
});

test('otros códigos, aunque mencionen "anon" en cualquier campo, no cuentan', () => {
  assert.equal(esSesionAnonimaInesperada({ code: 'PGRST303', hint: 'to anon' }), false);
  assert.equal(esSesionAnonimaInesperada(null), false);
  assert.equal(esSesionAnonimaInesperada('cualquier cosa'), false);
});

// ── decidirRecuperacionJwt ──────────────────────────────────────────────────

const AHORA = 1_000_000_000;

test('⚠️ sin sesión local no se hace NADA: jamás mandar a /login a una visitante pública', () => {
  assert.equal(
    decidirRecuperacionJwt({ haySesionLocal: false, refreshOk: false, ultimaRecargaMs: null, ahoraMs: AHORA }),
    'nada',
  );
});

test('el caso feliz: refresh OK y sin recarga reciente → recargar', () => {
  assert.equal(
    decidirRecuperacionJwt({ haySesionLocal: true, refreshOk: true, ultimaRecargaMs: null, ahoraMs: AHORA }),
    'recargar',
  );
});

test('refresh fallido (refresh token muerto) → /login con motivo, no un panel vacío', () => {
  assert.equal(
    decidirRecuperacionJwt({ haySesionLocal: true, refreshOk: false, ultimaRecargaMs: null, ahoraMs: AHORA }),
    'login',
  );
});

test('⚠️ anti-bucle: segunda caducidad en < 5 min → /login, nunca recargar en círculo', () => {
  assert.equal(
    decidirRecuperacionJwt({
      haySesionLocal: true, refreshOk: true,
      ultimaRecargaMs: AHORA - (VENTANA_ANTIBUCLE_MS - 1000), ahoraMs: AHORA,
    }),
    'login',
  );
});

test('una recarga vieja no cuenta: pasada la ventana se vuelve a recargar con normalidad', () => {
  assert.equal(
    decidirRecuperacionJwt({
      haySesionLocal: true, refreshOk: true,
      ultimaRecargaMs: AHORA - (VENTANA_ANTIBUCLE_MS + 1000), ahoraMs: AHORA,
    }),
    'recargar',
  );
});
