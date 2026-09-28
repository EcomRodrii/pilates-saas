import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirEstiloWeb } from './estilo-web-aplicar.ts';
import { WIDGET_WEB_NEUTRO, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { MENSAJE_FUNDIDO_ILEGIBLE } from '../reservar/estilo-web.ts';
import { DEFAULT_THEME, resolveTheme } from '../theme-schema.ts';

const w = (parcial: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });
const ARENA = w({ estilo: 'arena', letra: 'editorial' });
const CARBON = w({ estilo: 'carbon' });

test('primera vez: de «nada» a Arena, con su línea de Actividad', () => {
  const d = decidirEstiloWeb(DEFAULT_THEME, { estilo: ARENA, esperado: null, motivo: 'aplicar' });
  assert.equal(d.tipo, 'escribir');
  if (d.tipo !== 'escribir') return;
  assert.deepEqual(d.cambios, { widgetWeb: ARENA });
  assert.deepEqual(d.aplicado, ARENA);
  assert.equal(d.anterior, null);
  assert.equal(d.texto, 'Estilo de tus widgets: Arena, solo para tu web · letra Editorial');
});

test('⚠️ si lo publicado ya no es lo que tenía en pantalla, no se escribe: otra pestaña lo cambió', () => {
  const publicado = { ...DEFAULT_THEME, widgetWeb: CARBON };
  assert.deepEqual(decidirEstiloWeb(publicado, { estilo: ARENA, esperado: null, motivo: 'aplicar' }), { tipo: 'cambiado' });
  // Un Deshacer que llega tarde tampoco pisa lo que aplicó otra.
  assert.deepEqual(decidirEstiloWeb(publicado, { estilo: null, esperado: ARENA, motivo: 'deshacer' }), { tipo: 'cambiado' });
  // «Nada elegido» y ausente son lo mismo para esta comprobación.
  assert.equal(decidirEstiloWeb(DEFAULT_THEME, { estilo: ARENA, esperado: w(), motivo: 'aplicar' }).tipo, 'escribir');
});

test('lo que no se lee no se escribe: 422 con el mismo aviso que el panel', () => {
  const gris = w({ web: 'otro', colorWeb: '#808080', fundido: true });
  assert.deepEqual(
    decidirEstiloWeb(DEFAULT_THEME, { estilo: gris, esperado: null, motivo: 'aplicar' }),
    { tipo: 'contraste', errores: [{ campo: 'colorWeb', mensaje: MENSAJE_FUNDIDO_ILEGIBLE }] },
  );
});

test('«nada elegido» se guarda como AUSENTE, no como un objeto neutro', () => {
  const publicado = { ...DEFAULT_THEME, widgetWeb: ARENA };
  for (const estilo of [null, w(), w({ web: 'oscura' })]) {
    const d = decidirEstiloWeb(publicado, { estilo, esperado: ARENA, motivo: 'deshacer' });
    assert.equal(d.tipo, 'escribir');
    if (d.tipo !== 'escribir') return;
    assert.equal(d.cambios.widgetWeb, undefined);
    assert.equal('widgetWeb' in JSON.parse(JSON.stringify({ ...publicado, ...d.cambios })), false);
    assert.equal(d.aplicado, null);
    assert.equal(d.texto, 'Estilo de tus widgets: vuelto al de antes');
  }
});

test('el `anterior` sale de la MISMA lectura que se sobrescribe, no de lo que diga el cliente', () => {
  const enBd = w({ estilo: 'carbon', web: 'otro', colorWeb: '#ABCDEF', fundido: false });
  const leida = resolveTheme({ ...DEFAULT_THEME, widgetWeb: enBd });
  // El cliente lo tenía igual salvo en mayúsculas: es el mismo estilo…
  const d = decidirEstiloWeb(leida, { estilo: ARENA, esperado: { ...enBd, colorWeb: '#abcdef' }, motivo: 'aplicar' });
  assert.equal(d.tipo, 'escribir');
  if (d.tipo !== 'escribir') return;
  // …pero lo que se guarda para Deshacer es lo que había en la fila.
  assert.deepEqual(d.anterior, enBd);
  // Y un publicado corrupto se lee como «nada»: el anterior es `null`, no basura.
  const corrupto = decidirEstiloWeb({ widgetWeb: { estilo: 'nope' } }, { estilo: ARENA, esperado: null, motivo: 'aplicar' });
  assert.equal(corrupto.tipo === 'escribir' && corrupto.anterior, null);
});

test('la base del contraste sale del tema publicado: su color y la apariencia de su app', () => {
  // Botones «tal cual» sobre un estilo claro con un gris medio: se oscurece y se deja.
  const d = decidirEstiloWeb({ ...DEFAULT_THEME, primary: '#787878', appAlumna: { estilo: 'luz', tipografia: 'moderna', marca: 'suave', boton: 'tinta', encuadre: null } },
    { estilo: w({ boton: 'fiel' }), esperado: null, motivo: 'aplicar' });
  assert.equal(d.tipo, 'escribir');
  if (d.tipo === 'escribir') assert.equal(d.texto, 'Estilo de tus widgets: igual que tu app · Luz · botones en tu color tal cual');
});
