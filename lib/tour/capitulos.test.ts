import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CAPITULOS, TODOS_LOS_PASOS, MINUTOS_TOTALES, rutaBase, rutaCoincide } from './capitulos.ts';
import { esRutaCongelada } from '../frozen-features.ts';

const RAIZ = join(import.meta.dirname, '..', '..');

function ficheros(dir: string): string[] {
  return (readdirSync(join(RAIZ, dir), { recursive: true }) as string[])
    .map(r => join(dir, r))
    .filter(r => /\.tsx$/.test(r) && statSync(join(RAIZ, r)).isFile());
}

test('hay 10 capítulos, con ids únicos y de 3 a 6 pasos cada uno', () => {
  assert.equal(CAPITULOS.length, 10);
  assert.equal(new Set(CAPITULOS.map(c => c.id)).size, CAPITULOS.length);
  for (const c of CAPITULOS) {
    assert.ok(c.pasos.length >= 3 && c.pasos.length <= 6, `${c.id} tiene ${c.pasos.length} pasos`);
    assert.ok(c.aprendido.length >= 2, `${c.id} no dice qué se ha aprendido`);
    for (const p of c.pasos) assert.ok(p.id.startsWith(`${c.id}.`), `${p.id} no es de ${c.id}`);
  }
  assert.equal(new Set(TODOS_LOS_PASOS.map(p => p.id)).size, TODOS_LOS_PASOS.length);
});

test('la visita dura lo que dice: unos 50 minutos', () => {
  assert.ok(MINUTOS_TOTALES >= 45 && MINUTOS_TOTALES <= 55, `${MINUTOS_TOTALES} min`);
});

test('todo paso «hacer» dice qué dato lo cierra, y ningún «mira» lo dice', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (p.tipo === 'hacer') assert.ok(p.hecho, `${p.id} es «hacer» sin dato que lo cierre`);
    else assert.equal(p.hecho, undefined, `${p.id} es «mira» pero lleva un dato`);
  }
});

test('toda ruta existe como pantalla del panel y no está congelada', () => {
  for (const p of TODOS_LOS_PASOS) {
    const base = rutaBase(p.ruta);
    assert.equal(esRutaCongelada(base), false, `${p.id} enseña ${base}, que está congelada`);
    const dir = join(RAIZ, 'app/(dashboard)', base.slice(1));
    const comodin = p.ruta.endsWith('/*');
    const pagina = comodin ? join(dir, '[id]', 'page.tsx') : join(dir, 'page.tsx');
    assert.ok(existsSync(pagina), `${p.id}: no existe ${pagina.replace(RAIZ, '')}`);
  }
});

test('todo selector es un data-tour que existe en el código', () => {
  const codigo = [...ficheros('app'), ...ficheros('components')]
    .map(f => readFileSync(join(RAIZ, f), 'utf8')).join('\n');
  for (const p of TODOS_LOS_PASOS) {
    // `dataTour="…"` es la prop que algunas piezas (TarjetaFicha) pasan a su `data-tour`.
    const esta = codigo.includes(`data-tour="${p.selector}"`) || codigo.includes(`dataTour="${p.selector}"`);
    assert.ok(esta, `${p.id}: no hay data-tour="${p.selector}" en el código`);
  }
});

test('el href de «Llévame» cuelga de la ruta del paso', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (!p.href) continue;
    assert.ok(p.href.startsWith(rutaBase(p.ruta)), `${p.id}: ${p.href} no cuelga de ${p.ruta}`);
  }
});

test('el copy no enseña lo congelado ni lo que no es para todos', () => {
  const prohibido = /Kiosko|Oferta digital|On ?Demand|VOD|Chat de equipo|Tentare Network|Asistente IA|Pregúntale a Tentare/i;
  for (const p of TODOS_LOS_PASOS) {
    assert.ok(!prohibido.test(`${p.titulo} ${p.texto}`), `${p.id} menciona algo congelado o no disponible`);
  }
});

test('el copy no manda a pestañas de antes ni promete lo que no hay', () => {
  const retirado = /Configuración\s*(?:→|>)\s*(?:Estudio|Clases y salas|Clases|Salas|Integraciones|Planes)\b|próximamente|muy pronto/i;
  for (const p of TODOS_LOS_PASOS) {
    assert.ok(!retirado.test(`${p.titulo} ${p.texto}`), `${p.id} usa un nombre de antes o promete futuro`);
  }
});

test('un texto no se pasa de largo: se lee en una tarjeta', () => {
  for (const p of TODOS_LOS_PASOS) {
    assert.ok(p.texto.length <= 330, `${p.id} tiene ${p.texto.length} caracteres`);
    assert.ok(p.titulo.length <= 60, `${p.id}: título de ${p.titulo.length} caracteres`);
  }
});

test('rutaCoincide: la ficha casa con cualquier clienta, no con el listado', () => {
  assert.equal(rutaCoincide('/clientas/*', '/clientas/abc'), true);
  assert.equal(rutaCoincide('/clientas/*', '/clientas'), false);
  assert.equal(rutaCoincide('/clientas/*', '/clientas/'), false);
  assert.equal(rutaCoincide('/calendario', '/calendario'), true);
  assert.equal(rutaCoincide('/calendario', '/calendario/x'), false);
});
