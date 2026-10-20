import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MENU_PRODUCTO, MENU_PUBLICO, MENU_RECURSOS, MENU_SOLUCIONES, PIE_PUBLICO } from './navegacion-publica.ts';
import { PAGINAS, paginaDe } from './paginas.ts';
import { ARTICULOS_META } from '../recursos/articulos/meta.ts';

const enlacesDelMenu = () => [
  ...MENU_PUBLICO,
  ...MENU_PRODUCTO.flatMap((g) => g.enlaces),
  ...MENU_SOLUCIONES,
  ...MENU_RECURSOS,
];

test('todo enlace del menú y del pie públicos apunta a una página del registro', () => {
  const rotos = [...enlacesDelMenu(), ...PIE_PUBLICO.flatMap((c) => c.enlaces)]
    .map((e) => e.href)
    .filter((href) => !paginaDe(href));
  assert.deepEqual(rotos, []);
});

test('ninguna página de dinero queda a más de un clic del pie', () => {
  const enPie = new Set(PIE_PUBLICO.flatMap((c) => c.enlaces.map((e) => e.href)));
  // Las páginas comerciales: precios, soluciones y los hubs. Las 13 comparativas
  // y las 17 funcionalidades cuelgan de su hub, que sí está.
  const dinero = PAGINAS.filter((p) => p.path === '/precios' || p.grupo === 'soluciones' || ['/funcionalidades', '/comparativa', '/recursos'].includes(p.path));
  const fuera = dinero.map((p) => p.path).filter((p) => !enPie.has(p));
  assert.deepEqual(fuera, []);
  assert.ok(MENU_PUBLICO.some((e) => e.href === '/soluciones'));
});

test('el pie no repite enlaces dentro de una misma columna', () => {
  for (const col of PIE_PUBLICO) {
    const hrefs = col.enlaces.map((e) => e.href);
    assert.equal(new Set(hrefs).size, hrefs.length, `columna ${col.titulo}`);
  }
});

// ── Fase 2.1 (19-oct-2026): un solo armazón para toda la web pública ─────────

test('«Producto» lleva las 17 funcionalidades, cada una una sola vez, en las cinco áreas de la estrategia', () => {
  const funcionalidades = PAGINAS.filter((p) => p.path.startsWith('/funcionalidades/')).map((p) => p.path).sort();
  const enMenu = MENU_PRODUCTO.flatMap((g) => g.enlaces.map((e) => e.href));
  assert.equal(new Set(enMenu).size, enMenu.length, 'una funcionalidad repetida en el menú');
  assert.deepEqual([...enMenu].sort(), funcionalidades);
  assert.equal(funcionalidades.length, 17);
  assert.deepEqual(MENU_PRODUCTO.map((g) => g.titulo), [
    'Reservas y horario', 'Cobros, bonos y cuotas', 'Alumnas y app', 'Equipo y sustituciones', 'Informes y control',
  ]);
});

test('«Soluciones» lleva todas las páginas de solución que existen (y solo páginas que existen)', () => {
  const soluciones = PAGINAS.filter((p) => p.grupo === 'soluciones' && p.path !== '/soluciones').map((p) => p.path);
  const enMenu = new Set(MENU_SOLUCIONES.map((e) => e.href));
  assert.deepEqual(soluciones.filter((p) => !enMenu.has(p)), []);
  // CONTROL: el registro sí tiene soluciones (si no, «ninguna falta» no diría nada).
  assert.ok(soluciones.length >= 4);
  // …y cada carpeta de app/soluciones/* tiene su entrada: una página nueva no se queda fuera del menú.
  const carpetas = readdirSync(join(import.meta.dirname, '..', '..', 'app', 'soluciones'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => `/soluciones/${d.name}`);
  assert.deepEqual(carpetas.filter((p) => !enMenu.has(p)), []);
});

test('la línea de cada entrada de Soluciones y Recursos es el resumen del registro, tal cual', () => {
  // Si el registro cambia su frase (o deja de ser verdad y se corrige allí), el menú no se queda con la vieja.
  for (const e of [...MENU_SOLUCIONES, ...MENU_RECURSOS]) {
    assert.equal(e.resumen, paginaDe(e.href)?.resumen, e.href);
  }
});

test('el pie lleva TODOS los documentos legales y el soporte', () => {
  const enPie = new Set(PIE_PUBLICO.flatMap((c) => c.enlaces.map((e) => e.href)));
  // Fuera, a propósito: las legales de Tentare Network (/network/*), congelado y
  // sin enlazar desde la web comercial (components/landing/enlaces.ts, NAV_NETWORK).
  const legales = PAGINAS.filter((p) => p.grupo === 'legal' && !p.path.startsWith('/network/')).map((p) => p.path);
  // CONTROL: son cinco (aviso legal, privacidad, términos, cookies y soporte).
  assert.deepEqual([...legales].sort(), ['/cookies', '/legal', '/privacidad', '/soporte', '/terminos']);
  assert.deepEqual(legales.filter((p) => !enPie.has(p)), []);
});

test('cada enlace del menú y del pie tiene su página en app/ (el sistema de ficheros, no solo el registro)', () => {
  const app = join(import.meta.dirname, '..', '..', 'app');
  const slugs = new Set(ARTICULOS_META.map((a) => a.slug));
  const existe = (href: string) => {
    if (href === '/') return existsSync(join(app, 'page.tsx'));
    if (existsSync(join(app, href, 'page.tsx')) || existsSync(join(app, '(legal)', href, 'page.tsx'))) return true;
    // Los artículos de /recursos son datos servidos por una ruta dinámica.
    const m = /^\/recursos\/([^/]+)$/.exec(href);
    return Boolean(m && slugs.has(m[1]) && existsSync(join(app, 'recursos', '[slug]', 'page.tsx')));
  };
  const todos = [...new Set([...enlacesDelMenu(), ...PIE_PUBLICO.flatMap((c) => c.enlaces)].map((e) => e.href))];
  assert.deepEqual(todos.filter((h) => !existe(h)), []);
  // CONTROL: una ruta inventada no existe, y un artículo de datos sí.
  assert.equal(existe('/funcionalidades/no-existe'), false);
  assert.equal(existe('/recursos/mejor-software-para-estudios-de-pilates'), true);
});
