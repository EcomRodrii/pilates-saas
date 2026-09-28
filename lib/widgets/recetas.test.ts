import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, esDisponible, widgetPorId, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO } from './config.ts';
import {
  PLATAFORMAS_WEB, direccionLegible, guiaDe, leerWeb, mensajeParaTuWeb, metodoEnWeb, origenesConYSinWww,
  pasosEnTuWeb, receta, usaBotonPropio, type PlataformaWeb,
} from './recetas.ts';

function w(id: string): WidgetDisponible {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x), `${id} debería estar disponible`);
  return x;
}
const DISPONIBLES = WIDGETS.filter(esDisponible);
const TODAS: (PlataformaWeb | null)[] = [null, ...PLATAFORMAS_WEB.map(p => p.id)];

// ── La pregunta ──────────────────────────────────────────────────────────────

test('las siete respuestas de «¿Con qué está hecha tu web?», sin repetir', () => {
  assert.deepEqual(PLATAFORMAS_WEB.map(p => p.id), ['wordpress', 'wix', 'squarespace', 'webflow', 'otra', 'agencia', 'sinweb']);
});

test('leerWeb: lo guardado se valida, la basura cae a «sin contestar» y `html` es «otra»', () => {
  assert.deepEqual(leerWeb(null), { plataforma: null, direccion: null });
  assert.deepEqual(leerWeb({}), { plataforma: null, direccion: null });
  assert.deepEqual(leerWeb({ _web: 'wix' }), { plataforma: null, direccion: null });
  assert.deepEqual(leerWeb({ _web: { plataforma: 'shopify' } }), { plataforma: null, direccion: null });
  assert.deepEqual(leerWeb({ _web: { plataforma: 'html' } }).plataforma, 'otra');
  assert.deepEqual(leerWeb({ _web: { plataforma: 'wix', direccion: 'https://www.MiEstudio.example.com/horarios' } }),
    { plataforma: 'wix', direccion: 'www.miestudio.example.com' });
});

test('direccionLegible: se queda con el dominio y descarta lo que no lo es', () => {
  assert.equal(direccionLegible('miestudio.example.com'), 'miestudio.example.com');
  assert.equal(direccionLegible(' HTTP://Web.Example.com/a?b#c '), 'web.example.com');
  assert.equal(direccionLegible('localhost'), null);
  assert.equal(direccionLegible('no es una web'), null);
  assert.equal(direccionLegible(''), null);
  assert.equal(direccionLegible(42), null);
});

// ── La forma recomendada ─────────────────────────────────────────────────────

test('⚠️ sin plataforma, la forma de siempre: el código sin tocar no cambia', () => {
  for (const x of DISPONIBLES) {
    assert.equal(metodoEnWeb(CONFIG_POR_DEFECTO, x, null), x.metodos[0], x.id);
  }
  assert.equal(metodoEnWeb(CONFIG_POR_DEFECTO, w('horario'), null), 'iframe');
});

test('la recomendada nunca es la integración sin marco, ni algo desactivado, ni algo que el widget no admite', () => {
  for (const p of TODAS) {
    for (const x of DISPONIBLES) {
      const r = receta(p, x);
      assert.notEqual(r.recomendado, 'nativa', `${p}/${x.id}`);
      assert.ok(x.metodos.includes(r.recomendado), `${p}/${x.id}: ${r.recomendado}`);
      assert.equal(r.desactivados[r.recomendado], undefined, `${p}/${x.id}`);
      assert.ok(r.motivo.length > 10, `${p}/${x.id}: sin motivo`);
    }
  }
});

test('Wix: botón con su enlace, sin ventana encima ni integración sin marco, y aviso si va dentro', () => {
  const r = receta('wix', w('horario'));
  assert.equal(r.recomendado, 'boton');
  assert.match(r.motivo, /Wix/);
  assert.ok(r.desactivados.popup);
  assert.ok(r.desactivados.nativa);
  assert.match(r.avisos.iframe ?? '', /caja/);
  // Lo elegido y desactivado no se usa: se cae a la recomendada.
  assert.equal(metodoEnWeb({ metodo: 'popup' }, w('horario'), 'wix'), 'boton');
  assert.equal(metodoEnWeb({ metodo: 'iframe' }, w('horario'), 'wix'), 'iframe');
});

test('sin web, solo el enlace', () => {
  for (const x of DISPONIBLES) {
    const r = receta('sinweb', x);
    assert.equal(r.recomendado, 'enlace', x.id);
    for (const m of ['iframe', 'popup', 'boton', 'nativa'] as const) assert.ok(r.desactivados[m], `${x.id}/${m}`);
    assert.equal(metodoEnWeb({ metodo: 'iframe' }, x, 'sinweb'), 'enlace');
  }
});

test('lo elegido manda si su web lo admite, aunque no sea lo recomendado', () => {
  assert.equal(metodoEnWeb({ metodo: 'enlace' }, w('horario'), 'wordpress'), 'enlace');
  assert.equal(metodoEnWeb({ metodo: 'nativa' }, w('horario'), 'otra'), 'nativa');
  // Un método que el widget no tiene no cuela.
  assert.equal(metodoEnWeb({ metodo: 'nativa' }, w('planes'), 'otra'), 'iframe');
});

test('la clase de prueba sigue recomendando el botón que se abre encima', () => {
  assert.equal(receta('wordpress', w('prueba')).recomendado, 'popup');
  assert.equal(receta(null, w('prueba')).recomendado, 'popup');
});

// ── Los pasos ────────────────────────────────────────────────────────────────

test('cada plataforma tiene sus pasos, y con su propio botón no se pega código', () => {
  for (const p of TODAS) {
    for (const m of ['iframe', 'popup', 'boton', 'enlace', 'nativa'] as const) {
      assert.ok(pasosEnTuWeb(p, m).length >= 2, `${p}/${m}`);
    }
  }
  assert.match(pasosEnTuWeb('wordpress', 'iframe')[0], /HTML personalizado/);
  assert.match(pasosEnTuWeb('squarespace', 'iframe')[0], /«Código»/);
  assert.match(pasosEnTuWeb('webflow', 'iframe')[0], /Code Embed/);
  assert.match(pasosEnTuWeb('wordpress', 'popup').join(' '), /<script/);
  assert.match(pasosEnTuWeb('wordpress', 'boton')[0], /«Botones»/);
  assert.doesNotMatch(pasosEnTuWeb('wordpress', 'boton').join(' '), /código/i);
  assert.match(pasosEnTuWeb('otra', 'boton')[0], /código/);
  assert.match(pasosEnTuWeb('sinweb', 'enlace')[0], /Copiar enlace/);
});

test('usaBotonPropio: las plataformas con su propio botón, no «otra» ni la agencia', () => {
  assert.deepEqual(PLATAFORMAS_WEB.map(p => p.id).filter(usaBotonPropio), ['wordpress', 'wix', 'squarespace', 'webflow']);
  assert.equal(usaBotonPropio(null), false);
});

test('la guía de ayuda existe para cada caso', () => {
  assert.equal(guiaDe('wordpress', 'iframe'), '/ayuda/widget/instalar-en-wordpress');
  assert.equal(guiaDe('otra', 'popup'), '/ayuda/widget/instalar-con-html');
  assert.equal(guiaDe('wix', 'enlace'), '/ayuda/widget/que-es-el-widget');
});

test('el mensaje para quien lleva la web lleva el código, los pasos numerados y la guía', () => {
  const m = mensajeParaTuWeb({
    estudio: 'Estudio de ejemplo', queEs: 'Tu horario, para que reserven', forma: 'Dentro de una página',
    codigo: '<iframe src="x"></iframe>', esEnlace: false, pasos: ['Uno.', 'Dos.'], guia: 'https://example.com/ayuda',
  });
  assert.match(m.asunto, /Estudio de ejemplo/);
  assert.match(m.cuerpo, /El código:\n<iframe src="x"><\/iframe>/);
  assert.match(m.cuerpo, /1\. Uno\.\n2\. Dos\./);
  assert.match(m.cuerpo, /https:\/\/example\.com\/ayuda/);
});

// ── Dominios ─────────────────────────────────────────────────────────────────

test('se autorizan a la vez la web con y sin www, solo cuando es inequívoco', () => {
  assert.deepEqual(origenesConYSinWww('https://estudio.example'), ['https://estudio.example', 'https://www.estudio.example']);
  assert.deepEqual(origenesConYSinWww('https://www.estudio.example'), ['https://www.estudio.example', 'https://estudio.example']);
  assert.deepEqual(origenesConYSinWww('https://reservas.estudio.example'), ['https://reservas.estudio.example']);
  assert.deepEqual(origenesConYSinWww('http://localhost:3000'), ['http://localhost:3000']);
  assert.deepEqual(origenesConYSinWww('no-es-url'), ['no-es-url']);
});
