import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIAS_BADGE_NUEVO, esHrefDeMenu, expiracionPorDefecto, hrefsConBadge,
  novedadVigente, opcionesDeMenu,
} from './menu-novedades.ts';
import { MODULOS } from './nav-config.ts';
import { esRutaCongelada } from './frozen-features.ts';

test('el último día cuenta como vigente', () => {
  // Se compara por cadena a propósito: `expira_en` es un DATE de Postgres y
  // pasarlo por `new Date()` lo lee como medianoche UTC, con lo que en España
  // el badge se apagaría a las 2 de la madrugada del día anterior.
  const n = { href: '/cobros', expiraEn: '2026-09-30' };
  assert.equal(novedadVigente(n, '2026-09-30'), true, 'el día de fin todavía se ve');
  assert.equal(novedadVigente(n, '2026-10-01'), false);
  assert.equal(novedadVigente(n, '2026-01-01'), true);
});

test('la expiración por defecto cae dentro del mes siguiente', () => {
  assert.equal(expiracionPorDefecto(new Date('2026-08-21T10:00:00Z')), '2026-09-20');
  assert.equal(DIAS_BADGE_NUEVO, 30);
});

test('un href solo vale si es una entrada REAL del menú', () => {
  // El caso que esto evita es mudo: un dedazo guarda una fila que no pinta
  // nada y no da ningún error, así que «lo marqué y no se ve».
  assert.equal(esHrefDeMenu('/clientas'), true);
  assert.equal(esHrefDeMenu('/clientes'), false, 'un dedazo no puede guardarse');
  assert.equal(esHrefDeMenu('/dashboard/'), false, 'ni con barra de más');
  assert.equal(esHrefDeMenu('https://otro.sitio'), false);
});

test('no se puede señalar como nuevo un módulo congelado', () => {
  // `MODULOS` ya filtra el feature-freeze, así que esto sale gratis — pero si
  // alguien lo cambiara, marcar como «NUEVO» algo que nadie tiene en su menú
  // sería exactamente el fallo mudo de arriba.
  for (const { href } of opcionesDeMenu()) {
    assert.equal(esRutaCongelada(href), false, `${href} está congelada y no debería ofrecerse`);
  }
  assert.equal(esHrefDeMenu('/pos'), false, '/pos está congelada');
  assert.equal(opcionesDeMenu().length, MODULOS.length);
});

test('el badge se apaga por fecha Y por haberlo visto', () => {
  const novedades = [
    { href: '/cobros', expiraEn: '2026-09-30' },
    { href: '/clientas', expiraEn: '2026-08-01' },
    { href: '/informes', expiraEn: '2026-09-30' },
  ];
  const badges = hrefsConBadge(novedades, '2026-08-21', ['/informes']);
  assert.deepEqual([...badges], ['/cobros']);
  assert.equal(badges.has('/clientas'), false, 'caducado');
  assert.equal(badges.has('/informes'), false, 'ya lo vio');
});

test('sin novedades no hay badges, y una lista vacía de vistos no rompe', () => {
  assert.equal(hrefsConBadge([], '2026-08-21', []).size, 0);
  assert.equal(hrefsConBadge([{ href: '/cobros', expiraEn: '2026-09-30' }], '2026-08-21', []).size, 1);
});
