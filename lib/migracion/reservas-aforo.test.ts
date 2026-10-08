import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resumirSobreAforo, type SesionAforo } from './reservas-aforo.ts';

const AHORA = Date.parse('2026-10-09T10:00:00Z');
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 16);
const ses = (aforo: number, inicio: string, nombre = 'Mat'): SesionAforo => ({ aforo, inicioMs: Date.parse(inicio), nombre });

test('una clase futura con 16 reservas para 12 plazas se cuenta y se describe', () => {
  const r = resumirSobreAforo(new Map([['a', 16]]), new Map([['a', ses(12, '2026-10-12T06:00:00Z', 'Mat Suave')]]), new Set(['a']), AHORA, fmt);
  assert.equal(r.futuras, 1);
  assert.equal(r.pasadas, 0);
  assert.deepEqual(r.detalle, ['Mat Suave · 2026-10-12T06:00: 16 reservas para 12 plazas']);
});

test('una clase pasada por encima del aforo es historial: se cuenta aparte y no sale en el detalle', () => {
  const r = resumirSobreAforo(new Map([['a', 14]]), new Map([['a', ses(12, '2026-09-01T06:00:00Z')]]), new Set(['a']), AHORA, fmt);
  assert.deepEqual([r.futuras, r.pasadas, r.detalle.length], [0, 1, 0]);
});

test('solo cuentan las clases que toca el archivo: una que ya venía pasada de aforo no se le achaca', () => {
  const r = resumirSobreAforo(new Map([['vieja', 20]]), new Map([['vieja', ses(12, '2026-10-12T06:00:00Z')]]), new Set(), AHORA, fmt);
  assert.equal(r.futuras, 0);
});

test('justo en el aforo no es sobreaforo; sin aforo definido (0) tampoco', () => {
  const m = new Map([['a', ses(12, '2026-10-12T06:00:00Z')], ['b', ses(0, '2026-10-12T06:00:00Z')]]);
  const r = resumirSobreAforo(new Map([['a', 12], ['b', 5]]), m, new Set(['a', 'b']), AHORA, fmt);
  assert.equal(r.futuras, 0);
});

test('el detalle ordena por exceso y se acota', () => {
  const sesiones = new Map<string, SesionAforo>();
  const ocupadas = new Map<string, number>();
  for (let i = 0; i < 8; i++) { sesiones.set(`s${i}`, ses(10, '2026-10-12T06:00:00Z', `C${i}`)); ocupadas.set(`s${i}`, 11 + i); }
  const r = resumirSobreAforo(ocupadas, sesiones, new Set(sesiones.keys()), AHORA, fmt, 3);
  assert.equal(r.futuras, 8);
  assert.equal(r.detalle.length, 3);
  assert.ok(r.detalle[0].startsWith('C7'));
});
