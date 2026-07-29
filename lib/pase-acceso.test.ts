import { test } from 'node:test';
import assert from 'node:assert/strict';

// El secreto se lee de forma perezosa dentro del módulo, así que basta con
// ponerlo antes de la primera llamada — no hace falta tocar el import.
process.env.SUSTITUCION_TOKEN_SECRET = 'secreto-de-pruebas-del-pase';

const {
  ventanaDelPase, paseVigente, minutosParaActivarse,
  firmarPase, verificarPase, codigoCorto, codigoCortoValido, normalizarCodigo,
} = await import('./pase-acceso.ts');

const INICIO = new Date('2026-08-12T18:30:00.000Z');
const en = (min: number) => new Date(INICIO.getTime() + min * 60_000);

// ── Ventana ──────────────────────────────────────────────────────────────────

test('el pase se activa una hora antes y se apaga quince minutos después', () => {
  const { desde, hasta } = ventanaDelPase(INICIO);
  assert.equal(desde.toISOString(), '2026-08-12T17:30:00.000Z');
  assert.equal(hasta.toISOString(), '2026-08-12T18:45:00.000Z');
});

test('fuera de la ventana no hay pase', () => {
  assert.equal(paseVigente(INICIO, en(-61)), false, 'una hora y un minuto antes');
  assert.equal(paseVigente(INICIO, en(-60)), true, 'justo al abrirse');
  assert.equal(paseVigente(INICIO, en(0)), true, 'a la hora de la clase');
  assert.equal(paseVigente(INICIO, en(15)), true, 'justo al cerrarse');
  assert.equal(paseVigente(INICIO, en(16)), false, 'pasado el cuarto de hora');
});

test('dice cuánto falta para poder enseñarlo', () => {
  assert.equal(minutosParaActivarse(INICIO, en(-90)), 30);
  assert.equal(minutosParaActivarse(INICIO, en(-60)), 0);
  assert.equal(minutosParaActivarse(INICIO, en(5)), 0, 'ya empezada, no faltan minutos');
});

// ── Token del QR ─────────────────────────────────────────────────────────────

test('un pase recién firmado se verifica y devuelve su reserva', () => {
  const t = firmarPase('res-1', 'studio-1', 1_000_000);
  assert.deepEqual(verificarPase(t, 1_000_000), { reservaId: 'res-1', studioId: 'studio-1' });
});

// Es la razón de que el token exista: una captura reenviada tiene que morir
// antes de servirle a nadie para cruzar la puerta.
test('el pase caduca a los dos minutos', () => {
  const t = firmarPase('res-1', 'studio-1', 0);
  assert.notEqual(verificarPase(t, 119_000), null, 'a los 119 s sigue valiendo');
  assert.equal(verificarPase(t, 120_001), null, 'pasados los 120 s ya no');
});

test('un pase manipulado no cuela', () => {
  const t = firmarPase('res-1', 'studio-1', 0);
  const [payload, sig] = t.split('.');
  // Cambiar la reserva por otra manteniendo la firma.
  const otro = Buffer.from(JSON.stringify({ r: 'res-2', s: 'studio-1', exp: 999_999_999_999 })).toString('base64url');
  assert.equal(verificarPase(`${otro}.${sig}`, 0), null, 'payload cambiado');
  assert.equal(verificarPase(`${payload}.${sig}x`, 0), null, 'firma alargada');
  assert.equal(verificarPase(payload, 0), null, 'sin firma');
  assert.equal(verificarPase('', 0), null);
  assert.equal(verificarPase(null, 0), null);
});

test('cada reserva y cada estudio tienen su propio pase', () => {
  const a = firmarPase('res-1', 'studio-1', 0);
  const b = firmarPase('res-2', 'studio-1', 0);
  const c = firmarPase('res-1', 'studio-2', 0);
  assert.notEqual(a, b);
  assert.notEqual(a, c);
});

// ── Código corto ─────────────────────────────────────────────────────────────

test('el código corto son 6 caracteres del alfabeto sin ambigüedades', () => {
  const c = codigoCorto('res-1');
  assert.equal(c.length, 6);
  assert.match(c, /^[23456789ABCDEFGHJKLMNPQRTVWXYZ]{6}$/);
  // Nada que se confunda al dictarlo por teléfono.
  assert.doesNotMatch(c, /[IOU105S]/);
});

test('el código corto es estable: no cambia mientras se teclea', () => {
  assert.equal(codigoCorto('res-1'), codigoCorto('res-1'));
});

test('el código corto distingue reservas', () => {
  assert.notEqual(codigoCorto('res-1'), codigoCorto('res-2'));
});

// La instructora lo teclea deprisa y mirando a otro sitio.
test('se acepta tecleado como salga: minúsculas, espacios o guiones', () => {
  const c = codigoCorto('res-1');
  const partido = `${c.slice(0, 3)}-${c.slice(3)}`.toLowerCase();
  assert.equal(normalizarCodigo(partido), c);
  assert.equal(codigoCortoValido(partido, 'res-1'), true);
  assert.equal(codigoCortoValido(` ${c.toLowerCase()} `, 'res-1'), true);
});

test('el código de otra reserva no vale', () => {
  assert.equal(codigoCortoValido(codigoCorto('res-2'), 'res-1'), false);
  assert.equal(codigoCortoValido('ABC', 'res-1'), false, 'demasiado corto');
  assert.equal(codigoCortoValido('', 'res-1'), false);
});
