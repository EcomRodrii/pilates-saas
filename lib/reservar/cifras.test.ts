import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redondearHaciaAbajo, cifrasVisibles, mereceBanda, SUELOS } from './cifras.ts';

test('redondea SIEMPRE hacia abajo: 512 son «+500», nunca 498', () => {
  // «+500» con 498 socias es una mentira pequeña que alguien puede comprobar, y
  // en una página que además cobra, la credibilidad no vuelve por 2 socias.
  assert.equal(redondearHaciaAbajo(512), '+500');
  assert.equal(redondearHaciaAbajo(498), '+400');
  assert.equal(redondearHaciaAbajo(1000), '+1000');
  assert.equal(redondearHaciaAbajo(1499), '+1000');
});

test('por debajo de 50 dice el número EXACTO, sin «+»', () => {
  // «12» es verdad; «+10» es una forma rara de decir doce, y encima promete
  // menos. Regresión: la primera versión devolvía «+10» y «+40».
  assert.equal(redondearHaciaAbajo(12), '12');
  assert.equal(redondearHaciaAbajo(47), '47');
  assert.equal(redondearHaciaAbajo(49), '49');
  assert.equal(redondearHaciaAbajo(9), '9');
  assert.equal(redondearHaciaAbajo(3), '3');
  // Y a partir de 50 sí redondea, siempre a la baja.
  assert.equal(redondearHaciaAbajo(50), '+50');
  assert.equal(redondearHaciaAbajo(74), '+50');
});

test('nunca devuelve algo raro con datos rotos', () => {
  assert.equal(redondearHaciaAbajo(0), '0');
  assert.equal(redondearHaciaAbajo(-5), '0');
  assert.equal(redondearHaciaAbajo(NaN), '0');
  assert.equal(redondearHaciaAbajo(Infinity), '0');
});

test('una cifra por debajo de su suelo NO se pinta: no se infla, desaparece', () => {
  // Un estudio nuevo con 12 socias no gana nada enseñando «12 alumnas»: la
  // cifra es verdad y aun así juega en su contra.
  const c = cifrasVisibles({ socias: 12, clasesSemana: 24, instructoras: 4 });
  assert.deepEqual(c.map(x => x.id), ['clasesSemana', 'instructoras']);
});

test('los suelos son distintos porque los números lo son', () => {
  // 6 instructoras es mucho; 6 socias es un problema.
  assert.ok(SUELOS.instructoras < SUELOS.socias);
  const c = cifrasVisibles({ socias: 6, instructoras: 6 });
  assert.deepEqual(c.map(x => x.id), ['instructoras']);
});

test('las etiquetas NO llevan adjetivos que no podamos contar', () => {
  const c = cifrasVisibles({ socias: 500, instructoras: 6 });
  const textos = c.map(x => x.etiqueta).join(' ');
  // El diseño decía «alumnas felices» e «instructoras expertas»: ninguna de las
  // dos se puede contar, y las estaríamos afirmando en nombre del estudio.
  assert.ok(!/feli|expert/i.test(textos));
  assert.deepEqual(c.map(x => x.etiqueta), ['Alumnas', 'Instructoras']);
});

test('singular y plural, para no dejar «1 Instructoras»', () => {
  const c = cifrasVisibles({ instructoras: 3, sedes: 2 });
  assert.equal(c.find(x => x.id === 'instructoras')?.etiqueta, 'Instructoras');
  // Con el suelo de sedes en 2, el singular solo aparece si algún suelo baja a 1.
  assert.equal(cifrasVisibles({ socias: 1 }).length, 0);
});

test('ausente y null no cuentan como cero: simplemente no hay dato', () => {
  assert.deepEqual(cifrasVisibles({ socias: null, clasesSemana: undefined }), []);
  assert.deepEqual(cifrasVisibles({}), []);
});

test('con UNA sola cifra no se pinta banda', () => {
  // Un número suelto en mitad de la página subraya lo que falta.
  assert.equal(mereceBanda(cifrasVisibles({ instructoras: 4 })), false);
  assert.equal(mereceBanda(cifrasVisibles({ instructoras: 4, clasesSemana: 30 })), true);
  assert.equal(mereceBanda([]), false);
});

test('un estudio grande enseña las cuatro, y todas redondeadas a la baja', () => {
  const c = cifrasVisibles({ socias: 512, clasesSemana: 47, instructoras: 6, sedes: 3 });
  assert.deepEqual(c.map(x => x.valor), ['+500', '47', '6', '3']);
});
