import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rangoAnios, hrefDeRedSocial, hrefDeWeb } from './formato.ts';

test('sin fecha de fin: "Actualidad"', () => {
  assert.equal(rangoAnios('2023-03-01', null), '2023 — Actualidad');
});

test('con fecha de fin en otro año: rango', () => {
  assert.equal(rangoAnios('2023-03-01', '2025-06-01'), '2023 — 2025');
});

test('mismo año de inicio y fin: un solo año', () => {
  assert.equal(rangoAnios('2024-01-01', '2024-11-01'), '2024');
});

test('hrefDeRedSocial: URL completa se respeta tal cual', () => {
  assert.equal(hrefDeRedSocial('https://instagram.com/ana.pilates', 'instagram.com'), 'https://instagram.com/ana.pilates');
});

test('hrefDeRedSocial: handle con @ construye la URL de Instagram', () => {
  assert.equal(hrefDeRedSocial('@ana.pilates', 'instagram.com'), 'https://instagram.com/ana.pilates');
});

test('hrefDeRedSocial: handle sin @ construye la URL de LinkedIn', () => {
  assert.equal(hrefDeRedSocial('ana-pilates', 'linkedin.com'), 'https://linkedin.com/in/ana-pilates');
});

test('hrefDeRedSocial: dominio sin protocolo se le añade https', () => {
  assert.equal(hrefDeRedSocial('instagram.com/ana.pilates', 'instagram.com'), 'https://instagram.com/ana.pilates');
});

test('hrefDeWeb: sin protocolo, se le añade https', () => {
  assert.equal(hrefDeWeb('anapilates.com'), 'https://anapilates.com');
});

test('hrefDeWeb: con protocolo, se respeta tal cual', () => {
  assert.equal(hrefDeWeb('http://anapilates.com'), 'http://anapilates.com');
});
