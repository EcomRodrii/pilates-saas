import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confirmacionPaginaPublica, cuerpoPaginaPublica, estadoConfirmado, formularioPaginaPublica, hayCambiosPaginaPublica,
  leerEstadoPaginaPublica, motivoClavePaginaPublica, textoGuardadoPaginaPublica,
} from './pagina-publica.ts';

// «Ocultar tu página» cambia lo que ven personas de fuera. Lo que se fija aquí:
// qué se manda al servidor, cuándo hay algo que guardar, que se confirma con su
// consecuencia y que «Guardado» sale solo de lo que el servidor devuelve.

const visible = { oculta: false, tieneClave: false };
const ocultaConClave = { oculta: true, tieneClave: true };

test('lo que responde el servidor: un `{}` no es «visible»', () => {
  assert.deepEqual(leerEstadoPaginaPublica({ oculta: true, tieneClave: true }), { oculta: true, tieneClave: true });
  assert.deepEqual(leerEstadoPaginaPublica({ oculta: false }), { oculta: false, tieneClave: false });
  for (const v of [{}, null, 'ok', { oculta: 'true' }]) assert.equal(leerEstadoPaginaPublica(v), null);
});

test('qué se manda: la clave ausente no se toca, vacía se quita, y con la página visible no viaja', () => {
  const base = formularioPaginaPublica(ocultaConClave);
  assert.deepEqual(cuerpoPaginaPublica(base), { oculta: true });
  assert.deepEqual(cuerpoPaginaPublica({ ...base, clave: '  secreta1 ' }), { oculta: true, clave: 'secreta1' });
  assert.deepEqual(cuerpoPaginaPublica({ ...base, quitarClave: true, clave: 'no-cuenta' }), { oculta: true, clave: '' });
  assert.deepEqual(cuerpoPaginaPublica({ oculta: false, clave: 'escrita', quitarClave: true }), { oculta: false });
});

test('cuándo hay algo que guardar, y la clave corta se para antes de llegar al servidor', () => {
  assert.equal(hayCambiosPaginaPublica(formularioPaginaPublica(visible), visible), false);
  assert.equal(hayCambiosPaginaPublica({ ...formularioPaginaPublica(visible), oculta: true }, visible), true);
  // Quitar una clave que no hay no es un cambio.
  assert.equal(hayCambiosPaginaPublica({ oculta: true, clave: '', quitarClave: true }, { oculta: true, tieneClave: false }), false);
  assert.equal(hayCambiosPaginaPublica({ oculta: true, clave: '', quitarClave: true }, ocultaConClave), true);
  assert.equal(motivoClavePaginaPublica({ oculta: true, clave: 'abc', quitarClave: false }), 'La clave necesita al menos 6 caracteres.');
  assert.equal(motivoClavePaginaPublica({ oculta: true, clave: 'abcdef', quitarClave: false }), null);
  assert.equal(motivoClavePaginaPublica({ oculta: false, clave: 'abc', quitarClave: false }), null);
});

test('se confirma con su consecuencia, y cada texto cabe en su línea', () => {
  const ocultar = confirmacionPaginaPublica({ oculta: true, clave: '', quitarClave: false }, visible)!;
  assert.equal(ocultar.titulo, '¿Ocultar tu página?');
  assert.match(ocultar.descripcion, /app de tus alumnas.*No entrará nadie\.$/);
  const conClave = confirmacionPaginaPublica({ oculta: true, clave: 'secreta1', quitarClave: false }, visible)!;
  assert.match(conClave.descripcion, /Solo entra quien tenga la clave\.$/);
  assert.equal(confirmacionPaginaPublica({ oculta: false, clave: '', quitarClave: false }, ocultaConClave)!.textoConfirmar, 'Enseñarla');
  assert.equal(confirmacionPaginaPublica({ oculta: true, clave: '', quitarClave: true }, ocultaConClave)!.titulo, '¿Quitar la clave?');
  assert.equal(confirmacionPaginaPublica({ oculta: true, clave: 'otra-clave', quitarClave: false }, ocultaConClave)!.titulo, '¿Cambiar la clave?');
  assert.equal(confirmacionPaginaPublica(formularioPaginaPublica(visible), visible), null);
  for (const c of [ocultar, conClave]) assert.ok(c.descripcion.length <= 120, `${c.descripcion.length}: ${c.descripcion}`);
});

test('«Guardado» solo con lo que confirma el servidor', () => {
  assert.deepEqual(estadoConfirmado({ oculta: true }, { oculta: true }, ocultaConClave), ocultaConClave);
  assert.deepEqual(estadoConfirmado({ oculta: true, tieneClave: false }, { oculta: true, clave: '' }, ocultaConClave), { oculta: true, tieneClave: false });
  // Un 200 que no dice lo pedido no se da por bueno.
  assert.equal(estadoConfirmado({}, { oculta: true }, visible), null);
  assert.equal(estadoConfirmado({ oculta: false }, { oculta: true }, visible), null);
  assert.equal(textoGuardadoPaginaPublica({ oculta: true, tieneClave: false }, visible), 'Tu página ya no se ve.');
  assert.equal(textoGuardadoPaginaPublica(visible, ocultaConClave), 'Tu página vuelve a estar visible.');
});
