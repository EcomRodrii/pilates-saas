import test from 'node:test';
import assert from 'node:assert/strict';
import { comoSePaga } from './como-se-paga.ts';

// El aviso de «cómo se paga» de la última pantalla antes de confirmar.
//
// ⚠️ Los cuatro mensajes se pintaban con el MISMO adorno: círculo verde de
// `--success` con un ✓. Dos de los cuatro no son buenas noticias sino un MURO
// («esta clase solo se reserva con bono») y un tercero avisa de que va a pagar.
// Un ✓ verde encima de «no puedes reservar esto» es la señal contraria, y
// estaba justo donde más caro sale equivocarse.

const conBono = { nombre: 'Bono 8 sesiones', creditosTotales: 8, creditosUsados: 3 };
const gastado = { nombre: 'Bono 8 sesiones', creditosTotales: 8, creditosUsados: 8 };
const suelta = { sinPrecioSuelto: false, precioSuelto: 18 };
const soloBono = { sinPrecioSuelto: true, precioSuelto: 0 };

test('con bono que cubre: es buena noticia y no paga nada', () => {
  const r = comoSePaga(suelta, conBono, false);
  assert.equal(r.tono, 'ok');
  assert.match(r.texto, /5 disponibles/);
  assert.match(r.texto, /No pagas nada hoy/);
});

test('sin bono y con precio suelto: NO es un ✓, es que va a pagar', () => {
  const r = comoSePaga(suelta, null, false);
  assert.equal(r.tono, 'coste');
  assert.match(r.texto, /18 €/);
});

test('clase solo-con-bono y sin bono: es un MURO, no una confirmación', () => {
  const r = comoSePaga(soloBono, null, false);
  assert.equal(r.tono, 'bloqueo');
});

// ⚠️ `bono` va en NULL a propósito en los dos siguientes, y no es una comodidad
// del test: quien llama saca las dos cosas de la misma lista de bonos
// (`bonoParaClase` / `tieneBonoQueNoCubre`, `lib/student/bono-cubre.ts`), y
// `bonoNoCubre` solo es cierto cuando NINGUNO cubre — o sea, cuando
// `bonoParaClase` ya ha devuelto null. Pasar los dos a la vez describe un estado
// que la pantalla no puede alcanzar.
test('tiene bono pero no cubre este tipo, y la clase es solo-con-bono: muro', () => {
  const r = comoSePaga(soloBono, null, true);
  assert.equal(r.tono, 'bloqueo');
});

test('tiene bono pero no cubre, y sí hay precio suelto: se cobra, no se bloquea', () => {
  const r = comoSePaga(suelta, null, true);
  assert.equal(r.tono, 'coste');
  assert.match(r.texto, /18 €/);
  assert.match(r.texto, /no incluye este tipo/);
});

test('un bono agotado no cuenta como bono que cubre', () => {
  // `creditosUsados === creditosTotales`: quedan 0. Antes caía en la rama del
  // ✓ solo por existir el objeto, y le habría dicho «no pagas nada hoy».
  assert.equal(comoSePaga(suelta, gastado, false).tono, 'coste');
  assert.equal(comoSePaga(soloBono, gastado, false).tono, 'bloqueo');
});
