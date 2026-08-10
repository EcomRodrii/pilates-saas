import { test } from 'node:test';
import assert from 'node:assert/strict';
import { construirTraza, resumenTraza, ultimaRespuestaDe, type ContactoFila } from './traza.ts';

const NOMBRES = { 'ins-1': 'Ana María Ruiz', 'ins-2': 'Berta Gil' };

const fila = (p: Partial<ContactoFila> & { instructor_id: string }): ContactoFila => ({
  canal: 'email', estado: 'enviado', enviado_en: '2026-07-20T18:00:00Z', respondido_en: null, ...p,
});

test('un envío simple: canal + primer nombre, sin apellidos', () => {
  const t = construirTraza([fila({ instructor_id: 'ins-1' })], NOMBRES);
  assert.equal(t.length, 1);
  assert.equal(t[0].texto, 'Email a Ana');
  assert.equal(t[0].tipo, 'envio');
});

test('una fila con respuesta genera DOS eventos (envío + respuesta)', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: '2026-07-20T18:12:00Z' }),
  ], NOMBRES);
  assert.equal(t.length, 2);
  assert.equal(t[0].texto, 'Email a Ana');
  assert.equal(t[1].texto, 'Ana no puede');
  assert.equal(t[1].en, '2026-07-20T18:12:00Z');
});

test('aceptación: se lee como una buena noticia', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-2', estado: 'aceptado', respondido_en: '2026-07-20T18:30:00Z' }),
  ], NOMBRES);
  assert.equal(t[1].texto, 'Berta acepta cubrir la clase');
  assert.equal(t[1].tipo, 'aceptado');
});

test('ordena por hora real, no por el orden en que vengan las filas', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-2', enviado_en: '2026-07-20T18:20:00Z' }),
    fila({ instructor_id: 'ins-1', enviado_en: '2026-07-20T18:00:00Z', canal: 'whatsapp' }),
  ], NOMBRES);
  assert.deepEqual(t.map(e => e.texto), ['WhatsApp a Ana', 'Email a Berta']);
});

test('un envío fallido NO se oculta: la propietaria tiene que saberlo', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-1', canal: 'whatsapp', estado: 'fallido' }),
  ], NOMBRES);
  assert.equal(t[0].tipo, 'fallo');
  assert.match(t[0].texto, /No se pudo enviar el whatsapp a Ana/);
});

test('respondido_en ausente → no se inventa la hora de la respuesta', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: null }),
  ], NOMBRES);
  assert.equal(t.length, 1);           // solo el envío
  assert.equal(t[0].tipo, 'envio');
});

test('instructora borrada (sin nombre) → genérico, nunca el id crudo', () => {
  const t = construirTraza([fila({ instructor_id: 'ins-fantasma' })], NOMBRES);
  assert.doesNotMatch(t[0].texto, /ins-fantasma/);
  assert.match(t[0].texto, /la instructora/);
});

test('canal desconocido no rompe la traza', () => {
  const t = construirTraza([fila({ instructor_id: 'ins-1', canal: 'paloma_mensajera' })], NOMBRES);
  assert.equal(t[0].texto, 'Aviso a Ana');
});

test('sin contactos → traza vacía y resumen null', () => {
  assert.deepEqual(construirTraza([], NOMBRES), []);
  assert.equal(resumenTraza([]), null);
});

test('resumen: cuenta envíos y respuestas en singular/plural', () => {
  const uno = construirTraza([fila({ instructor_id: 'ins-1' })], NOMBRES);
  assert.equal(resumenTraza(uno), '1 aviso enviado');

  const varios = construirTraza([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: '2026-07-20T18:12:00Z' }),
    fila({ instructor_id: 'ins-2', enviado_en: '2026-07-20T18:15:00Z' }),
  ], NOMBRES);
  assert.equal(resumenTraza(varios), '2 avisos enviados · 1 respuesta');
});

test('resumen: los fallos se cuentan aparte, no como avisos enviados', () => {
  const t = construirTraza([
    fila({ instructor_id: 'ins-1' }),
    fila({ instructor_id: 'ins-2', canal: 'whatsapp', estado: 'fallido', enviado_en: '2026-07-20T18:05:00Z' }),
  ], NOMBRES);
  assert.equal(resumenTraza(t), '1 aviso enviado · 1 sin salir');
});

// ── ultimaRespuestaDe ────────────────────────────────────────────────────────

test('sin respuesta todavía: la pregunta sigue abierta', () => {
  assert.equal(ultimaRespuestaDe([fila({ instructor_id: 'ins-1' })]), null);
});

test('rechazó: no se le vuelve a preguntar aunque la sustitución siga contactando', () => {
  assert.equal(ultimaRespuestaDe([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: '2026-07-20T18:12:00Z' }),
  ]), 'rechazado');
});

test('aceptó: se le dice que la clase es suya, no que otra la cogió antes', () => {
  assert.equal(ultimaRespuestaDe([
    fila({ instructor_id: 'ins-1', estado: 'aceptado', respondido_en: '2026-07-20T18:12:00Z' }),
  ]), 'aceptado');
});

test('el nudge de WhatsApp de la MISMA ronda no reabre la pregunta ya contestada', () => {
  // Solo se marca la fila del token que se pulsó; la otra se queda en 'enviado'
  // para siempre. Mirar "la fila más reciente" volvería a preguntar.
  assert.equal(ultimaRespuestaDe([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: '2026-07-20T18:12:00Z' }),
    fila({ instructor_id: 'ins-1', canal: 'whatsapp', enviado_en: '2026-07-20T18:03:00Z' }),
  ]), 'rechazado');
});

test('si se le vuelve a preguntar DESPUÉS de contestar, la pregunta se reabre', () => {
  assert.equal(ultimaRespuestaDe([
    fila({ instructor_id: 'ins-1', estado: 'rechazado', respondido_en: '2026-07-20T18:12:00Z' }),
    fila({ instructor_id: 'ins-1', enviado_en: '2026-07-22T09:00:00Z' }),
  ]), null);
});

test('un envío fallido no cuenta como respuesta', () => {
  assert.equal(ultimaRespuestaDe([
    fila({ instructor_id: 'ins-1', canal: 'sms', estado: 'fallido', respondido_en: '2026-07-20T18:12:00Z' }),
  ]), null);
});
