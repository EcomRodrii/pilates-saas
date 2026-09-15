import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esUrgente, listaAviso, resumenAviso, resumenRenovadas, tocaAvisar, tramoDe } from './series-avisos.ts';
import { EVENTOS, REGLAS, plantillaDe, render } from './notifications/catalog.ts';

test('tramoDe: 30–15 días solo bandeja, 14 push, 7 urgente, el último día y después «final»', () => {
  assert.equal(tramoDe(20), null);
  assert.equal(tramoDe(15), null);
  assert.equal(tramoDe(14), 'aviso14');
  assert.equal(tramoDe(8), 'aviso14');
  assert.equal(tramoDe(7), 'aviso7');
  assert.equal(tramoDe(1), 'aviso7');
  assert.equal(tramoDe(0), 'final');
  assert.equal(tramoDe(-5), 'final');
});

test('tocaAvisar: una vez por tramo, y de cero si cambia la fecha de fin', () => {
  const fin = '2026-10-05';
  assert.equal(tocaAvisar(null, { tramo: null, fin: null }, fin), false);
  assert.equal(tocaAvisar('aviso14', { tramo: null, fin: null }, fin), true);
  assert.equal(tocaAvisar('aviso14', { tramo: 'aviso14', fin }, fin), false, 'mismo tramo: ya avisado');
  assert.equal(tocaAvisar('aviso7', { tramo: 'aviso14', fin }, fin), true, 'sube de tramo');
  assert.equal(tocaAvisar('aviso14', { tramo: 'aviso7', fin }, fin), false, 'no baja');
  // Si el cron no corre el día 14 y el siguiente ya es tramo 7, avisa igual.
  assert.equal(tocaAvisar('final', { tramo: null, fin: null }, fin), true);
  // Renovada: la fecha de fin es otra y el ciclo vuelve a empezar.
  assert.equal(tocaAvisar('aviso14', { tramo: 'final', fin }, '2027-10-04'), true);
});

test('resumenAviso y esUrgente', () => {
  assert.equal(resumenAviso(['aviso14']), 'Una clase que se repite termina en dos semanas');
  assert.equal(resumenAviso(['aviso14', 'aviso14']), '2 clases que se repiten terminan en dos semanas');
  assert.equal(resumenAviso(['aviso7']), 'Una clase que se repite termina en menos de una semana');
  assert.equal(resumenAviso(['aviso14', 'final']), '2 clases que se repiten terminan pronto');
  assert.equal(resumenAviso(['final']), 'Una clase que se repite ha terminado sin renovar');
  assert.equal(esUrgente(['aviso14', 'aviso14']), false);
  assert.equal(esUrgente(['aviso14', 'aviso7']), true);
  assert.equal(resumenRenovadas(3), '3 clases se han renovado solas');
});

test('listaAviso: hasta 3 con su fecha, el resto contado, y el motivo si la automática falló', () => {
  const hoy = '2026-09-28';
  const lista = listaAviso([
    { nombre: 'Reformer · Lunes 12:30 · Sala 1', fin: '2026-10-05', hoy },
    { nombre: 'Mat · Martes 18:00 · Sala 2', fin: hoy, hoy, nota: 'La sala está ocupada a esa hora.' },
    { nombre: 'Barre · Jueves 09:00 · Sala 1', fin: '2026-09-20', hoy },
    { nombre: 'Yoga · Viernes 10:00 · Sala 2', fin: '2026-10-01', hoy },
  ]);
  assert.equal(
    lista,
    'Reformer · Lunes 12:30 · Sala 1: termina el 05/10/2026 · Mat · Martes 18:00 · Sala 2: termina hoy (no se ha podido renovar sola: la sala está ocupada a esa hora) · Barre · Jueves 09:00 · Sala 1: terminó el 20/09/2026 · y 1 más',
  );
});

test('las plantillas de series usan exactamente lo que manda el barrido y a quién', () => {
  for (const tipo of [EVENTOS.SERIES_POR_TERMINAR, EVENTOS.SERIES_POR_TERMINAR_URGENTE, EVENTOS.SERIES_RENOVADAS_SOLAS]) {
    for (const rol of ['PROPIETARIO', 'MANAGER'] as const) {
      const p = plantillaDe(tipo, rol);
      assert.ok(p, `${tipo}#${rol} sin plantilla`);
      const huecos = [...new Set([...`${p.title} ${p.body}`.matchAll(/\{(\w+)\}/g)].map(m => m[1]))].sort();
      assert.deepEqual(huecos, ['lista', 'resumen'], `${tipo}: huecos`);
      assert.doesNotMatch(render(`${p.title} ${p.body}`, { resumen: 'r', lista: 'l' }), /\{|\}/);
    }
    assert.equal(REGLAS[tipo].audiencia, 'gerencia');
  }
  assert.deepEqual(REGLAS[EVENTOS.SERIES_POR_TERMINAR].canales, ['PUSH']);
  assert.deepEqual(REGLAS[EVENTOS.SERIES_POR_TERMINAR_URGENTE].canales, ['PUSH', 'EMAIL']);
  assert.deepEqual(REGLAS[EVENTOS.SERIES_RENOVADAS_SOLAS].canales, ['PUSH']);
});
