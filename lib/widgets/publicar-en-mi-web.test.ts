import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_POR_DEFECTO, type ConfigConstructor, type Copiado } from './config.ts';
import { GRUPOS, GRUPOS_EN_EL_HTML } from './en-tu-web.ts';
import {
  descartarContenido, hayPendientes, pendientesDePublicar, resumenPublicacion, textoPendiente, type EstadoEstilo,
} from './publicar-en-mi-web.ts';

const ID = 'Ab3dE5gH9k';
const SIN_ESTILO: EstadoEstilo = { pendiente: false, errores: [], relectura: null };
const NOMBRES: Record<string, string> = { horario: 'Tu horario', planes: 'Tus precios' };
const nombre = (id: string) => NOMBRES[id] ?? id;
const conf = (p: Partial<ConfigConstructor> = {}): ConfigConstructor => ({ ...CONFIG_POR_DEFECTO, ...p });
const porId: Copiado = { firma: 'f', en: '2026-10-01T10:00:00.000Z', metodo: 'iframe', pieza: ID };

function pendientes(x: { copiados?: Record<string, Copiado>; ahora?: Record<string, ConfigConstructor>; publicadas?: Record<string, ConfigConstructor>; estilo?: EstadoEstilo }) {
  return pendientesDePublicar({
    estilo: x.estilo ?? SIN_ESTILO,
    copiados: x.copiados ?? { horario: porId },
    publicadas: Object.fromEntries(Object.entries(x.publicadas ?? { horario: conf() }).map(([k, c]) => [k, { config: c }])),
    configs: x.ahora ?? { horario: conf() },
    nombre,
  });
}

test('una pieza por id con lo que enseña cambiado está sin publicar, con QUÉ cambió', () => {
  const p = pendientes({ ahora: { horario: conf({ tipos: ['tc-m'] }) } });
  assert.deepEqual(p.piezas, [{ id: 'horario', nombre: 'Tu horario', grupos: ['qué clases salen'] }]);
  assert.equal(hayPendientes(p), true);
  assert.equal(textoPendiente(p), 'Sin publicar en tu web: qué clases salen de «Tu horario»');
});

test('⚠️ lo que va en el HTML (ancho, carga, botón) NUNCA está sin publicar: eso se pega', () => {
  for (const g of GRUPOS.filter(x => GRUPOS_EN_EL_HTML.has(x.nombre))) {
    const cambio: Record<string, unknown> = {};
    for (const k of g.campos) {
      const v = CONFIG_POR_DEFECTO[k];
      cambio[k] = typeof v === 'boolean' ? !v : k === 'ancho' ? 'compacto' : k === 'estiloBoton' ? 'contorno' : k === 'abrirEn' ? 'misma' : 'Ven a probar';
    }
    const p = pendientes({ ahora: { horario: conf(cambio as Partial<ConfigConstructor>) } });
    assert.deepEqual(p.piezas, [], g.nombre);
  }
});

test('⚠️ una copia SIN `pieza` (un código de antes) nunca está sin publicar: lo de ahí exige pegarlo', () => {
  const antigua: Copiado = { firma: 'f', en: '2026-09-01T10:00:00.000Z', metodo: 'iframe' };
  const p = pendientes({ copiados: { horario: antigua }, ahora: { horario: conf({ tipos: ['tc-m'] }) } });
  assert.deepEqual(p.piezas, []);
  assert.equal(hayPendientes(p), false);
  assert.equal(textoPendiente(p), null);
});

test('sin nada publicado de esa pieza, o sin config de ahora, no está pendiente', () => {
  assert.deepEqual(pendientes({ publicadas: {}, ahora: { horario: conf({ tipos: ['tc-m'] }) } }).piezas, []);
  assert.deepEqual(pendientes({ ahora: {} }).piezas, []);
});

test('el estilo y varias piezas en una frase; el contraste y la relectura bloquean', () => {
  const p = pendientes({
    estilo: { pendiente: true, errores: [], relectura: null },
    copiados: { horario: porId, planes: { ...porId, pieza: 'Zz9yX8wV7u' } },
    publicadas: { horario: conf(), planes: conf() },
    ahora: { horario: conf({ tipos: ['tc-m'] }), planes: conf({ tiposPlan: ['BONO'] }) },
  });
  assert.equal(p.bloqueo, null);
  assert.equal(textoPendiente(p), 'Sin publicar en tu web: el estilo, qué clases salen de «Tu horario» y qué planes salen de «Tus precios»');
  assert.equal(pendientes({ estilo: { pendiente: true, errores: [{ mensaje: 'Con este color de web, el texto fundido no se lee bien.' }], relectura: null } }).bloqueo,
    'Con este color de web, el texto fundido no se lee bien.');
  assert.match(pendientes({ estilo: { pendiente: false, errores: [], relectura: 'releyendo' } }).bloqueo!, /Leyendo/);
  assert.match(pendientes({ estilo: { pendiente: false, errores: [], relectura: 'fallo' } }).bloqueo!, /No hemos podido leer/);
});

test('descartarContenido vuelve a lo publicado en lo que se publica, y NO toca ancho, botón ni carga', () => {
  const ahora = conf({ tipos: ['tc-m'], mostrarPrecio: false, ancho: 'compacto', cargaDiferida: false, textoBoton: 'Ven', estiloBoton: 'contorno', abrirEn: 'misma' });
  const publicada = conf({ tipos: ['tc-r'] });
  const r = descartarContenido(ahora, publicada);
  assert.deepEqual(r.tipos, ['tc-r']);
  assert.equal(r.mostrarPrecio, publicada.mostrarPrecio);
  assert.equal(r.ancho, 'compacto');
  assert.equal(r.cargaDiferida, false);
  assert.equal(r.textoBoton, 'Ven');
  assert.equal(r.estiloBoton, 'contorno');
  assert.equal(r.abrirEn, 'misma');
  // Y con eso, ya no queda nada sin publicar.
  assert.deepEqual(pendientes({ ahora: { horario: r }, publicadas: { horario: publicada } }).piezas, []);
});

test('resumenPublicacion: todo bien, a medias y todo mal; nunca «Publicado» a secas con un fallo', () => {
  const estilo = { tipo: 'estilo' } as const;
  const precios = { tipo: 'pieza', id: 'planes', nombre: 'Tus precios' } as const;
  const horario = { tipo: 'pieza', id: 'horario', nombre: 'Tu horario' } as const;
  assert.equal(resumenPublicacion([]), null);
  assert.deepEqual(resumenPublicacion([{ que: estilo, ok: true }, { que: horario, ok: true }]), { tono: 'ok', texto: 'Publicado. Tu web lo enseñará en unos minutos.' });

  const parcial = resumenPublicacion([{ que: estilo, ok: true }, { que: precios, ok: false, error: 'No se han podido aplicar los cambios. Vuelve a intentarlo.' }])!;
  assert.equal(parcial.tono, 'parcial');
  assert.equal(parcial.texto, 'Publicado el estilo. «Tus precios» no se ha podido publicar: No se han podido aplicar los cambios. Vuelve a intentarlo.');

  const dos = resumenPublicacion([{ que: estilo, ok: true }, { que: precios, ok: false, error: 'x' }, { que: horario, ok: false, error: 'x' }])!;
  assert.match(dos.texto, /«Tus precios» y «Tu horario» no se han podido publicar/);

  const mal = resumenPublicacion([{ que: estilo, ok: false, error: 'Con este color de web, el texto fundido no se lee bien. Prueba «En su propio recuadro».' }])!;
  assert.deepEqual(mal, { tono: 'error', texto: 'Con este color de web, el texto fundido no se lee bien. Prueba «En su propio recuadro».' });
  for (const r of [parcial, dos, mal]) assert.doesNotMatch(r.texto, /^Publicado\. Tu web/);
});

test('un 409 se dice como lo que es: otra pestaña publicó, se ha vuelto a leer y no se reintenta solo', () => {
  const r = resumenPublicacion([{ que: { tipo: 'pieza', id: 'horario', nombre: 'Tu horario' }, ok: false, error: 'Recarga la página…', motivo: 'cambiado' }])!;
  assert.equal(r.tono, 'error');
  assert.match(r.texto, /^«Tu horario» acaba de cambiar desde otra pestaña\. Hemos vuelto a leer/);
  const e = resumenPublicacion([{ que: { tipo: 'estilo' }, ok: false, error: 'x', motivo: 'cambiado' }])!;
  assert.match(e.texto, /^El estilo de tus widgets acaba de cambiar desde otra pestaña/);
});
