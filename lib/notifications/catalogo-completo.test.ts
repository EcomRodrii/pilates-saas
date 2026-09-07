// ─────────────────────────────────────────────────────────────────────────────
// Guardia estructural del catálogo.
//
// Añadir un evento son TRES sitios (constante en `EVENTOS`, entrada en
// `REGLAS`, plantilla en `PLANTILLAS`) y nada obliga a hacer los tres. Con dos
// de tres no revienta nada: `publish` avisa por consola y devuelve `[]`, o sale
// una notificación con el título en blanco. En los dos casos el hecho ocurrió y
// a la persona no le llegó nada — que es peor que un error.
// ─────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENTOS, REGLAS, ROLES_POR_AUDIENCIA, plantillaDe, render } from './catalog.ts';

const TIPOS = Object.values(EVENTOS);

test('todo evento del catálogo tiene su regla', () => {
  const huerfanos = TIPOS.filter(t => !REGLAS[t]);
  assert.deepEqual(huerfanos, [],
    'Sin regla, `publish` lo descarta con un warning y nadie se entera del hecho.');
});

test('todo evento tiene plantilla para CADA rol al que se le manda', () => {
  const huecos: string[] = [];
  for (const tipo of TIPOS) {
    const regla = REGLAS[tipo];
    if (!regla) continue;
    for (const rol of ROLES_POR_AUDIENCIA[regla.audiencia]) {
      const p = plantillaDe(tipo, rol);
      if (!p?.title || !p?.body) huecos.push(`${tipo}#${rol}`);
    }
  }
  assert.deepEqual(huecos, [],
    'Una audiencia con varios roles necesita plantilla para todos: falta una y ese rol recibe un aviso vacío.');
});

// ── El evento nuevo, con los datos REALES que manda el barrido ────────────────
// El riesgo aquí no es que falte la plantilla: es que el nombre del hueco no
// coincida con la clave que envía quien publica. `render` sustituye por vacío
// sin quejarse, así que el fallo se lee en el móvil de la socia («Tienes  para
// recuperar») y en ningún log.
test('recuperacion.otorgada: los huecos de la plantilla coinciden con lo que envía el barrido', () => {
  const p = plantillaDe(EVENTOS.RECUPERACION_OTORGADA, 'SOCIA');
  assert.ok(p, 'sin plantilla para SOCIA');

  const huecos = [...`${p.title} ${p.body}`.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort();

  const barrido = readFileSync(join(import.meta.dirname, '..', 'recuperaciones', 'otorgar-semanales.ts'), 'utf8');
  const bloque = barrido.slice(barrido.indexOf('EVENTOS.RECUPERACION_OTORGADA'));
  for (const hueco of huecos) {
    assert.match(bloque, new RegExp(`\\b${hueco}\\b`),
      `La plantilla pide {${hueco}} y el barrido no lo manda: saldría en blanco.`);
  }
  assert.deepEqual(huecos, ['clases', 'fecha']);
});

test('recuperacion.otorgada: se pinta entero con datos de verdad', () => {
  const p = plantillaDe(EVENTOS.RECUPERACION_OTORGADA, 'SOCIA')!;
  const datos = { clases: '2 clases', fecha: '31 oct', slug: 'pilates-boutique' };
  assert.equal(render(p.title, datos), 'Tienes 2 clases para recuperar');
  assert.doesNotMatch(render(p.body, datos), /\{|\}/, 'quedó un hueco sin rellenar');
  // Al HORARIO, no a «mis reservas»: la recuperación se gasta reservando.
  assert.equal(p.deepLink?.(datos), '/portal/pilates-boutique/reservar');
});

test('recuperacion.otorgada va solo por PUSH y a la socia del evento', () => {
  const r = REGLAS[EVENTOS.RECUPERACION_OTORGADA];
  assert.deepEqual(r.canales, ['PUSH'], 'un email más por una buena noticia diluye el resto');
  assert.equal(r.audiencia, 'socia-del-evento');
});
