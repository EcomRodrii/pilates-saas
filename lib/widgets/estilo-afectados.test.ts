import { test } from 'node:test';
import assert from 'node:assert/strict';
import { piezasAfectadas } from './estilo-afectados.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor, type Copiado } from './config.ts';

const COPIADO: Copiado = { firma: 'abc123', en: '2026-09-28T10:00:00.000Z' };
const c = (parcial: Partial<ConfigConstructor> = {}): ConfigConstructor => ({ ...CONFIG_POR_DEFECTO, ...parcial });

test('nada copiado desde aquí: nada que nombrar', () => {
  assert.deepEqual(piezasAfectadas({ horario: c() }, {}, null), { cambian: [], hayPopup: false, hayNativa: false, hayPagina: false });
});

test('solo lo COPIADO desde el constructor, por su nombre y en el orden del catálogo', () => {
  const r = piezasAfectadas(
    { planes: c({ metodo: 'iframe' }), horario: c({ metodo: 'iframe' }), cuenta: c({ metodo: 'iframe' }) },
    { planes: COPIADO, horario: COPIADO },
    null,
  );
  // «Mi cuenta» tiene su config pero no se copió desde aquí: no se nombra.
  assert.deepEqual(r.cambian, ['Horario y reservas', 'Planes y precios']);
});

test('la ventana encima cambia (su botón no); sin marco y los enlaces a la página, no', () => {
  const r = piezasAfectadas(
    { horario: c({ metodo: 'popup' }), planes: c({ metodo: 'boton' }), cuenta: c({ metodo: 'enlace' }) },
    { horario: COPIADO, planes: COPIADO, cuenta: COPIADO },
    'otra',
  );
  assert.deepEqual(r.cambian, ['Horario y reservas']);
  assert.equal(r.hayPopup, true);
  assert.equal(r.hayPagina, true);
  assert.equal(r.hayNativa, false);
  const nativa = piezasAfectadas({ horario: c({ metodo: 'nativa' }) }, { horario: COPIADO }, 'otra');
  assert.deepEqual(nativa, { cambian: [], hayPopup: false, hayNativa: true, hayPagina: false });
});

test('⚠️ un widget con diseño propio en su código no cuenta: a ese no le llega el estilo', () => {
  const r = piezasAfectadas(
    { horario: c({ metodo: 'iframe', identidad: 'propia', marca: '#E11D48' }), planes: c({ metodo: 'popup', identidad: 'propia', forma: 'recto' }) },
    { horario: COPIADO, planes: COPIADO },
    null,
  );
  assert.deepEqual(r, { cambian: [], hayPopup: false, hayNativa: false, hayPagina: false });
  // «Propia» sin tocar nada no emite diseño: sí cambia.
  assert.equal(piezasAfectadas({ horario: c({ metodo: 'iframe', identidad: 'propia' }) }, { horario: COPIADO }, null).cambian.length, 1);
});

test('el método es el que se usa de verdad en su web, no el elegido si su web no lo admite', () => {
  // Sin web no se puede poner un iframe: el horario se queda en el enlace.
  const r = piezasAfectadas({ horario: c({ metodo: 'iframe' }) }, { horario: COPIADO }, 'sinweb');
  assert.deepEqual(r, { cambian: [], hayPopup: false, hayNativa: false, hayPagina: true });
  // Copiado sin config guardada: la de por defecto (el recomendado del catálogo).
  assert.deepEqual(piezasAfectadas({}, { horario: COPIADO }, null).cambian, ['Horario y reservas']);
});
