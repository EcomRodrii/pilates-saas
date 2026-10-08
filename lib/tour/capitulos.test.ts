import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CAPITULOS, TODOS_LOS_PASOS, MINUTOS_TOTALES, lugarCoincide, rutaBase, rutaCoincide, selectorCss, tabDe } from './capitulos.ts';
import { SECCIONES } from '../configuracion/secciones.ts';
import { rutaFueraDelMenu } from '../nav-config.ts';
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
  const secciones = readFileSync(join(RAIZ, 'lib/configuracion/secciones.ts'), 'utf8');
  const codigo = [...ficheros('app'), ...ficheros('components')]
    .map(f => readFileSync(join(RAIZ, f), 'utf8')).join('\n');
  for (const p of TODOS_LOS_PASOS) {
    if (p.selector.startsWith('#')) {
      // Una fila de Configuración: su id es el de la sección/herramienta (fila-herramienta-<id>) o el de la tarjeta.
      const id = p.selector.slice(1).replace(/^fila-herramienta-/, '');
      assert.ok(secciones.includes(`id: '${id}'`), `${p.id}: ${p.selector} no es una fila de Configuración (lib/configuracion/secciones.ts)`);
      continue;
    }
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

test('cada paso dice qué hacer, y cada capítulo para qué sirve', () => {
  for (const c of CAPITULOS) {
    assert.ok(c.paraQue.length >= 30 && c.paraQue.length <= 200, `${c.id}: «para qué» de ${c.paraQue.length} caracteres`);
  }
  for (const p of TODOS_LOS_PASOS) {
    assert.ok(p.accion.length >= 10 && p.accion.length <= 130, `${p.id}: acción de ${p.accion.length} caracteres`);
    if (p.tipo === 'hacer') assert.match(p.accion, /^(Pulsa|Abre|Añade|En la tarjeta)/, `${p.id}: un paso «hacer» empieza por un verbo de acción`);
  }
});

test('todo paso «hacer» dice qué hacer si ya lo tienes hecho (y ningún «mira» lo dice)', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (p.tipo === 'hacer') {
      assert.ok(p.accionSiYaLoTienes && p.accionSiYaLoTienes.startsWith('Ya '), `${p.id}: falta «accionSiYaLoTienes» (empieza por «Ya …»)`);
      assert.ok(p.accionSiYaLoTienes.length <= 130, `${p.id}: demasiado largo`);
    } else assert.equal(p.accionSiYaLoTienes, undefined, `${p.id}: un «mira» no lleva accionSiYaLoTienes`);
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

test('selectorCss: un id tal cual, un data-tour como atributo', () => {
  assert.equal(selectorCss('#salas'), '#salas');
  assert.equal(selectorCss('menu-principal'), '[data-tour="menu-principal"]');
});

test('lo que el menú de hoy no enseña (Marketing apagado) se detecta, y lo que no es del menú no', () => {
  assert.equal(rutaFueraDelMenu('/marketing'), true, 'Marketing está apagado por flag: no existe para la propietaria');
  assert.equal(rutaFueraDelMenu('/ondemand'), true);
  assert.equal(rutaFueraDelMenu('/calendario'), false);
  assert.equal(rutaFueraDelMenu('/primeros-pasos'), false, 'no es del menú: no cuenta como oculta');
});

// ── Los nombres que se citan son los de la pantalla, y están donde se dice ───────────────────

const FILAS = new Map<string, { tab: string; titulo: string }>();
for (const sec of SECCIONES) for (const t of sec.tarjetas) FILAS.set(t.id, { tab: sec.id, titulo: t.titulo });

function filaDe(selector: string) {
  return FILAS.get(selector.slice(1).replace(/^fila-herramienta-/, ''));
}

test('un paso que señala una fila de Configuración lleva a SU pestaña (estar en /configuracion no basta)', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (!p.selector.startsWith('#')) continue;
    const fila = filaDe(p.selector);
    assert.ok(fila, `${p.id}: ${p.selector} no es una fila de Configuración`);
    assert.equal(tabDe(p), fila.tab, `${p.id}: «${fila.titulo}» está en la pestaña «${fila.tab}», pero el paso lleva a «${tabDe(p)}»`);
  }
});

test('el nombre de la fila que se cita es el que pone en pantalla', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (!p.selector.startsWith('#')) continue;
    const fila = filaDe(p.selector)!;
    assert.ok(p.accion.includes(`«${fila.titulo}»`), `${p.id}: la acción debe nombrar la fila «${fila.titulo}» tal cual aparece en pantalla`);
  }
});

test('todo nombre entre « » de la visita existe como texto de la aplicación', () => {
  const codigo = [...ficheros('app'), ...ficheros('components'), 'lib/nav-config.ts', 'lib/configuracion/secciones.ts']
    .filter(f => !f.startsWith('components/tour'))
    .map(f => readFileSync(join(RAIZ, f), 'utf8')).join('\n');
  const inventados: string[] = [];
  for (const p of TODOS_LOS_PASOS) {
    for (const m of `${p.titulo} ${p.texto} ${p.accion} ${p.accionSiYaLoTienes ?? ''}`.matchAll(/«([^»]+)»/g)) {
      if (!codigo.includes(m[1])) inventados.push(`${p.id}: «${m[1]}»`);
    }
  }
  assert.deepEqual(inventados, [], 'estos nombres no aparecen en ninguna pantalla');
});

test('«mira» no pide pulsar nada que abra un diálogo; «hacer» sí empieza por la acción', () => {
  for (const p of TODOS_LOS_PASOS) {
    if (p.tipo === 'mira') assert.doesNotMatch(p.accion, /^(Pulsa|Abre|Añade|Escribe|Prueba)/, `${p.id}: un paso «mira» no manda pulsar (el diálogo taparía su botón «Entendido»)`);
  }
});

test('lugarCoincide: la ruta no basta si el paso vive en una pestaña', () => {
  const horario = TODOS_LOS_PASOS.find(p => p.id === 'c2.3')!;
  assert.equal(lugarCoincide(horario, '/configuracion', 'estudio'), true);
  assert.equal(lugarCoincide(horario, '/configuracion', null), false, 'en el inicio de Configuración no está «Horario»');
  assert.equal(lugarCoincide(horario, '/configuracion', 'marca'), false);
  assert.equal(lugarCoincide(horario, '/calendario', 'estudio'), false);
  // un paso sin pestaña solo mira la ruta
  const calendario = TODOS_LOS_PASOS.find(p => p.id === 'c3.1')!;
  assert.equal(lugarCoincide(calendario, '/calendario', null), true);
});

test('tabDe lee la pestaña del href, con o sin ancla', () => {
  assert.equal(tabDe({ href: '/configuracion?tab=cobros#datos-fiscales' }), 'cobros');
  assert.equal(tabDe({ href: '/configuracion' }), null);
  assert.equal(tabDe({ href: undefined }), null);
});
