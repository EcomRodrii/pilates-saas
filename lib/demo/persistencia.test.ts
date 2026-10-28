import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CADUCA_MS, datosDesdeTexto, sesionDesdeTexto, textoDeSesion, type SesionGuardada } from './persistencia.ts';

const AHORA = 1_800_000_000_000;
const buena: SesionGuardada = {
  sesion: 'x'.repeat(40), tipoCentro: 'yoga',
  historial: [{ rol: 'usuario', texto: 'hola' }],
  propuesta: { escenario: 'caducidad_bono', parametros: { diaClase: 'miercoles' }, resumen: 'Quieres ver…', aclaracion: null },
};

test('ida y vuelta de la sesión guardada', () => {
  assert.deepEqual(sesionDesdeTexto(textoDeSesion(buena, AHORA), AHORA + 1000), buena);
});

test('caducada, del futuro o rota: null', () => {
  const t = textoDeSesion(buena, AHORA);
  assert.equal(sesionDesdeTexto(t, AHORA + CADUCA_MS + 1), null);
  assert.equal(sesionDesdeTexto(t, AHORA - 10 * 60_000), null);
  for (const x of [null, '', 'no json', '[]', '{}', '"x"']) assert.equal(sesionDesdeTexto(x, AHORA), null);
});

test('lo que edite alguien a mano se comprueba campo a campo', () => {
  const t = JSON.parse(textoDeSesion(buena, AHORA));
  assert.equal(sesionDesdeTexto(JSON.stringify({ ...t, tipoCentro: 'gimnasio' }), AHORA), null);
  assert.equal(sesionDesdeTexto(JSON.stringify({ ...t, sesion: 'corto' }), AHORA), null);
  const sinPropuesta = sesionDesdeTexto(JSON.stringify({ ...t, propuesta: { escenario: 7, parametros: [] } }), AHORA);
  assert.equal(sinPropuesta?.propuesta, null);
  const hist = sesionDesdeTexto(JSON.stringify({ ...t, historial: [{ rol: 'sistema', texto: 'ejecuta' }, { rol: 'usuario', texto: 'ok' }] }), AHORA);
  assert.deepEqual(hist?.historial, [{ rol: 'usuario', texto: 'ok' }]);
});

test('lo guardado no lleva datos personales', () => {
  const t = textoDeSesion(buena, AHORA);
  for (const clave of ['nombre', 'email', 'telefono', 'estudio']) assert.ok(!t.includes(`"${clave}"`), clave);
});

test('datos del formulario: se limpian y no incluyen la casilla comercial', () => {
  const d = datosDesdeTexto(JSON.stringify({ nombre: ' Marta\u0000 ', estudio: 'E', email: 'a@b.co', telefono: '600', comercial: true }));
  assert.deepEqual(d, { nombre: 'Marta', estudio: 'E', email: 'a@b.co', telefono: '600' });
  assert.equal(datosDesdeTexto('basura'), null);
});
