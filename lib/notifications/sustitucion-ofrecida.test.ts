// «Te piden cubrir una clase»: el push que lleva a la instructora a la app del
// estudio cuando el motor le pregunta. Tres sitios lo sostienen (catálogo,
// emisor y la llamada en `contactarCandidata`) y con uno roto no llega nada.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTOS, REGLAS, plantillaDe, render } from './catalog.ts';

test('sustitucion.ofrecida va solo por PUSH y a la instructora del evento', () => {
  const r = REGLAS[EVENTOS.SUSTITUCION_OFRECIDA];
  assert.deepEqual(r.canales, ['PUSH'], 'el email con el enlace ya lo manda contactarCandidata');
  assert.equal(r.audiencia, 'instructora-del-evento');
});

test('se pinta entero con los datos de la clase y lleva a «Hoy» de la app del estudio', () => {
  const p = plantillaDe(EVENTOS.SUSTITUCION_OFRECIDA, 'INSTRUCTOR');
  assert.ok(p, 'sin plantilla para INSTRUCTOR');
  const datos = { clase: 'Pilates Mat', cuando: 'jueves 18 sep, 10:00', sala: ' en Sala Mat', slug: 'pilates-boutique', sesionId: 's-1' };
  assert.equal(render(p.title, datos), 'Te piden cubrir una clase');
  assert.equal(render(p.body, datos), 'Pilates Mat el jueves 18 sep, 10:00 en Sala Mat. ¿Puedes cubrirla?');
  assert.equal(p.deepLink?.(datos), '/portal/pilates-boutique/equipo');
});

test('los huecos de la plantilla son los que manda el emisor (ctxSesion)', () => {
  const p = plantillaDe(EVENTOS.SUSTITUCION_OFRECIDA, 'INSTRUCTOR')!;
  const huecos = [...`${p.title} ${p.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(huecos, ['clase', 'cuando', 'sala']);
  const emit = readFileSync(join(import.meta.dirname, 'emit.ts'), 'utf8');
  const ctx = emit.slice(emit.indexOf('async function ctxSesion'), emit.indexOf('async function ctxSesion') + 1200);
  for (const hueco of huecos) assert.match(ctx, new RegExp(`\\b${hueco}:`), `ctxSesion no manda {${hueco}}`);
});

test('el motor la emite al preguntar a la candidata, y no en el recordatorio', () => {
  const contacto = readFileSync(join(import.meta.dirname, '..', 'sustituciones', 'contacto.ts'), 'utf8');
  const bloque = contacto.slice(contacto.indexOf('export async function contactarCandidata'), contacto.indexOf('export async function contactarDesde'));
  assert.match(bloque, /if \(!params\.esRecordatorio\) \{\s*const \{ emitirSustitucionOfrecida \}/);
});
