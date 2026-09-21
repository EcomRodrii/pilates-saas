import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// POST /api/notifications/prueba-push manda un push de verdad desde el editor
// de textos. Lo que no puede cambiar, comprobado sobre el FUENTE (la ruta
// arrastra web-push y Supabase), mismo idioma que `subscribe-endpoint.test.ts`.

const fuente = readFileSync(join(import.meta.dirname, '../../app/api/notifications/prueba-push/route.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

test('solo la propietaria, igual que la RLS de los textos', () => {
  assert.match(fuente, /sesion\.rol !== 'PROPIETARIO'[\s\S]{0,120}status: 403/);
});

test('siempre a los dispositivos de quien lo pide, nunca a alguien del body', () => {
  assert.match(fuente, /destinatario: \{ role: 'PROPIETARIO', userId: sesion\.userId \}/);
  assert.ok(!/b\??\.(userId|destinatario|studioId)/.test(fuente), 'el cuerpo de la petición no puede elegir destinatario ni estudio');
});

test('con límite de envíos y con la misma validación que el panel', () => {
  assert.match(fuente, /rateLimit\(`prueba-push:\$\{sesion\.userId\}`/);
  assert.match(fuente, /validarTexto\(evento, texto\)[\s\S]{0,120}status: 400/);
});

test('no guarda nada: ni el texto ni una notificación', () => {
  assert.ok(!/\.(insert|upsert|update|delete)\(/.test(fuente), 'una prueba no escribe en la base');
});
