import test from 'node:test';
import assert from 'node:assert/strict';
import { cayoEnLaTrampa, CAMPO_TRAMPA } from './trampa-bots.ts';

test('vacío o ausente = persona', () => {
  assert.equal(cayoEnLaTrampa(''), false);
  assert.equal(cayoEnLaTrampa(undefined), false);
  assert.equal(cayoEnLaTrampa(null), false);
});

test('solo espacios NO es un bot', () => {
  // Un autorrelleno puede dejar un espacio suelto. Contarlo como bot
  // descartaría un alta real sin dejar rastro, que es el peor fallo posible
  // aquí: el formulario diría «¡Apuntado!» y no habría nadie apuntado.
  assert.equal(cayoEnLaTrampa(' '), false);
  assert.equal(cayoEnLaTrampa('\n\t  '), false);
});

test('con contenido = bot', () => {
  assert.equal(cayoEnLaTrampa('https://spam.example'), true);
  assert.equal(cayoEnLaTrampa('a'), true);
  assert.equal(cayoEnLaTrampa('  texto con espacios  '), true);
});

test('un tipo que no es texto no se toma por bot', () => {
  // El cuerpo llega de fuera y puede traer cualquier cosa. Un `true` o un
  // número no es señal de nada, y tratarlo como bot bloquearía un envío
  // legítimo hecho por un cliente raro.
  assert.equal(cayoEnLaTrampa(1), false);
  assert.equal(cayoEnLaTrampa(true), false);
  assert.equal(cayoEnLaTrampa({}), false);
  assert.equal(cayoEnLaTrampa(['x']), false);
});

test('el nombre del campo es uno solo y no choca con los campos reales', () => {
  // Si `CAMPO_TRAMPA` coincidiera con `email`/`nombre`/`estudio`/`ciudad`, el
  // servidor tomaría por bot a toda persona que rellenara ese campo.
  assert.ok(!['email', 'nombre', 'estudio', 'ciudad', 'captchaToken'].includes(CAMPO_TRAMPA));
});
