import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cabeceraCookieBorrada, cabeceraCookieDispositivo, caducidadDesde, DIAS_DISPOSITIVO_CONFIANZA, formatoTokenValido,
  ipParaGuardar, leerCookie, nombreCookieDispositivo, nombreDispositivo, RUTA_COOKIE_DISPOSITIVO, sesionDelToken,
} from './dispositivo-confianza-reglas.ts';

function tokenCon(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `cabecera.${b64}.firma`;
}

test('caduca 30 días después', () => {
  const ahora = new Date('2026-10-03T10:00:00Z');
  assert.equal(DIAS_DISPOSITIVO_CONFIANZA, 30);
  assert.equal(caducidadDesde(ahora).toISOString(), '2026-11-02T10:00:00.000Z');
});

test('session_id del token: solo un uuid, y nada si el token no se deja leer', () => {
  const id = '3f2b8c1e-5a6d-4e7f-8a9b-0c1d2e3f4a5b';
  assert.equal(sesionDelToken(tokenCon({ session_id: id, aal: 'aal1' })), id);
  assert.equal(sesionDelToken(tokenCon({ session_id: "x' or 1=1" })), null);
  assert.equal(sesionDelToken(tokenCon({ aal: 'aal1' })), null);
  assert.equal(sesionDelToken('no-es-un-jwt'), null);
  assert.equal(sesionDelToken('a.%%%.c'), null);
  assert.equal(sesionDelToken(null), null);
});

test('formato del token: 32 bytes en base64url y nada más', () => {
  assert.equal(formatoTokenValido('A'.repeat(43)), true);
  assert.equal(formatoTokenValido('A'.repeat(42)), false);
  assert.equal(formatoTokenValido('A'.repeat(42) + '='), false);
  assert.equal(formatoTokenValido(null), false);
});

test('la cookie va con el nombre de la cuenta: dos personas en el mismo iPad no se pisan', () => {
  assert.notEqual(nombreCookieDispositivo('aaaa'), nombreCookieDispositivo('bbbb'));
  const cabecera = `${nombreCookieDispositivo('aaaa')}=uno; otra=2; ${nombreCookieDispositivo('bbbb')}=dos`;
  assert.equal(leerCookie(cabecera, nombreCookieDispositivo('aaaa')), 'uno');
  assert.equal(leerCookie(cabecera, nombreCookieDispositivo('bbbb')), 'dos');
  assert.equal(leerCookie(cabecera, nombreCookieDispositivo('cccc')), null);
  assert.equal(leerCookie(null, 'x'), null);
});

test('la cookie: HttpOnly, SameSite=Strict, solo en las rutas del dispositivo, 30 días, Secure por https', () => {
  const c = cabeceraCookieDispositivo('tentare_disp_aaaa', 'TOKEN', { segura: true });
  assert.match(c, /^tentare_disp_aaaa=TOKEN; /);
  assert.ok(c.includes('HttpOnly'));
  assert.ok(c.includes('SameSite=Strict'));
  assert.ok(c.includes(`Path=${RUTA_COOKIE_DISPOSITIVO}`));
  assert.ok(c.includes(`Max-Age=${30 * 24 * 60 * 60}`));
  assert.ok(c.includes('Secure'));
  assert.ok(!cabeceraCookieDispositivo('n', 'T', { segura: false }).includes('Secure'));
  const borrada = cabeceraCookieBorrada('tentare_disp_aaaa', { segura: true });
  assert.match(borrada, /^tentare_disp_aaaa=; /);
  assert.ok(borrada.includes('Max-Age=0'));
  assert.ok(borrada.includes(`Path=${RUTA_COOKIE_DISPOSITIVO}`), 'tiene que ir a la misma ruta, o no la borra');
});

test('nombre del dispositivo: lo que la persona reconoce en la lista', () => {
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
  const chromeWin = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
  const edge = `${chromeWin} Edg/130.0.0.0`;
  const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
  assert.equal(nombreDispositivo(iphone), 'iPhone · Safari');
  assert.equal(nombreDispositivo(mac), 'Mac · Safari');
  // Un iPad moderno dice ser un Mac: lo delata la pantalla táctil.
  assert.equal(nombreDispositivo(mac, true), 'iPad · Safari');
  assert.equal(nombreDispositivo(chromeWin), 'Windows · Chrome');
  assert.equal(nombreDispositivo(edge), 'Windows · Edge');
  assert.equal(nombreDispositivo(android), 'Móvil Android · Chrome');
  assert.equal(nombreDispositivo(null), 'Ordenador');
});

test('IP: se guarda para enseñarla, nunca «unknown»', () => {
  assert.equal(ipParaGuardar('203.0.113.7'), '203.0.113.7');
  assert.equal(ipParaGuardar('unknown'), null);
  assert.equal(ipParaGuardar(''), null);
  assert.equal(ipParaGuardar('x'.repeat(100))?.length, 64);
});
