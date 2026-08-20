import { test } from 'node:test';
import assert from 'node:assert/strict';

import { aFechaCal, eventoIcs, nombreIcs, urlGoogleCalendar } from './calendario-ics.ts';

const AHORA = new Date('2026-09-01T08:00:00.000Z');
const BASE = {
  id: 'ses-1',
  inicio: '2026-09-04T16:00:00.000Z',
  fin: '2026-09-04T16:50:00.000Z',
  titulo: 'Reformer suave',
  instructora: 'Marta Gómez',
  sala: 'Sala 2',
  estudioNombre: 'Estudio Tentada',
  estudioDireccion: 'Carrer de la Pau, 12',
};

test('aFechaCal: ISO → el formato UTC de iCalendar, sin milisegundos', () => {
  assert.equal(aFechaCal('2026-09-04T16:00:00.000Z'), '20260904T160000Z');
});

test('aFechaCal: una hora local se convierte a UTC, no se recorta', () => {
  // 18:00 en Madrid (verano) son las 16:00Z. Un `.ics` con la hora de pared y
  // sin zona mete la clase dos horas tarde en el calendario de la socia.
  assert.equal(aFechaCal('2026-09-04T18:00:00+02:00'), '20260904T160000Z');
});

test('eventoIcs: trae lo que RFC 5545 exige, y con CRLF', () => {
  const ics = eventoIcs(BASE, AHORA);
  // Sin UID ni DTSTAMP, Outlook puede rechazar el evento sin decir por qué.
  assert.match(ics, /\r\nUID:ses-1@estudio-tentada\r\n/);
  assert.match(ics, /\r\nDTSTAMP:20260901T080000Z\r\n/);
  assert.match(ics, /\r\nDTSTART:20260904T160000Z\r\n/);
  assert.match(ics, /\r\nDTEND:20260904T165000Z\r\n/);
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR'));
  assert.equal(ics.includes('\n\n'), false);
});

test('eventoIcs: ⚠️ la coma de la dirección va ESCAPADA', () => {
  // Sin escapar, «Carrer de la Pau, 12» parte LOCATION en dos valores y el
  // evento entra con la dirección a medias. Es el fallo que no se ve mirando
  // el fichero, solo importándolo.
  const ics = eventoIcs(BASE, AHORA);
  assert.match(ics, /LOCATION:Estudio Tentada\\, Carrer de la Pau\\, 12/);
});

test('eventoIcs: un salto de línea en el título no rompe la línea del fichero', () => {
  const ics = eventoIcs({ ...BASE, titulo: 'Reformer\nsuave' }, AHORA);
  assert.match(ics, /SUMMARY:Reformer\\nsuave/);
  // Una línea de más aquí es un fichero inválido, no un detalle estético.
  assert.equal(ics.split('\r\n').filter((l) => l.startsWith('SUMMARY')).length, 1);
});

test('eventoIcs: sin instructora ni sala, no se escribe una descripción vacía', () => {
  const ics = eventoIcs({ ...BASE, instructora: undefined, sala: undefined }, AHORA);
  assert.equal(ics.includes('DESCRIPTION:'), false);
});

test('eventoIcs: el UID es estable por sesión — reimportar actualiza, no duplica', () => {
  const a = eventoIcs(BASE, AHORA);
  const b = eventoIcs(BASE, new Date('2026-09-02T09:30:00.000Z'));
  const uid = (s: string) => s.split('\r\n').find((l) => l.startsWith('UID:'));
  assert.equal(uid(a), uid(b));
});

test('nombreIcs: legible y con la fecha, sin acentos ni espacios', () => {
  assert.equal(nombreIcs('Reformer suave', '2026-09-04T16:00:00.000Z'), 'reformer-suave-2026-09-04.ics');
  assert.equal(nombreIcs('', '2026-09-04T16:00:00.000Z'), 'clase-2026-09-04.ics');
});

// ── Enlace a Google Calendar de la ALUMNA (§6) ───────────────────────────────

const CLASE = {
  id: 'ses-1',
  inicio: '2026-09-04T16:00:00.000Z',
  fin: '2026-09-04T16:50:00.000Z',
  titulo: 'Reformer suave',
  instructora: 'Ana',
  sala: 'Sala 1',
  estudioNombre: 'Estudio Alma',
  estudioDireccion: 'Carrer de la Pau, 12',
};

test('urlGoogleCalendar lleva la clase con su hora en UTC', () => {
  const u = new URL(urlGoogleCalendar(CLASE));
  assert.equal(u.origin + u.pathname, 'https://calendar.google.com/calendar/render');
  assert.equal(u.searchParams.get('action'), 'TEMPLATE');
  assert.equal(u.searchParams.get('text'), 'Reformer suave');
  // En UTC (Z), que es lo que evita que la clase salga corrida de hora en un
  // móvil configurado en otra zona.
  assert.equal(u.searchParams.get('dates'), '20260904T160000Z/20260904T165000Z');
});

test('la ubicación va con coma, para que Google Maps la entienda', () => {
  const u = new URL(urlGoogleCalendar(CLASE));
  assert.equal(u.searchParams.get('location'), 'Estudio Alma, Carrer de la Pau, 12');
});

test('sin instructora ni sala NO se cuela «Instructora:  · Sala: »', () => {
  // Es lo que hacía la versión suelta de /reservar: construía la cadena sin
  // filtrar y el evento entraba con ese texto vacío dentro.
  const u = new URL(urlGoogleCalendar({ ...CLASE, instructora: undefined, sala: undefined }));
  assert.equal(u.searchParams.get('details'), null);
});

test('con solo instructora, el detalle no arrastra el separador', () => {
  const u = new URL(urlGoogleCalendar({ ...CLASE, sala: undefined }));
  assert.equal(u.searchParams.get('details'), 'Instructora: Ana');
});

test('sin dirección no queda un separador colgando', () => {
  const u = new URL(urlGoogleCalendar({ ...CLASE, estudioDireccion: undefined }));
  assert.equal(u.searchParams.get('location'), 'Estudio Alma');
});

test('el mismo evento sirve para el .ics y para Google', () => {
  // Misma entrada para los dos: si divergieran, la alumna vería una cosa en su
  // móvil y otra en Google.
  const ics = eventoIcs(CLASE, new Date('2026-09-01T00:00:00.000Z'));
  const u = new URL(urlGoogleCalendar(CLASE));
  assert.ok(ics.includes('DTSTART:20260904T160000Z'));
  assert.equal(u.searchParams.get('dates')?.split('/')[0], '20260904T160000Z');
});
