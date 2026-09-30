import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WIDGETS, esDisponible, widgetPorId, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, claveDeCopia, leerCopiados, nuevaCopia, type ConfigConstructor } from './config.ts';
import { GRUPOS, GRUPOS_EN_EL_HTML, gruposSinAplicar, piezaCopiada, textosEnTuWeb } from './en-tu-web.ts';
import { firmaCodigo, firmaContenidoDe, generarCodigo, type EntradaIntegracion } from './integracion.ts';
import { claveVista, formaDeMetodo, type VistoWidget } from './pegado.ts';
import { firmaDeUrl } from './firma-contenido.ts';
import { urlPopupPermitida } from './popup-url.ts';
import { destinoDePieza, entradaDePieza } from './pieza-destino.ts';
import { MENSAJE_PIEZA_CAMBIADA, nuevoIdPieza, validarPedidoPieza } from './pieza-pedido.ts';
import { copiaTrasAplicar, leerPiezaGuardada, leerPiezasGuardadas } from './pieza-panel.ts';

// El código del widget por ID, lado de emitir y aplicar (30-sep-2026): el panel
// da un código con SOLO el id, lo publicado cambia con «Aplicar en mi web», y lo
// que va en el propio HTML (ancho, carga diferida, botón) es lo único que obliga
// a pegarlo otra vez.

const ORIGEN = 'https://www.tentare.app';
const SLUG = 'pilates-centro';
const ID = 'Ab3dE5gH9k';

function w(id: string): WidgetDisponible {
  const x = widgetPorId(id);
  assert.ok(esDisponible(x), id);
  return x;
}
const HORARIO = w('horario');
const entrada = (parcial: Partial<ConfigConstructor> = {}, pieza: string | null = ID, widget = HORARIO): EntradaIntegracion => ({
  widget, config: { ...CONFIG_POR_DEFECTO, sesion: 'ses-1', ...parcial }, origen: ORIGEN, slug: SLUG, colorEstudio: '#7A2E4F', pieza,
});

// ── El código ────────────────────────────────────────────────────────────────

test('⚠️ por id, el código lleva SOLO el id: ni filtros, ni diseño, ni etiqueta', () => {
  const e = entrada({ tipos: ['tc-r'], mostrarPrecio: false, identidad: 'propia', marca: '#112233', etiqueta: 'insta' });
  const esperado: Record<MetodoIntegracion, string> = {
    iframe: `${ORIGEN}/reservar/${SLUG}?embed=1&w=${ID}`,
    popup: `${ORIGEN}/reservar/${SLUG}?w=${ID}`,
    boton: `${ORIGEN}/reservar/${SLUG}?w=${ID}`,
    enlace: `${ORIGEN}/reservar/${SLUG}?w=${ID}`,
    nativa: `data-widget="${ID}"`,
  };
  for (const m of Object.keys(esperado) as MetodoIntegracion[]) {
    for (const plataforma of ['html', 'react'] as const) {
      const { codigo } = generarCodigo(e, m, plataforma);
      assert.ok(codigo.includes(esperado[m]), `${m}/${plataforma}: ${codigo.slice(0, 160)}`);
      for (const nunca of ['tipos=', 'ocultar-', 'marca=', 'data-tipos', 'data-marca', 'data-ref', 'data-ocultar']) {
        assert.ok(!codigo.includes(nunca), `${m}/${plataforma} lleva ${nunca}`);
      }
      // La etiqueta (`ref=`) tampoco; el `ref={ref}` del componente de React no es ella.
      assert.doesNotMatch(codigo, /[?&]ref=/, `${m}/${plataforma} lleva la etiqueta`);
    }
  }
});

test('sin id, el código congelado de siempre, carácter por carácter', () => {
  for (const x of WIDGETS.filter(esDisponible)) {
    for (const m of x.metodos) {
      const congelado = { ...entrada({ tipos: ['tc-r'] }, null, x) };
      const sinCampo: EntradaIntegracion = { widget: congelado.widget, config: congelado.config, origen: ORIGEN, slug: SLUG, colorEstudio: '#7A2E4F' };
      assert.equal(generarCodigo(congelado, m).codigo, generarCodigo(sinCampo, m).codigo, `${x.id}/${m}`);
    }
  }
});

test('⚠️ por id, cambiar lo que enseña NO cambia el código; lo que va en el HTML, sí', () => {
  for (const m of ['iframe', 'popup', 'nativa', 'boton', 'enlace'] as const) {
    const base = firmaCodigo(entrada(), m);
    assert.equal(firmaCodigo(entrada({ tipos: ['tc-r'], mostrarPrecio: false, mostrarPie: false, etiqueta: 'otra', sesion: 'ses-2' }), m), base, `${m}: el contenido va por id`);
  }
  assert.notEqual(firmaCodigo(entrada({ ancho: 'compacto' }), 'iframe'), firmaCodigo(entrada({ ancho: 'completo' }), 'iframe'));
  assert.notEqual(firmaCodigo(entrada({ cargaDiferida: false }), 'iframe'), firmaCodigo(entrada(), 'iframe'));
  assert.notEqual(firmaCodigo(entrada({ textoBoton: 'Ven' }), 'popup'), firmaCodigo(entrada(), 'popup'));
  assert.notEqual(firmaCodigo(entrada({ abrirEn: 'misma' }), 'boton'), firmaCodigo(entrada(), 'boton'));
  assert.notEqual(firmaCodigo(entrada({}, 'Zz9yX8wV7u'), 'iframe'), firmaCodigo(entrada(), 'iframe'), 'otro id es otro código');
});

test('⚠️ de punta a punta: el código por id, abierto, firma lo PUBLICADO (dentro de una página y encima)', () => {
  const publicada = { tipos: ['tc-r'], mostrarPrecio: false, etiqueta: 'insta' };
  const e = entrada(publicada);
  const pieza = entradaDePieza({ widget: 'horario', config: JSON.parse(JSON.stringify(e.config)) }, SLUG);
  const iframe = new URL(generarCodigo(e, 'iframe').codigo.match(/src="([^"]+)"/)![1].replace(/&amp;/g, '&'));
  const llegaIframe = new URL(destinoDePieza(pieza, SLUG, iframe.searchParams), ORIGEN);
  assert.equal(firmaDeUrl(llegaIframe.searchParams), firmaContenidoDe({ ...e, pieza: null }, 'iframe'));
  const popup = urlPopupPermitida(generarCodigo(e, 'popup').codigo.match(/data-tentare-popup="([^"]+)"/)![1], ORIGEN)!;
  const llegaPopup = new URL(destinoDePieza(pieza, SLUG, new URL(popup).searchParams), ORIGEN);
  assert.equal(firmaDeUrl(llegaPopup.searchParams), firmaContenidoDe({ ...e, pieza: null }, 'popup'));
});

// ── Lo que se aplica ─────────────────────────────────────────────────────────

test('gruposSinAplicar: lo que llega al aplicar, sin lo que va en el HTML', () => {
  const pub = { ...CONFIG_POR_DEFECTO };
  assert.deepEqual(gruposSinAplicar(pub, { ...pub }), []);
  assert.deepEqual(gruposSinAplicar(pub, { ...pub, tipos: ['tc-r'], mostrarPie: false }), ['qué clases salen', 'el pie']);
  assert.deepEqual(gruposSinAplicar(pub, { ...pub, ancho: 'compacto', cargaDiferida: false, textoBoton: 'Ven', estiloBoton: 'contorno', abrirEn: 'misma' }), []);
  // Los tres del HTML existen de verdad en GRUPOS (si se renombran, esto avisa).
  for (const g of GRUPOS_EN_EL_HTML) assert.ok(GRUPOS.some(x => x.nombre === g), g);
});

test('el pedido de aplicar: se normaliza, y lo raro se rechaza', () => {
  const ok = validarPedidoPieza({ widget: 'horario', config: { tipos: ['tc-r', '<x>'], marca: 'rojo' }, esperado: null });
  assert.ok(ok.ok);
  assert.deepEqual(ok.pedido.config.tipos, ['tc-r']);
  assert.equal(ok.pedido.config.marca, null);
  assert.equal(ok.pedido.esperado, null);
  const conFecha = validarPedidoPieza({ widget: 'horario', config: {}, esperado: '2026-09-30T00:00:00.123+00:00' });
  assert.ok(conFecha.ok && conFecha.pedido.esperado === '2026-09-30T00:00:00.123+00:00');
  for (const malo of [null, [], 'x', { config: {} }, { widget: 'horario' }, { widget: 'horario', config: [] },
    { widget: 'no-existe', config: {} }, { widget: 'horario', config: {}, esperado: 'ayer' },
    { widget: 'horario', config: { tipos: Array.from({ length: 201 }, (_, i) => `t${i}`) } },
    { widget: 'clase', config: {} }, { widget: 'horario', config: { textoBoton: 'x'.repeat(30_000) } }]) {
    assert.equal(validarPedidoPieza(malo).ok, false, JSON.stringify(malo)?.slice(0, 80));
  }
  assert.ok(MENSAJE_PIEZA_CAMBIADA.length > 20);
});

test('un id nuevo: 10 caracteres base62, sin sesgo (descarta los bytes altos)', () => {
  for (let i = 0; i < 50; i++) assert.match(nuevoIdPieza(), /^[A-Za-z0-9]{10}$/);
  let llamada = 0;
  // Primero solo bytes que se descartan; después, ceros: sale todo «A».
  const falso = (b: Uint8Array) => { b.fill(llamada++ === 0 ? 255 : 0); return b; };
  assert.equal(nuevoIdPieza(falso), 'AAAAAAAAAA');
});

test('lo publicado, leído con desconfianza (fila de la BD o respuesta de la API)', () => {
  const fila = { id: ID, widget: 'horario', config: { tipos: ['tc-r'] }, actualizado_en: '2026-09-30T00:00:00+00:00' };
  const p = leerPiezaGuardada(fila);
  assert.ok(p);
  assert.deepEqual(p.config.tipos, ['tc-r']);
  assert.equal(p.actualizadoEn, fila.actualizado_en);
  assert.ok(leerPiezaGuardada({ id: ID, config: {}, actualizadoEn: fila.actualizado_en }));
  for (const malo of [null, { ...fila, id: 'corto' }, { ...fila, actualizado_en: 'x' }, { ...fila, config: [] }]) {
    assert.equal(leerPiezaGuardada(malo), null);
  }
  assert.deepEqual(Object.keys(leerPiezasGuardadas([fila, { ...fila, widget: 7 }, null])), ['horario']);
});

test('la copia guarda el id con el que se copió, y lo lee de vuelta', () => {
  const k = nuevaCopia(null, { firma: 'abc', en: '2026-09-30T00:00:00Z', metodo: 'iframe', config: CONFIG_POR_DEFECTO, contenido: null, pieza: ID });
  assert.equal(k.pieza, ID);
  assert.equal(leerCopiados({ horario: { copiado: k } }).horario.pieza, ID);
  assert.equal(leerCopiados({ horario: { copiado: { ...k, pieza: '../x' } } }).horario.pieza, undefined);
});

// ── Qué dice la pantalla de una copia por id ─────────────────────────────────

const AHORA = Date.parse('2026-09-30T12:00:00Z');
const H = 3600_000;
function visto(firma: string, haceH: number): VistoWidget {
  return { origen: 'web-horario', forma: 'incrustado', anfitrion: 'https://albapilates.example.com', firma, primero: new Date(AHORA - 72 * H).toISOString(), ultimo: new Date(AHORA - haceH * H).toISOString(), n: 3 };
}

test('⚠️ por id: cambiar lo que enseña NO pide copiar otra vez; cambiar el ancho, sí', () => {
  const copiada = entrada({ ancho: 'compacto' });
  const firma = firmaCodigo(copiada, 'iframe');
  const k = nuevaCopia(null, { firma, en: new Date(AHORA - 48 * H).toISOString(), metodo: 'iframe', config: copiada.config, contenido: firmaContenidoDe(copiada, 'iframe'), pieza: ID });
  const comun = { puedeGenerar: true, vistos: [], mes: null, ahora: AHORA, publicada: copiada.config } as const;
  const contenido = piezaCopiada({ ...comun, copia: k, base: entrada({ ancho: 'compacto', tipos: ['tc-r'] }), metodoAhora: 'iframe' });
  assert.equal(contenido.desfasado, false);
  const ancho = piezaCopiada({ ...comun, copia: k, base: entrada({ ancho: 'completo' }), metodoAhora: 'iframe' });
  assert.equal(ancho.desfasado, true);
  assert.deepEqual(ancho.cambios, ['el ancho']);
});

test('⚠️ un código de antes (congelado) sigue avisando por el contenido, aunque el de ahora vaya por id', () => {
  const copiada = entrada({}, null);
  const k = nuevaCopia(null, { firma: firmaCodigo(copiada, 'iframe'), en: new Date(AHORA - 48 * H).toISOString(), metodo: 'iframe', config: copiada.config, contenido: firmaContenidoDe(copiada, 'iframe') });
  const p = piezaCopiada({ copia: k, base: entrada({ tipos: ['tc-r'] }), metodoAhora: 'iframe', puedeGenerar: true, vistos: [], mes: null, ahora: AHORA, publicada: null });
  assert.equal(p.desfasado, true);
  assert.deepEqual(p.cambios, ['qué clases salen']);
});

test('por id, lo que ve su web se compara con lo PUBLICADO; una versión anterior «se pondrá al día sola»', () => {
  const antes = entrada({ tipos: ['tc-m'] });
  const publicada = entrada({ tipos: ['tc-r'] });
  const contenidoAntes = firmaContenidoDe(antes, 'iframe')!;
  const contenidoPub = firmaContenidoDe(publicada, 'iframe')!;
  const k = copiaTrasAplicar(
    nuevaCopia(null, { firma: firmaCodigo(antes, 'iframe'), en: new Date(AHORA - 48 * H).toISOString(), metodo: 'iframe', config: antes.config, contenido: contenidoAntes, pieza: ID }),
    contenidoPub,
  );
  assert.equal(claveDeCopia(k), claveVista(formaDeMetodo('iframe')!, contenidoPub));
  assert.ok(k.anteriores?.includes(claveVista('incrustado', contenidoAntes)));
  const comun = { copia: k, base: entrada({ tipos: ['tc-otra-sin-aplicar'] }), metodoAhora: 'iframe' as const, puedeGenerar: true, mes: null, ahora: AHORA, publicada: publicada.config };
  const alDia = piezaCopiada({ ...comun, vistos: [visto(contenidoPub, 1)] });
  assert.equal(alDia.estado.tipo === 'visto' && alDia.estado.version, 'al-dia', 'el borrador sin aplicar no cuenta como «lo de ahora»');
  const anterior = piezaCopiada({ ...comun, vistos: [visto(contenidoAntes, 1)] });
  assert.equal(anterior.estado.tipo === 'visto' && anterior.estado.version, 'anterior');
  assert.match(textosEnTuWeb(anterior.estado, AHORA).version ?? '', /Se pondrá al día sola/);
  // Sin saber lo publicado, no se dice qué versión enseña.
  const sinPub = piezaCopiada({ ...comun, publicada: null, vistos: [visto(contenidoAntes, 1)] });
  assert.equal(sinPub.estado.tipo === 'visto' && sinPub.estado.version, null);
});

// ── La ruta de aplicar ───────────────────────────────────────────────────────

test('⚠️ la ruta de aplicar: solo la propietaria, el estudio de la sesión y sin escritura a ciegas', () => {
  const ruta = readFileSync(join(import.meta.dirname, '..', '..', 'app/api/estudio/widget-pieza/route.ts'), 'utf8');
  assert.match(ruta, /sesion\.rol !== 'PROPIETARIO'/);
  assert.match(ruta, /studio_id: sesion\.studioId/);
  assert.match(ruta, /\.eq\('studio_id', sesion\.studioId\)\.eq\('widget', widget\)\.eq\('actualizado_en', esperado\)/);
  assert.doesNotMatch(ruta, /body\.studio|pedido\.studio|studioId:\s*validado/);
});
