import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// POST /api/notifications/subscribe retira las suscripciones abandonadas del
// MISMO dispositivo. Un borrado mal acotado dejaría sin avisos a otra persona,
// a otro estudio o a otro móvil suyo: se comprueba el alcance sobre el FUENTE
// (la ruta arrastra el cliente de Supabase), mismo idioma que
// `preferencias-endpoint.test.ts`.

const fuente = readFileSync(join(import.meta.dirname, '../../app/api/notifications/subscribe/route.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const post = fuente.slice(fuente.indexOf('export async function POST'), fuente.indexOf('export async function DELETE'));
const borrado = post.slice(post.indexOf(".from('push_subscription').delete()"));

test('el borrado de abandonadas va DESPUÉS de guardar la nueva', () => {
  assert.ok(post.indexOf('.upsert(') > 0 && post.indexOf('.upsert(') < post.indexOf('.delete()'),
    'si se borra antes y el upsert falla, el dispositivo se queda sin ninguna suscripción');
});

test('solo borra del mismo dispositivo, nunca la recién guardada ni una reciente', () => {
  for (const filtro of [
    ".eq('user_id', user.userId)",
    ".eq('studio_id', b.studioId)",
    ".eq('user_agent', b.userAgent)",
    ".neq('endpoint', sub.endpoint)",
    ".lt('last_used_at',",
  ]) {
    assert.ok(borrado.includes(filtro), `falta el filtro ${filtro}: el borrado alcanzaría suscripciones que no son abandonadas`);
  }
});

test('sin navegador en el cuerpo no se borra nada', () => {
  // Sin user_agent no se sabe qué es «el mismo dispositivo».
  assert.match(post, /if \(b\.userAgent\) \{[\s\S]*\.delete\(\)/);
});
