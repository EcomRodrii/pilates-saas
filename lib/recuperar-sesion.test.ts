import test from 'node:test';
import assert from 'node:assert/strict';
import { esJwtCaducado, decidirRecuperacionJwt, VENTANA_ANTIBUCLE_MS } from './recuperar-sesion.ts';

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
