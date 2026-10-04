import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enlaceCompartirClase, textoCompartirClase } from './compartir-clase.ts';

test('textoCompartirClase: la frase con la clase, el día y la hora', () => {
  const hoy = '2026-10-04';
  assert.equal(textoCompartirClase({ nombre: 'Reformer', fecha: '2026-10-04', hora: '18:00' }, hoy), '¿Te vienes a Reformer hoy a las 18:00?');
  assert.equal(textoCompartirClase({ nombre: 'Reformer', fecha: '2026-10-05', hora: '09:30' }, hoy), '¿Te vienes a Reformer mañana a las 09:30?');
  assert.equal(textoCompartirClase({ nombre: 'Mat', fecha: '2026-10-07', hora: '19:00' }, hoy), '¿Te vienes a Mat el miércoles 7 de octubre a las 19:00?');
  // Una fecha rota no deja un «el » colgando.
  assert.equal(textoCompartirClase({ nombre: 'Mat', fecha: 'nada', hora: '19:00' }, hoy), '¿Te vienes a Mat a las 19:00?');
});

test('enlaceCompartirClase: la página pública del estudio, desde donde esté la app', () => {
  assert.equal(enlaceCompartirClase('https://www.tentare.app', 'estudio-alma'), 'https://www.tentare.app/reservar/estudio-alma');
  assert.equal(enlaceCompartirClase('http://localhost:3000/', 'a b'), 'http://localhost:3000/reservar/a%20b');
});
