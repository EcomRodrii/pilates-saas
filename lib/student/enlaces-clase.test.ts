import test from 'node:test';
import assert from 'node:assert/strict';
import { plataformaCalendario, instantesDeClase, urlCalendario, type ClaseParaEnlace } from './enlaces-clase.ts';

// «+ Calendario» mandaba SIEMPRE a la plantilla de Google Calendar.
//
// ⚠️ En Android está bien: el enlace lo recoge la app de Google Calendar que
// viene instalada. En un iPhone no hay Google Calendar salvo que la alumna lo
// haya instalado, así que abría una PÁGINA WEB de Google pidiéndole iniciar
// sesión — para meter la clase en el calendario que ya usa, que es el de Apple.
// El único sitio donde de verdad quería el evento era al que ese enlace no
// llegaba.

const clase: ClaseParaEnlace = {
  fecha: '2026-09-15', hora: '10:00', duracionMin: 50, nombre: 'Reformer', sala: 'Sala 1',
};

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1',
  // ⚠️ iPadOS 13+ se anuncia como `Macintosh`. Cae en 'apple' igual, que es
  // donde debe: Calendario de Apple abre el `.ics`.
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
};

test('un iPhone va al calendario de Apple, no a una página de Google', () => {
  assert.equal(plataformaCalendario(UA.iphone), 'apple');
});

test('un iPad, que se hace pasar por Mac, también', () => {
  assert.equal(plataformaCalendario(UA.ipad), 'apple');
});

test('un Mac abre el .ics con Calendario', () => {
  assert.equal(plataformaCalendario(UA.mac), 'apple');
});

test('Android y Windows siguen yendo a Google Calendar', () => {
  assert.equal(plataformaCalendario(UA.android), 'google');
  assert.equal(plataformaCalendario(UA.windows), 'google');
});

test('los instantes salen de fecha + hora + duración, y el fin es el real', () => {
  const { inicio, fin } = instantesDeClase(clase);
  // 50 minutos exactos entre los dos, sea cual sea la zona de quien lo mire.
  assert.equal(new Date(fin).getTime() - new Date(inicio).getTime(), 50 * 60_000);
  // Y la hora de pared es la de la clase en la zona del navegador.
  assert.equal(new Date(inicio).getHours(), 10);
  assert.equal(new Date(inicio).getMinutes(), 0);
});

test('una clase que cruza la medianoche no se queda en el día anterior', () => {
  const nocturna: ClaseParaEnlace = { ...clase, hora: '23:40', duracionMin: 50 };
  const { inicio, fin } = instantesDeClase(nocturna);
  assert.equal(new Date(fin).getTime() - new Date(inicio).getTime(), 50 * 60_000);
  assert.equal(new Date(fin).getDate(), new Date(inicio).getDate() + 1);
});

test('la plantilla de Google sigue llevando lo que tiene que llevar', () => {
  const u = new URL(urlCalendario(clase, 'Estudio Alma', 'Calle Larios 1'));
  assert.equal(u.hostname, 'calendar.google.com');
  assert.equal(u.searchParams.get('text'), 'Reformer · Estudio Alma');
  assert.equal(u.searchParams.get('location'), 'Calle Larios 1');
  assert.match(u.searchParams.get('dates') ?? '', /^\d{8}T\d{6}Z\/\d{8}T\d{6}Z$/);
});
