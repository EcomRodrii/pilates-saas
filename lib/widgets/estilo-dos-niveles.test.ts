import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGET_WEB_NEUTRO, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { aIgualQueTuApp, elegirNivel, nivelDeEstilo } from './estilo-dos-niveles.ts';

const b = (parcial: Partial<WidgetWeb>): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });

test('nivelDeEstilo: propio con estilo, letra o botones; lo demás no cuenta', () => {
  assert.equal(nivelDeEstilo(WIDGET_WEB_NEUTRO), 'app');
  assert.equal(nivelDeEstilo(b({ estilo: 'arena' })), 'propio');
  assert.equal(nivelDeEstilo(b({ letra: 'moderna' })), 'propio');
  assert.equal(nivelDeEstilo(b({ boton: 'fiel' })), 'propio');
  // «Tu web es…», el fundido y lo de «Más ajustes» valen en los dos niveles.
  assert.equal(nivelDeEstilo(b({ web: 'oscura', fundido: true, forma: 'recto', densidad: 'compacta', ocultarPie: true })), 'app');
});

test('«Igual que tu app» vacía estilo, letra y botones, y deja su web, el fundido y la forma', () => {
  const antes = b({ estilo: 'arena', letra: 'moderna', boton: 'suave', web: 'crema', fundido: true, forma: 'recto' });
  const { cambio, eligiendo } = elegirNivel(antes, 'app');
  assert.deepEqual(cambio, { estilo: null, letra: null, boton: null });
  assert.equal(eligiendo, false);
  const despues = { ...antes, ...cambio };
  assert.equal(nivelDeEstilo(despues), 'app');
  assert.equal(despues.web, 'crema');
  assert.equal(despues.fundido, true);
  assert.equal(despues.forma, 'recto');
  assert.deepEqual(aIgualQueTuApp(), { estilo: null, letra: null, boton: null });
});

test('solo la letra propia también vuelve a la de su app (nada escondido debajo)', () => {
  const { cambio } = elegirNivel(b({ letra: 'editorial' }), 'app');
  assert.deepEqual(cambio, { estilo: null, letra: null, boton: null });
});

test('«Igual que tu app» ya marcado: ningún cambio que publicar', () => {
  assert.deepEqual(elegirNivel(b({ web: 'oscura' }), 'app'), { cambio: null, eligiendo: false });
});

test('elegir «Un estilo solo para tu web» sin estilo abre los estilos y NO cambia el borrador', () => {
  assert.deepEqual(elegirNivel(WIDGET_WEB_NEUTRO, 'propio'), { cambio: null, eligiendo: true });
  // Con uno ya elegido, tampoco lo toca.
  assert.deepEqual(elegirNivel(b({ estilo: 'arena' }), 'propio'), { cambio: null, eligiendo: true });
});
