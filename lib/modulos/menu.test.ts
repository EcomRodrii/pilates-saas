import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ESSENTIAL_HREFS, MODULOS, NO_OCULTABLES } from '../nav-config.ts';
import { filtrarItemsMenu } from '../layout-runtime.ts';
import { HREF_MODULOS, activoEnModulos, eleccionTrasCambiar, siempreEnElMenu } from './menu.ts';

const NADA = { ocultos: [], activados: [] };

test('de serie, el menú del panel nuevo es el de «Esencial» de siempre (nadie lo encuentra cambiado), más Módulos', () => {
  const antes = filtrarItemsMenu(MODULOS, { puedeVer: () => true, ocultos: [], modo: 'esencial', esenciales: ESSENTIAL_HREFS }).map((i) => i.href);
  const ahora = MODULOS.filter((m) => activoEnModulos(m.href, NADA)).map((m) => m.href);
  // Lo fijo que no es del día a día (Suscripción) sale siempre: no se puede ocultar.
  assert.deepEqual(ahora.filter((h) => !NO_OCULTABLES.includes(h)), antes.filter((h) => !NO_OCULTABLES.includes(h)));
  assert.ok(activoEnModulos(HREF_MODULOS, NADA));
});

test('lo fijo y Módulos no se ocultan, ni aunque estén en `ocultos`', () => {
  for (const h of [...NO_OCULTABLES, HREF_MODULOS]) {
    assert.ok(siempreEnElMenu(h), h);
    assert.ok(activoEnModulos(h, { ocultos: [h], activados: [] }), h);
    assert.equal(eleccionTrasCambiar(NADA, h, false), null, h);
  }
});

test('activar lo de fuera del día a día lo apunta en `activados`; ocultarlo lo quita de ahí y lo pone en `ocultos`', () => {
  assert.ok(!ESSENTIAL_HREFS.includes('/pos'));
  assert.ok(!activoEnModulos('/pos', NADA));
  const activado = eleccionTrasCambiar(NADA, '/pos', true)!;
  assert.deepEqual(activado, { ocultos: [], activados: ['/pos'] });
  assert.ok(activoEnModulos('/pos', activado));
  const oculto = eleccionTrasCambiar(activado, '/pos', false)!;
  assert.deepEqual(oculto, { ocultos: ['/pos'], activados: [] });
  assert.ok(!activoEnModulos('/pos', oculto));
});

test('lo del día a día se oculta y se vuelve a activar solo con `ocultos`', () => {
  const oculto = eleccionTrasCambiar(NADA, '/citas', false)!;
  assert.deepEqual(oculto, { ocultos: ['/citas'], activados: [] });
  assert.ok(!activoEnModulos('/citas', oculto));
  const activo = eleccionTrasCambiar(oculto, '/citas', true)!;
  assert.deepEqual(activo, { ocultos: [], activados: [] });
  assert.ok(activoEnModulos('/citas', activo));
});

test('cambiar un módulo no toca los demás, y no duplica', () => {
  const e = { ocultos: ['/informes'], activados: ['/cierre'] };
  assert.deepEqual(eleccionTrasCambiar(e, '/pos', true), { ocultos: ['/informes'], activados: ['/cierre', '/pos'] });
  assert.deepEqual(eleccionTrasCambiar(e, '/cierre', true), { ocultos: ['/informes'], activados: ['/cierre'] });
  assert.deepEqual(eleccionTrasCambiar(e, '/informes', false), { ocultos: ['/informes'], activados: ['/cierre'] });
});
