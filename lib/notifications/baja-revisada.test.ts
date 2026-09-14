// «El estudio ha revisado tu aviso»: el aviso de resolución de una baja de
// última hora. Tres sitios lo sostienen (catálogo, emisor y la ruta que revisa)
// y el texto no puede contar el resultado: la pantalla bloqueada la ve cualquiera.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTOS, REGLAS, plantillaDe, render } from './catalog.ts';

const RAIZ = join(import.meta.dirname, '..', '..');

test('baja.revisada va solo por PUSH y a la instructora del evento', () => {
  const r = REGLAS[EVENTOS.BAJA_REVISADA];
  assert.deepEqual(r.canales, ['PUSH']);
  assert.equal(r.audiencia, 'instructora-del-evento');
});

test('se pinta entero, lleva a «Hoy» y no dice qué decidió el estudio', () => {
  const p = plantillaDe(EVENTOS.BAJA_REVISADA, 'INSTRUCTOR');
  assert.ok(p, 'sin plantilla para INSTRUCTOR');
  const datos = { clase: 'Pilates Mat', cuando: 'jueves 18 sep, 10:00', sala: ' en Sala Mat', slug: 'pilates-boutique', sesionId: 's-1' };
  const texto = `${render(p.title, datos)} ${render(p.body, datos)}`;
  assert.equal(render(p.title, datos), 'El estudio ha revisado tu aviso');
  assert.equal(render(p.body, datos), 'Sobre tu clase de Pilates Mat del jueves 18 sep, 10:00. Lo tienes en la app.');
  assert.doesNotMatch(texto, /orden|habla|nota|justific|sanci|penaliz|motivo|salud/i);
  assert.equal(p.deepLink?.(datos), '/portal/pilates-boutique/equipo');
});

test('los huecos de la plantilla son los que manda el emisor (ctxSesion)', () => {
  const p = plantillaDe(EVENTOS.BAJA_REVISADA, 'INSTRUCTOR')!;
  const huecos = [...`${p.title} ${p.body}`.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(huecos, ['clase', 'cuando']);
  const emit = readFileSync(join(import.meta.dirname, 'emit.ts'), 'utf8');
  const ctx = emit.slice(emit.indexOf('async function ctxSesion'), emit.indexOf('async function ctxSesion') + 1200);
  for (const hueco of huecos) assert.match(ctx, new RegExp(`\\b${hueco}:`), `ctxSesion no manda {${hueco}}`);
});

test('el emisor no manda la decisión ni la nota, y la ruta solo avisa tras el compare-and-set', () => {
  const emit = readFileSync(join(import.meta.dirname, 'emit.ts'), 'utf8');
  const bloque = emit.slice(emit.indexOf('export async function emitirBajaRevisada'), emit.indexOf('// El Umbral (lib/decision/umbral.ts)'));
  const codigo = bloque.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(codigo, /nota|decision|revision|motivo|categoria/);
  const ruta = readFileSync(join(RAIZ, 'app/api/equipo/bajas-instructora/route.ts'), 'utf8');
  const cas = ruta.indexOf("await revisar.select('id, instructor_id, sesion_id, sustitucion_id')");
  const aviso = ruta.indexOf('await emitirBajaRevisada(');
  assert.ok(cas > 0 && aviso > cas, 'el aviso sale después de revisar, nunca antes ni sin revisar');
  assert.match(ruta.slice(cas, aviso), /if \(!data\) \{\s*return NextResponse\.json\(/);
});
