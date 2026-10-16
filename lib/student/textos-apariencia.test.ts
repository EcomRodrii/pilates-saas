import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TEXTO_RESERVAS_Y_WIDGET, TEXTO_SECUNDARIO } from './textos-apariencia.ts';
import { temaReservarCssText } from '../reservar/tema-app.ts';
import { ESTILO_IDS } from './apariencia.ts';

// Lo que el editor dice que llega (o no) a /reservar, cruzado con lo que hace
// `temaReservarCssText`. Si una de estas pruebas falla porque ahora SÍ llega,
// lo que hay que cambiar es el texto, no la prueba.

const MARCA = { brand: '#A85C72', foreground: '#FFFFFF', texto: '#A85C72' };
const css = (app: Record<string, unknown>) => temaReservarCssText('#A85C72', app, MARCA);

test('el botón principal NO llega a /reservar (el texto dice que solo cambia en la app)', () => {
  for (const estilo of ESTILO_IDS) for (const marca of ['suave', 'fiel']) {
    assert.equal(
      css({ estilo, marca, tipografia: 'editorial', boton: 'tinta' }),
      css({ estilo, marca, tipografia: 'editorial', boton: 'marca' }),
      `${estilo}/${marca}`,
    );
  }
  assert.match(TEXTO_RESERVAS_Y_WIDGET, /botón principal[^.]*solo cambian en tu app/);
});

test('las esquinas y el tamaño de los títulos NO llegan a /reservar', () => {
  for (const estilo of ESTILO_IDS) {
    const salida = css({ estilo, tipografia: 'romantica', marca: 'fiel' });
    assert.doesNotMatch(salida, /radius/, estilo);
    assert.doesNotMatch(salida, /heading-scale|heading-tracking/, estilo);
  }
  assert.match(TEXTO_RESERVAS_Y_WIDGET, /esquinas[^.]*tamaño de los títulos solo cambian en tu app/);
});

test('el estilo, la tipografía y el color SÍ llegan a /reservar (el texto lo promete)', () => {
  const base = css({});
  assert.notEqual(css({ estilo: 'carbon' }), base, 'estilo');
  assert.notEqual(css({ tipografia: 'editorial' }), base, 'tipografía');
  assert.notEqual(temaReservarCssText('#2F6F8F', { marca: 'fiel' }, MARCA), temaReservarCssText('#A85C72', { marca: 'fiel' }, MARCA), 'color');
  assert.match(TEXTO_RESERVAS_Y_WIDGET, /toman de aquí el estilo, la tipografía y tu color/);
});

test('el color secundario: /reservar no lo recibe; el panel y los correos sí', () => {
  // `temaReservarCssText` ni siquiera recibe el secundario (solo `colorPrimario`).
  const tema = readFileSync(new URL('../reservar/tema-app.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(tema, /secondary/);
  assert.doesNotMatch(TEXTO_SECUNDARIO, /reservas/);
  assert.match(TEXTO_SECUNDARIO, /panel/);
  assert.match(TEXTO_SECUNDARIO, /correos/);
  const correos = readFileSync(new URL('../emails/plantillas-server.ts', import.meta.url), 'utf8');
  assert.match(correos, /colorSecundarioDelEstudio\(tema\?\.secondary/);
});

test('el editor usa estos textos y no vuelven las frases que no eran verdad', () => {
  const editor = readFileSync(new URL('../../components/apariencia/editor-apariencia-app.tsx', import.meta.url), 'utf8');
  assert.match(editor, /\{TEXTO_RESERVAS_Y_WIDGET\}/);
  assert.match(editor, /\{TEXTO_SECUNDARIO\}/);
  assert.doesNotMatch(editor, /solo tu panel y tu página de reservas/);
  assert.doesNotMatch(editor, /También se aplica a tu página de reservas/);
  assert.doesNotMatch(editor, /Cambia también tu página de reservas y el widget/);
});
