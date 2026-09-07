import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esHrefDeMenu, opcionesDeMenu } from './menu-novedades.ts';
import { MODULOS } from './nav-config.ts';
import { esRutaCongelada } from './frozen-features.ts';

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
  // `/pos` salió del freeze el 2026-09-07 (rediseño del TPV): ahora SÍ es una
  // entrada real del menú y sí se puede señalar. Se comprueba contra las que
  // siguen congeladas, que es lo que este test vino a proteger.
  assert.equal(esHrefDeMenu('/kiosk'), false, '/kiosk está congelada');
  assert.equal(esHrefDeMenu('/ondemand'), false, '/ondemand está congelada');
  assert.equal(esHrefDeMenu('/pos'), true, '/pos ya no está congelada');
  assert.equal(opcionesDeMenu().length, MODULOS.length);
});
