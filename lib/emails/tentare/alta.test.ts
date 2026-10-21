import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correoCuentaActiva, PRIMEROS_PASOS_ALTA, textoPlanAlta } from './alta.ts';
import { GRATIS_ALUMNAS, GRATIS_RESERVAS_MES } from '../../landing/founding-gratis.ts';
import { TRIAL_DIAS } from '../../billing/trial.ts';

// «Tu cuenta está activa» (correo 2 del alta nueva): lo que se compromete aquí es
// lo que llega a la bandeja de quien acaba de crear su estudio.

const BASE = {
  estudioNombre: 'Estudio Alba Pilates',
  urlPagina: 'https://www.example.com/reservar/estudio-alba-pilates',
  urlPrimeraClase: 'https://www.example.com/calendario',
  foundingGratis: true,
};

test('el asunto y la vista previa son los de la maqueta', () => {
  const c = correoCuentaActiva(BASE);
  assert.equal(c.asunto, 'Estudio Alba Pilates ya está en Tentare');
  assert.equal(c.preheader, 'Tu cuenta está activa. Te queda un paso para recibir reservas: tu primera clase.');
  assert.ok(c.html.includes(c.preheader));
});

test('el cuerpo: su página de verdad, un solo botón y los primeros pasos', () => {
  const { html } = correoCuentaActiva(BASE);
  assert.match(html, /Tu cuenta está activa/);
  assert.match(html, /<b>Estudio Alba Pilates<\/b> ya tiene su página de reservas:/);
  assert.match(html, /href="https:\/\/www\.example\.com\/reservar\/estudio-alba-pilates"/);
  assert.match(html, /Todavía está vacía\. En cuanto crees tu primera clase, tus alumnas podrán reservar desde ahí, sin descargarse nada\./);
  assert.match(html, /Crear mi primera clase<\/a>/);
  assert.equal((html.match(/mso-padding-alt/g) ?? []).length, 1, 'un correo, una llamada a la acción');
  assert.match(html, /Primeros pasos · 1 de 5/);
  for (const paso of PRIMEROS_PASOS_ALTA) assert.ok(html.includes(paso), paso);
  assert.match(html, /te responde una persona/);
  assert.match(html, /href="https:\/\/wa\.me\/34603556580\?text=/);
  assert.match(html, /Tentare · Software para estudios de Pilates · Hecho en España/);
});

test('el plan sale de las constantes que aplica el producto, y solo dice «gratis» si lo es', () => {
  assert.equal(textoPlanAlta(true),
    `Founding Studio: gratis hasta ${GRATIS_ALUMNAS} alumnas activas y ${GRATIS_RESERVAS_MES} reservas al mes. Sin tarjeta y sin permanencia.`);
  assert.match(correoCuentaActiva(BASE).html, /gratis hasta 150 alumnas activas y 250 reservas al mes/);
  const prueba = textoPlanAlta(false);
  assert.doesNotMatch(prueba, /gratis hasta/);
  assert.match(prueba, new RegExp(`${TRIAL_DIAS} días de prueba`));
  assert.ok(correoCuentaActiva({ ...BASE, foundingGratis: false }).html.includes(prueba));
});

test('el nombre del estudio se escapa: lo escribió una persona', () => {
  const c = correoCuentaActiva({ ...BASE, estudioNombre: 'Pilates <b>&</b> "Co"' });
  assert.doesNotMatch(c.html, /<b>&<\/b>/);
  assert.match(c.html, /Pilates &lt;b&gt;&amp;&lt;\/b&gt; &quot;Co&quot;/);
  // Un enlace que no es http(s) no llega a ser un enlace.
  assert.doesNotMatch(correoCuentaActiva({ ...BASE, urlPagina: 'javascript:alert(1)' }).html, /href="javascript/);
});
