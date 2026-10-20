import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esDisponible, widgetPorId, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, fusionarWidgetBuilder, leerConfigs, leerCopiados, nuevaCopia, type ConfigConstructor, type Copiado } from './config.ts';
import { GRUPOS, GRUPO_SOLO_HORARIO, gruposCambiados, gruposSinAplicar, piezaCopiada } from './en-tu-web.ts';
import { firmaCodigo, type EntradaIntegracion } from './integracion.ts';
import { NOMBRE_SOLO_HORARIO, avisoSoloHorario } from './solo-horario.ts';
import { leerWeb } from './recetas.ts';
import { descartarContenido } from './publicar-en-mi-web.ts';
import { destinoDePieza, entradaDePieza } from './pieza-destino.ts';
import { CONFIG_WIDGET_POR_DEFECTO, resolverConfigWidget } from '../reservar/config-widget.ts';

const w = (id: string): WidgetDisponible => {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x));
  return x;
};
const HORARIO = w('horario');
const ANTES = { firma: 'abc123', en: '2026-10-01T10:00:00.000Z', metodo: 'iframe' as const, config: { ...CONFIG_POR_DEFECTO, soloHorario: false } };
// Lo que sale de LEER una copia hecha antes de la opción (el campo no estaba).
const copiaDeAntes = (extra: Partial<Copiado> = {}): Copiado => ({ ...ANTES, antesDeSolo: true, ...extra });
const cfg = (p: Partial<ConfigConstructor> = {}): ConfigConstructor => ({ ...CONFIG_POR_DEFECTO, ...p });

const aviso = (x: { copia?: Copiado | null; ahora?: ConfigConstructor; metodoAhora?: 'iframe' | 'popup' | 'nativa' | 'boton' | 'enlace'; publicada?: ConfigConstructor | null; widget?: WidgetDisponible }) =>
  avisoSoloHorario({ widget: x.widget ?? HORARIO, copia: 'copia' in x ? x.copia : copiaDeAntes(), ahora: x.ahora ?? cfg(), metodoAhora: x.metodoAhora ?? 'iframe', publicada: x.publicada ?? null });

test('el aviso de recuperarlo, con las palabras del fundador y sin llamar a la opción de otra manera', () => {
  const a = aviso({})!;
  assert.equal(a.modo, 'copiar');
  assert.equal(a.texto, 'Si en tu web te salen los bonos y las cuotas debajo del horario, vuelve a copiar el código: el nuevo trae «Tu horario, tus clases» activado. El que ya tienes pegado no cambia solo.');
  assert.deepEqual(a.accion, { texto: 'Copiar el código nuevo', hace: 'copiar' });
  assert.equal(NOMBRE_SOLO_HORARIO, 'Tu horario, tus clases');
  // Ningún texto de este paso habla de «nada más debajo».
  assert.doesNotMatch(a.texto, /nada más/i);
});

test('NO sale: sin copia, con el código nuevo (con la opción o apagada a propósito), ni donde el código nuevo no la trae', () => {
  // Aún no ha copiado nada.
  assert.equal(aviso({ copia: null }), null);
  assert.equal(aviso({ copia: undefined }), null);
  // Ya tiene su código nuevo: la copia hecha con la opción no es «de antes» (no lleva `antesDeSolo`)…
  const nueva = nuevaCopia(undefined, { firma: 'x1', en: ANTES.en, metodo: 'iframe', config: cfg(), contenido: null });
  assert.equal(nueva.antesDeSolo, undefined);
  assert.equal(aviso({ copia: nueva }), null);
  // …ni la hecha con la opción apagada a propósito: es su decisión.
  assert.equal(aviso({ copia: nuevaCopia(undefined, { firma: 'x2', en: ANTES.en, metodo: 'iframe', config: cfg({ soloHorario: false }), contenido: null }) }), null);
  // Las formas que no la llevan: ni lo copiado ni lo de ahora.
  for (const m of ['nativa', 'boton', 'enlace'] as const) {
    assert.equal(aviso({ copia: copiaDeAntes({ metodo: m }) }), null, `copiado ${m}`);
    assert.equal(aviso({ metodoAhora: m }), null, `ahora ${m}`);
  }
  assert.equal(aviso({ copia: copiaDeAntes({ metodo: undefined }) }), null, 'una copia muy antigua sin forma: no se sabe, no se dice');
  // Otros widgets: no son el horario.
  for (const id of ['planes', 'contacto', 'prueba', 'equipo']) assert.equal(aviso({ widget: w(id) }), null, id);
  // Con la opción apagada hoy, el código nuevo no la traería: prometer «el nuevo trae…» sería falso.
  assert.equal(aviso({ ahora: cfg({ soloHorario: false }) }), null);
});

test('popup (encima de la página) también', () => {
  assert.equal(aviso({ copia: copiaDeAntes({ metodo: 'popup' }), metodoAhora: 'popup' })?.modo, 'copiar');
});

test('por id: se arregla publicando, no copiando; sin lo publicado leído, no se dice nada, y publicada la opción, deja de salir', () => {
  const porId = copiaDeAntes({ pieza: 'Ab3dE5gH9k' });
  const publicadaDeAntes = cfg({ soloHorario: false });
  // Sin leer lo publicado: no se sabe.
  assert.equal(aviso({ copia: porId, publicada: null }), null);
  // Con la opción aún apagada aquí: el aviso trae su botón para encenderla.
  const a = aviso({ copia: porId, publicada: publicadaDeAntes, ahora: cfg({ soloHorario: false }) })!;
  assert.equal(a.modo, 'publicar');
  assert.match(a.texto, /activa «Tu horario, tus clases» y pulsa «Publicar en mi web»: el código que ya tienes pegado no cambia/);
  assert.deepEqual(a.accion, { texto: 'Activar «Tu horario, tus clases»', hace: 'activar-solo-horario' });
  // Ya encendida y a falta de publicar: sin botón (la barra «Publicar en mi web» está a la vista).
  assert.equal(aviso({ copia: porId, publicada: publicadaDeAntes, ahora: cfg({ soloHorario: true }) })!.accion, null);
  // Publicada: ya no hace falta decir nada.
  assert.equal(aviso({ copia: porId, publicada: cfg({ soloHorario: true }), ahora: cfg({ soloHorario: true }) }), null);
});

test('leerCopiados marca lo de antes y lo conserva al guardar y volver a leer; una copia nueva no lo lleva', () => {
  const leida = leerCopiados({ horario: { copiado: { firma: 'abc123', en: ANTES.en, metodo: 'iframe', config: { tipos: ['tc-r'] } } } }).horario;
  assert.equal(leida.antesDeSolo, true);
  assert.equal(leida.config?.soloHorario, false);
  // Guardar y leer otra vez: la foto ya lleva el campo (apagado), pero el marcador sigue.
  const guardado = JSON.parse(JSON.stringify(fusionarWidgetBuilder({}, {}, { horario: leida }, leerWeb({})))) as Record<string, unknown>;
  assert.equal(leerCopiados(guardado).horario.antesDeSolo, true);
  // Una copia nueva (con el campo en su foto) no es de antes.
  const nueva = nuevaCopia(undefined, { firma: 'n1', en: ANTES.en, metodo: 'iframe', config: cfg(), contenido: null });
  const guardadoNuevo = JSON.parse(JSON.stringify(fusionarWidgetBuilder({}, {}, { horario: nueva }, leerWeb({})))) as Record<string, unknown>;
  assert.equal(leerCopiados(guardadoNuevo).horario.antesDeSolo, undefined);
  // Copiar otra vez un código por id de antes no lo hace «nuevo»: lo decide lo publicado.
  const porId = nuevaCopia(copiaDeAntes({ pieza: 'Ab3dE5gH9k' }), { firma: 'n2', en: ANTES.en, metodo: 'iframe', config: cfg(), contenido: null, pieza: 'Ab3dE5gH9k' });
  assert.equal(porId.antesDeSolo, true);
  // Un código congelado, sí.
  assert.equal(nuevaCopia(copiaDeAntes(), { firma: 'n3', en: ANTES.en, metodo: 'iframe', config: cfg(), contenido: null }).antesDeSolo, undefined);
});

test('lo ya copiado de antes NO se ve como «cambiado por ti» solo porque el código de ahora lleve la opción', () => {
  const base: EntradaIntegracion = { widget: HORARIO, config: cfg({ soloHorario: true }), origen: 'https://www.tentare.app', slug: 'alba', colorEstudio: '#7A2E4F' };
  const antes = { ...base, config: cfg({ soloHorario: false }) };
  const k = copiaDeAntes({ firma: firmaCodigo({ ...antes, pieza: null }, 'iframe') });
  const p = piezaCopiada({ copia: k, base, metodoAhora: 'iframe', puedeGenerar: true, vistos: undefined, mes: null, ahora: Date.now() });
  assert.equal(p.desfasado, false);
  assert.deepEqual(p.cambios ?? [], []);
  // Y sin foto (una copia de antes de la Fase C): lo mismo.
  const { config: _foto, ...sinFoto } = k;
  assert.equal(piezaCopiada({ copia: sinFoto, base, metodoAhora: 'iframe', puedeGenerar: true, vistos: undefined, mes: null, ahora: Date.now() }).desfasado, false);
  // Pero un cambio de VERDAD sí se dice (la opción no tapa otros).
  const q = piezaCopiada({ copia: k, base: { ...base, config: cfg({ soloHorario: true, tipos: ['tc-r'] }) }, metodoAhora: 'iframe', puedeGenerar: true, vistos: undefined, mes: null, ahora: Date.now() });
  assert.equal(q.desfasado, true);
  assert.deepEqual(q.cambios, ['qué clases salen']);
});

test('apagarla y volver a encenderla ES un cambio después de copiar: sale en «lo cambiaste»', () => {
  const base: EntradaIntegracion = { widget: HORARIO, config: cfg({ soloHorario: false }), origen: 'https://www.tentare.app', slug: 'alba', colorEstudio: null };
  const foto = cfg({ soloHorario: true });
  assert.deepEqual(gruposCambiados(foto, base, 'iframe', 'iframe').map(g => g.nombre), [GRUPO_SOLO_HORARIO]);
  assert.equal(gruposCambiados(foto, base, 'iframe', 'iframe')[0].seVe, true);
  // En la integración sin marco no la emite nadie: no hay cambio que decir.
  assert.deepEqual(gruposCambiados(foto, base, 'nativa', 'nativa'), []);
});

test('«sin publicar»: la opción cuenta como un grupo que llega al publicar, y solo donde existe', () => {
  assert.ok(GRUPOS.some(g => g.nombre === GRUPO_SOLO_HORARIO && g.campos.includes('soloHorario')));
  const publicada = cfg({ soloHorario: false });
  const ahora = cfg({ soloHorario: true });
  assert.deepEqual(gruposSinAplicar(publicada, ahora, HORARIO), [GRUPO_SOLO_HORARIO]);
  assert.deepEqual(gruposSinAplicar(publicada, ahora), [GRUPO_SOLO_HORARIO]);
  // En un widget que no la tiene, que difiera no es «sin publicar».
  for (const id of ['planes', 'contacto', 'prueba']) assert.deepEqual(gruposSinAplicar(publicada, ahora, w(id)), [], id);
  // «Descartar» vuelve a lo publicado también en esto.
  assert.equal(descartarContenido(ahora, publicada).soloHorario, false);
});

test('el motor lee `solo=1` y nada más (un valor raro se ignora, nunca `Boolean("false")`)', () => {
  const lee = (q: string) => resolverConfigWidget(new URLSearchParams(q)).solo;
  assert.equal(lee('embed=1&tab=clases'), false);
  assert.equal(lee('solo=1'), true);
  assert.equal(lee('solo=0'), false);
  assert.equal(lee('solo=false'), false);
  assert.equal(lee('solo=quizá'), false);
  assert.equal(CONFIG_WIDGET_POR_DEFECTO.solo, false);
});

test('el borrador de un estudio que ya tenía un código por id copiado NO enciende la opción solo (no deja un cambio sin pedir)', () => {
  const porId = leerConfigs({ horario: { tipos: ['tc-r'], copiado: { firma: 'a1', en: ANTES.en, metodo: 'iframe', pieza: 'Ab3dE5gH9k' } } }).horario;
  assert.equal(porId.soloHorario, false);
  // Uno congelado de antes sí: el código NUEVO que se copie la lleva.
  const congelado = leerConfigs({ horario: { tipos: ['tc-r'], copiado: { firma: 'a1', en: ANTES.en, metodo: 'iframe' } } }).horario;
  assert.equal(congelado.soloHorario, true);
});

test('⚠️ lo ya publicado por id NO cambia: sin el campo, su destino es el de siempre; con la opción publicada, lleva `solo=1`', () => {
  const entrante = new URLSearchParams('embed=1&w=Ab3dE5gH9k');
  const destino = (config: unknown) => destinoDePieza(entradaDePieza({ widget: 'horario', config }, 'alba'), 'alba', entrante);
  // Una pieza publicada ANTES de la opción (sin el campo): el mismo destino que antes, sin `solo`.
  assert.equal(destino({ tipos: ['tc-r'] }), '/reservar/alba?embed=1&tab=clases&tipos=tc-r&ref=web-horario');
  assert.equal(destino({}), '/reservar/alba?embed=1&tab=clases&ref=web-horario');
  // Publicada con la opción apagada: igual.
  assert.equal(destino({ soloHorario: false }), '/reservar/alba?embed=1&tab=clases&ref=web-horario');
  // Publicada con la opción: lo único que cambia es `solo=1`.
  assert.equal(destino({ soloHorario: true }), '/reservar/alba?embed=1&tab=clases&solo=1&ref=web-horario');
  // Un `solo` que llegue en la URL del código pegado no cuenta: manda lo publicado.
  assert.equal(destinoDePieza(entradaDePieza({ widget: 'horario', config: {} }, 'alba'), 'alba', new URLSearchParams('embed=1&w=Ab3dE5gH9k&solo=1')), '/reservar/alba?embed=1&tab=clases&ref=web-horario');
});
