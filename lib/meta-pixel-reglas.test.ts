import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  codificarDecision, hostConPixel, leerDecision, rutaConPixel,
} from './meta-pixel-reglas.ts';

// ─────────────────────────────────────────────────────────────────────────────
// No se prueba que el píxel cargue —eso es una etiqueta y se ve mirando— sino lo
// que sale caro si falla: DÓNDE puede arrancar y CON QUÉ permiso. Un root layout
// sirve la landing, el panel, el portal de las alumnas y las páginas de reservas
// de cada estudio.
// ─────────────────────────────────────────────────────────────────────────────

test('mide la web comercial y el alta', () => {
  for (const path of [
    '/', '/precios', '/funcionalidades', '/funcionalidades/sustituciones', '/comparativa/tentare-vs-bsport',
    '/soluciones/estudio-de-yoga', '/recursos', '/glosario', '/crear-estudio',
  ]) {
    assert.equal(rutaConPixel(path), true, `${path} debería medirse`);
  }
});

test('no mide el panel, la app de alumnas ni las reservas de un estudio', () => {
  // `/reservar/<slug>` es indexable, pero es la web de una clienta, no tráfico de Tentare.
  for (const path of [
    '/dashboard', '/clientas/soc-123', '/socios/soc-123', '/cobros', '/configuracion', '/login',
    '/portal/mi-estudio', '/portal/mi-estudio/reservas', '/reservar/mi-estudio', '/interno', '/cookies',
    '/verificar-acceso', '/suscripcion',
  ]) {
    assert.equal(rutaConPixel(path), false, `${path} NO debería medirse`);
  }
});

test('el prefijo es de segmento: /precios-internos no entra por /precios', () => {
  assert.equal(rutaConPixel('/precios-internos'), false);
  assert.equal(rutaConPixel('/crear-estudio-x'), false);
});

test('solo en producción: previews y local quedan fuera', () => {
  assert.equal(hostConPixel('www.tentare.app'), true);
  assert.equal(hostConPixel('tentare.app'), true);
  assert.equal(hostConPixel('localhost'), false);
  assert.equal(hostConPixel('tentare-git-algo-ecomrodrii.vercel.app'), false);
  assert.equal(hostConPixel('tentare.app.evil.example'), false);
});

const AHORA = Date.UTC(2026, 9, 8);
const DIA = 24 * 60 * 60 * 1000;

test('la decisión se recuerda 180 días y luego vuelve a preguntarse', () => {
  const si = codificarDecision('si', AHORA);
  assert.equal(leerDecision(si, AHORA + 179 * DIA), 'si');
  assert.equal(leerDecision(si, AHORA + 181 * DIA), null);
  assert.equal(leerDecision(codificarDecision('no', AHORA), AHORA + DIA), 'no');
});

test('un dato roto o ajeno es «sin decisión», nunca un sí', () => {
  for (const raw of [null, '', 'si', '{', '{"d":"quizás","t":1}', '{"d":"si"}', '{"d":"si","t":"ayer"}']) {
    assert.equal(leerDecision(raw, AHORA), null, `${String(raw)} no debe valer`);
  }
  // Una fecha del futuro tampoco: no se puede dar por vigente algo «de mañana».
  assert.equal(leerDecision(codificarDecision('si', AHORA + DIA), AHORA), null);
});
