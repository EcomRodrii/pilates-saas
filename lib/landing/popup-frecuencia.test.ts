import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  puedeMostrar,
  REGISTRO_VACIO,
  MAX_VISTAS,
  SILENCIO_TRAS_CERRAR_MS,
  type ContextoPopup,
} from './popup-frecuencia.ts';

const AHORA = new Date('2026-08-19T12:00:00Z').getTime();

const ctx = (parcial: Partial<ContextoPopup> = {}): ContextoPopup => ({
  registro: REGISTRO_VACIO,
  vistoEnEstaSesion: false,
  autenticado: false,
  ahora: AHORA,
  ...parcial,
});

test('primera visita: se puede enseñar', () => {
  assert.equal(puedeMostrar(ctx()), true);
});

test('con sesión iniciada nunca se enseña', () => {
  // Ofrecerle «crea tu cuenta gratis» a quien ya tiene una es el anuncio más
  // molesto posible: no hay nada que pueda hacer con él.
  assert.equal(puedeMostrar(ctx({ autenticado: true })), false);
});

test('una sola vez por sesión, aunque recorra varias páginas', () => {
  assert.equal(puedeMostrar(ctx({ vistoEnEstaSesion: true })), false);
});

test('si pulsó el CTA, no vuelve a salir nunca', () => {
  const convertido = { ...REGISTRO_VACIO, convertido: true };
  assert.equal(puedeMostrar(ctx({ registro: convertido })), false);
  // Ni un año después, ni empezando sesión nueva.
  assert.equal(
    puedeMostrar(ctx({ registro: convertido, ahora: AHORA + 365 * 86_400_000 })),
    false,
  );
});

test('cerrarlo compra 30 días de silencio, y ni un minuto menos', () => {
  const cerrado = { ...REGISTRO_VACIO, vistas: 1, cerradoEn: AHORA };
  assert.equal(puedeMostrar(ctx({ registro: cerrado, ahora: AHORA + 60_000 })), false);
  assert.equal(
    puedeMostrar(ctx({ registro: cerrado, ahora: AHORA + SILENCIO_TRAS_CERRAR_MS - 1 })),
    false,
    'un milisegundo antes de cumplirse los 30 días todavía no',
  );
  assert.equal(
    puedeMostrar(ctx({ registro: cerrado, ahora: AHORA + SILENCIO_TRAS_CERRAR_MS })),
    true,
  );
});

test('tres vistas es el techo total', () => {
  const alTope = { ...REGISTRO_VACIO, vistas: MAX_VISTAS };
  // Sesión nueva y sin haberlo cerrado nunca: aun así, se acabó.
  assert.equal(puedeMostrar(ctx({ registro: alTope, ahora: AHORA + 400 * 86_400_000 })), false);
  assert.equal(puedeMostrar(ctx({ registro: { ...REGISTRO_VACIO, vistas: MAX_VISTAS - 1 } })), true);
});

test('el silencio por cierre manda aunque queden vistas por gastar', () => {
  // Las dos reglas se cumplen a la vez: no basta con que quede cupo.
  const r = { ...REGISTRO_VACIO, vistas: 1, cerradoEn: AHORA - 86_400_000 };
  assert.equal(puedeMostrar(ctx({ registro: r })), false);
});
