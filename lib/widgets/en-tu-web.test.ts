import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WIDGETS, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, nuevaCopia, type ConfigConstructor, type Copiado } from './config.ts';
import { embudoPorWidget } from './embudo.ts';
import {
  GRUPOS, MARGEN_MISMA_VERSION_MS, VENTANA_VERSION_MS, estadoEnTuWeb, gruposCambiados, hostDe, piezaCopiada, textoCambios,
  textosEnTuWeb, unirGrupos, webSinAutorizar, type EstadoEnTuWeb,
} from './en-tu-web.ts';
import { firmaCodigo, firmaContenidoDe, type EntradaIntegracion } from './integracion.ts';
import { claveVista, type FormaPegada, type VistoWidget } from './pegado.ts';

const HORARIO = WIDGETS.find((w): w is WidgetDisponible => w.id === 'horario' && w.estado === 'disponible')!;
const BASE: EntradaIntegracion = { widget: HORARIO, config: CONFIG_POR_DEFECTO, origen: 'https://app.example.com', slug: 'estudio-prueba' };
const conConfig = (parcial: Partial<ConfigConstructor>): EntradaIntegracion => ({ ...BASE, config: { ...CONFIG_POR_DEFECTO, ...parcial } });

const H = 3600_000;
const AHORA = Date.parse('2026-09-28T12:00:00.000Z');
const WEB = 'http://albapilates.example.com';
const OTRA_WEB = 'https://www.otra.example.com';
const iso = (t: number) => new Date(t).toISOString();

/** Una fila de `widget_vistos()`, con las horas contadas hacia atrás desde AHORA. */
function fila(p: { firma?: string | null; forma?: FormaPegada; anfitrion?: string | null; origen?: string; ultimo?: number; primero?: number }): VistoWidget {
  const ultimo = p.ultimo ?? 2 * H;
  return {
    origen: p.origen ?? 'web-horario',
    forma: p.forma ?? 'incrustado',
    anfitrion: p.anfitrion === undefined ? WEB : p.anfitrion,
    firma: p.firma === undefined ? 'c1ahora' : p.firma,
    primero: iso(AHORA - (p.primero ?? Math.max(ultimo, 3 * 24 * H))),
    ultimo: iso(AHORA - ultimo),
    n: 5,
  };
}

const ESTADO_BASE = {
  metodoCopiado: 'iframe' as MetodoIntegracion | null,
  etiquetas: ['web-horario'],
  claveAhora: 'incrustado:c1ahora' as string | null,
  conocidas: ['incrustado:c1copiada', 'incrustado:c1vieja'],
  visitasMes: 0 as number | null,
  hayAmbar: false,
  ahora: AHORA as number | null,
};
const estado = (vistos: readonly VistoWidget[] | null | undefined, extra: Partial<typeof ESTADO_BASE> = {}) =>
  estadoEnTuWeb({ ...ESTADO_BASE, ...extra, vistos });
const version = (e: EstadoEnTuWeb) => (e.tipo === 'visto' ? e.version : 'no-visto');

// ── Grupos ────────────────────────────────────────────────────────────────────

test('⚠️ guardián: cada ajuste de ConfigConstructor (salvo `metodo`) está en exactamente UN grupo', () => {
  const enGrupos = GRUPOS.flatMap(g => g.campos as string[]);
  const claves = Object.keys(CONFIG_POR_DEFECTO).filter(k => k !== 'metodo').sort();
  assert.deepEqual([...enGrupos].sort(), claves, 'un ajuste nuevo sin grupo se quedaría sin nombre en el aviso');
  assert.equal(new Set(enGrupos).size, enGrupos.length, 'un ajuste en dos grupos saldría dos veces');
  assert.equal(enGrupos.includes('metodo'), false);
});

test('gruposCambiados: sin cambios, nada; cada grupo con su nombre, en el orden de GRUPOS', () => {
  assert.deepEqual(gruposCambiados(CONFIG_POR_DEFECTO, BASE, 'iframe', 'iframe'), []);
  const ahora = conConfig({ tipos: ['tc-r'], mostrarPrecio: false, ancho: 'completo' });
  assert.deepEqual(gruposCambiados(CONFIG_POR_DEFECTO, ahora, 'iframe', 'iframe'), [
    { nombre: 'qué clases salen', seVe: true },
    { nombre: 'qué se ve de cada clase', seVe: true },
    { nombre: 'el ancho', seVe: false },
  ]);
});

test('gruposCambiados: `seVe` solo si la página lo nota (el ancho, la carga y el botón no)', () => {
  const un = (parcial: Partial<ConfigConstructor>, m: MetodoIntegracion = 'iframe') =>
    gruposCambiados(CONFIG_POR_DEFECTO, conConfig(parcial), m, m);
  assert.deepEqual(un({ cargaDiferida: false }), [{ nombre: 'cómo carga', seVe: false }]);
  assert.deepEqual(un({ etiqueta: 'insta' }), [{ nombre: 'su etiqueta', seVe: true }]);
  assert.deepEqual(un({ presentacion: 'semana' }).map(g => g.nombre), ['cómo se ordena']);
  assert.deepEqual(un({ identidad: 'propia', marca: '#112233' }), [{ nombre: 'su diseño propio', seVe: true }]);
  assert.deepEqual(un({ mostrarPie: false }), [{ nombre: 'el pie', seVe: true }]);
  // El texto del botón no va en un iframe: no es un cambio de lo pegado.
  assert.deepEqual(un({ textoBoton: 'Ven' }), []);
  // En el popup sí va en el código, pero la página no lo ve.
  assert.deepEqual(un({ textoBoton: 'Ven' }, 'popup'), [{ nombre: 'el botón', seVe: false }]);
});

test('gruposCambiados: otra forma va delante como «dónde va», y se ve solo si la página distingue las dos', () => {
  assert.deepEqual(gruposCambiados(CONFIG_POR_DEFECTO, BASE, 'iframe', 'popup')[0], { nombre: 'dónde va', seVe: true });
  assert.deepEqual(gruposCambiados(CONFIG_POR_DEFECTO, BASE, 'boton', 'enlace')[0], { nombre: 'dónde va', seVe: false });
  assert.deepEqual(
    gruposCambiados(CONFIG_POR_DEFECTO, conConfig({ tipos: ['tc-r'] }), 'iframe', 'popup').map(g => g.nombre),
    ['dónde va', 'qué clases salen'],
  );
});

test('⚠️ gruposCambiados: un cambio en la PLANTILLA de Tentare no cuenta como un cambio suyo', () => {
  // Otro alto del iframe (plantilla): `firmaCodigo` cambia, y aun así no hay nada que avisar.
  const otraPlantilla: EntradaIntegracion = { ...BASE, widget: { ...HORARIO, alto: HORARIO.alto + 100 } };
  assert.notEqual(firmaCodigo(otraPlantilla, 'iframe'), firmaCodigo(BASE, 'iframe'));
  assert.deepEqual(gruposCambiados(CONFIG_POR_DEFECTO, otraPlantilla, 'iframe', 'iframe'), []);
});

test('unirGrupos y el aviso ámbar', () => {
  assert.equal(unirGrupos([]), '');
  assert.equal(unirGrupos(['a']), 'a');
  assert.equal(unirGrupos(['a', 'b']), 'a y b');
  assert.equal(unirGrupos(['a', 'b', 'c']), 'a, b y c');
  assert.equal(textoCambios(['qué clases salen', 'el ancho']), 'Lo cambiaste después de copiarlo (qué clases salen y el ancho): tu web sigue con lo de antes.');
  assert.equal(textoCambios(null), 'Lo cambiaste después de copiarlo: tu web sigue con lo de antes.');
  assert.equal(textoCambios([]), 'Lo cambiaste después de copiarlo: tu web sigue con lo de antes.');
});

// ── estadoEnTuWeb ─────────────────────────────────────────────────────────────

test('estadoEnTuWeb 1: oculto cargando, con error, sin permiso, sin `ahora` o sin saber la forma copiada', () => {
  assert.deepEqual(estado(undefined), { tipo: 'oculto' }); // cargando, o su rol no lo pide
  assert.deepEqual(estado(null), { tipo: 'oculto' }); // la consulta falló: nunca «Aún no lo vemos»
  assert.deepEqual(estado([], { ahora: null }), { tipo: 'oculto' });
  assert.deepEqual(estado([], { metodoCopiado: null }), { tipo: 'oculto' });
  // Va antes que «no medible»: sin datos no se dice nada de un botón tampoco.
  assert.deepEqual(estado(null, { metodoCopiado: 'boton' }), { tipo: 'oculto' });
});

test('estadoEnTuWeb 2: un botón o un enlace no se miden (a propósito), aunque haya filas', () => {
  assert.deepEqual(estado([fila({})], { metodoCopiado: 'boton' }), { tipo: 'no-medible' });
  assert.deepEqual(estado([fila({})], { metodoCopiado: 'enlace' }), { tipo: 'no-medible' });
});

test('estadoEnTuWeb 3: sin filas de su etiqueta, «sin ver» con su forma, o «sin dato» si el mes tuvo visitas', () => {
  assert.deepEqual(estado([]), { tipo: 'sin-ver', forma: 'incrustado' });
  assert.deepEqual(estado([], { metodoCopiado: 'popup' }), { tipo: 'sin-ver', forma: 'ventana' });
  assert.deepEqual(estado([], { metodoCopiado: 'nativa' }), { tipo: 'sin-ver', forma: 'nativa' });
  assert.deepEqual(estado([], { visitasMes: null }), { tipo: 'sin-ver', forma: 'incrustado' });
  assert.deepEqual(estado([], { visitasMes: 3 }), { tipo: 'sin-dato' });
  // Lo de otra etiqueta no es de esta pieza.
  assert.deepEqual(estado([fila({ origen: 'web-planes' })]), { tipo: 'sin-ver', forma: 'incrustado' });
  // La etiqueta de ahora cuenta igual que la copiada.
  assert.equal(estado([fila({ origen: 'insta' })], { etiquetas: ['web-horario', 'insta'] }).tipo, 'visto');
});

test('estadoEnTuWeb 4: visto, con la fila más reciente y las otras webs sin contar la suya ni las sin dirección', () => {
  const e = estado([
    fila({ ultimo: 30 * H, anfitrion: OTRA_WEB }),
    fila({ ultimo: 2 * H }),
    fila({ ultimo: 5 * H, anfitrion: null }),
    fila({ ultimo: 10 * H }),
    fila({ ultimo: 40 * H, anfitrion: 'https://tercera.example.com', forma: 'ventana' }),
  ]);
  assert.equal(e.tipo, 'visto');
  if (e.tipo !== 'visto') return;
  assert.equal(e.anfitrion, WEB);
  assert.equal(e.ultimo, iso(AHORA - 2 * H));
  assert.equal(e.forma, 'incrustado');
  assert.equal(e.otrasWebs, 2);

  const sinDireccion = estado([fila({ ultimo: H, anfitrion: null, forma: 'ventana' }), fila({ ultimo: 3 * H })]);
  assert.equal(sinDireccion.tipo === 'visto' && sinDireccion.anfitrion, null);
  assert.equal(sinDireccion.tipo === 'visto' && sinDireccion.forma, 'ventana');
  assert.equal(sinDireccion.tipo === 'visto' && sinDireccion.otrasWebs, 1);
});

test('estadoEnTuWeb 5: al día, anterior (solo si la copió desde aquí), distinta y dos versiones', () => {
  assert.equal(version(estado([fila({})])), 'al-dia');

  const anterior = estado([fila({ firma: 'c1vieja', ultimo: 4 * H })]);
  assert.equal(version(anterior), 'anterior');
  assert.deepEqual(anterior.tipo === 'visto' && anterior.laOtra, { anfitrion: WEB, ultimo: iso(AHORA - 4 * H) });

  assert.equal(version(estado([fila({ firma: 'c1amano' })])), 'distinta');

  const dos = estado([
    fila({ ultimo: H, primero: 3 * 24 * H }),
    fila({ firma: 'c1amano', ultimo: 2 * H, anfitrion: OTRA_WEB }),
  ]);
  assert.equal(version(dos), 'dos-versiones');
  assert.deepEqual(dos.tipo === 'visto' && dos.laOtra, { anfitrion: OTRA_WEB, ultimo: iso(AHORA - 2 * H) });

  // La otra, la más reciente de las vivas.
  const tres = estado([fila({ firma: 'c1vieja', ultimo: 20 * H }), fila({ firma: 'c1amano', ultimo: 3 * H, anfitrion: null })]);
  assert.equal(version(tres), 'distinta');
  assert.deepEqual(tres.tipo === 'visto' && tres.laOtra, { anfitrion: null, ultimo: iso(AHORA - 3 * H) });

  // La misma firma con otra forma es OTRA versión: el iframe y el popup cargan la misma URL.
  assert.equal(version(estado([fila({ forma: 'ventana' })])), 'distinta');
});

test('⚠️ estadoEnTuWeb: el margen de 1 h tras ver la versión de ahora (la caché de su web no son dos versiones)', () => {
  const desde = 30 * H;
  const conOtraA = (tras: number) => estado([
    fila({ ultimo: H, primero: desde }),
    fila({ firma: 'c1vieja', ultimo: desde - tras }),
  ]);
  assert.equal(version(conOtraA(MARGEN_MISMA_VERSION_MS - 60_000)), 'al-dia');
  assert.equal(version(conOtraA(MARGEN_MISMA_VERSION_MS)), 'al-dia');
  assert.equal(version(conOtraA(MARGEN_MISMA_VERSION_MS + 60_000)), 'dos-versiones');
});

test('⚠️ estadoEnTuWeb: solo cuenta lo visto en los últimos 7 días para la versión', () => {
  const justo = estado([fila({ firma: 'c1vieja', ultimo: VENTANA_VERSION_MS })]);
  assert.equal(version(justo), 'anterior');
  const fuera = estado([fila({ firma: 'c1vieja', ultimo: VENTANA_VERSION_MS + 1 })]);
  // Se dice dónde y cuándo se vio, pero de su versión ya no se sabe nada.
  assert.equal(fuera.tipo, 'visto');
  assert.equal(version(fuera), null);
  // Lo viejo tampoco hace de «otra versión» junto a la de ahora.
  assert.equal(version(estado([fila({}), fila({ firma: 'c1vieja', ultimo: 8 * 24 * H })])), 'al-dia');
});

test('estadoEnTuWeb: sin veredicto de versión con ámbar, sin versión de ahora, sin firma o con otra versión de la firma', () => {
  assert.equal(version(estado([fila({ firma: 'c1vieja' })], { hayAmbar: true })), null);
  assert.equal(version(estado([fila({})], { claveAhora: null })), null);
  // La nativa no manda firma.
  assert.equal(version(estado([fila({ firma: null, forma: 'nativa' })], { metodoCopiado: 'nativa' })), null);
  // Una firma de otra forma de canonizar (`c2…`) no se compara con las de `c1`.
  assert.equal(version(estado([fila({ firma: 'c2vieja' })])), null);
});

// ── Textos ────────────────────────────────────────────────────────────────────

const texto = (e: EstadoEnTuWeb) => textosEnTuWeb(e, AHORA);
const visto = (p: Partial<Extract<EstadoEnTuWeb, { tipo: 'visto' }>> = {}): EstadoEnTuWeb => ({
  tipo: 'visto', forma: 'incrustado', anfitrion: WEB, ultimo: iso(AHORA - 2 * H), otrasWebs: 0, version: null, ...p,
});

test('textosEnTuWeb: las frases exactas de cada estado', () => {
  assert.deepEqual(texto({ tipo: 'oculto' }), { linea: null, version: null });
  assert.equal(texto({ tipo: 'no-medible' }).linea, 'De un botón o un enlace no vemos desde dónde llegan, solo cuántas visitas: las tienes en los resultados del mes.');
  assert.equal(texto({ tipo: 'sin-dato' }).linea, 'Este mes ha tenido visitas, pero aún no sabemos desde qué web. Lo sabremos la próxima vez que alguien lo abra.');
  assert.equal(texto({ tipo: 'sin-ver', forma: 'incrustado' }).linea, 'Aún no lo vemos en tu web. Cuando alguien abra la página donde lo pegaste, aparecerá aquí.');
  assert.equal(texto({ tipo: 'sin-ver', forma: 'nativa' }).linea, 'Aún no lo vemos en tu web. Cuando alguien abra la página donde lo pegaste, aparecerá aquí.');
  assert.equal(texto({ tipo: 'sin-ver', forma: 'ventana' }).linea, 'Aún no lo ha abierto nadie desde tu web. Cuando alguien pulse el botón, aparecerá aquí.');

  assert.deepEqual(texto(visto()), { linea: 'Visto en albapilates.example.com hace 2 h', version: null });
  assert.equal(texto(visto({ otrasWebs: 1 })).linea, 'Visto en albapilates.example.com hace 2 h y en otra web más');
  assert.equal(texto(visto({ otrasWebs: 3 })).linea, 'Visto en albapilates.example.com hace 2 h y en 3 webs más');
  assert.equal(texto(visto({ forma: 'nativa', ultimo: iso(AHORA - 25 * H) })).linea, 'Visto en albapilates.example.com ayer');
  assert.equal(texto(visto({ forma: 'ventana' })).linea, 'Abierto en albapilates.example.com hace 2 h');
  assert.equal(texto(visto({ anfitrion: null })).linea, 'Visto hace 2 h en una web que no nos dice su dirección');
  assert.equal(texto(visto({ anfitrion: null, forma: 'ventana' })).linea, 'Abierto hace 2 h en una web que no nos dice su dirección');
  assert.equal(texto(visto({ anfitrion: 'http://localhost:3000' })).linea, 'Visto en localhost:3000 hace 2 h');
});

test('textosEnTuWeb: la versión dice cuándo y dónde se vio; al día no añade nada', () => {
  const laOtra = { anfitrion: WEB, ultimo: iso(AHORA - 3 * H) };
  assert.equal(texto(visto({ version: 'al-dia' })).version, null);
  assert.equal(
    texto(visto({ version: 'anterior', laOtra })).version,
    'La última vez que lo vimos (hace 3 h, en albapilates.example.com), tu web tenía una versión anterior. Pega el código de ahora en lugar del que hay; cuando alguien lo abra, cambiará aquí.',
  );
  assert.equal(
    texto(visto({ version: 'distinta', laOtra: { anfitrion: null, ultimo: laOtra.ultimo } })).version,
    'La última vez que lo vimos (hace 3 h), tu web tenía una versión distinta de la de aquí. Si nadie la cambió a mano, pega el código de ahora en lugar del que hay.',
  );
  assert.equal(
    texto(visto({ version: 'dos-versiones', laOtra })).version,
    'Esta semana tu web ha enseñado dos versiones: la de ahora y otra distinta (la última vez hace 3 h, en albapilates.example.com). Si lo pegaste en varias páginas, cambia el código también en las demás.',
  );
});

test('⚠️ nunca se dice: «instalado», «funciona», «0 %», el esquema o la ruta de su web', () => {
  const estados: EstadoEnTuWeb[] = [
    { tipo: 'no-medible' }, { tipo: 'sin-dato' }, { tipo: 'sin-ver', forma: 'incrustado' }, { tipo: 'sin-ver', forma: 'ventana' },
    visto(), visto({ anfitrion: null }), visto({ otrasWebs: 2 }),
    ...(['anterior', 'distinta', 'dos-versiones'] as const).map(v => visto({ version: v, laOtra: { anfitrion: `${WEB}`, ultimo: iso(AHORA - H) } })),
  ];
  for (const e of estados) {
    const { linea, version: v } = texto(e);
    for (const frase of [linea, v].filter((x): x is string => !!x)) {
      assert.doesNotMatch(frase, /instalad|funciona|0 %|https?:|\//i, frase);
    }
  }
  assert.equal(hostDe('https://www.albapilates.example.com'), 'www.albapilates.example.com');
});

// ── Una pieza entera ──────────────────────────────────────────────────────────

const EN = '2026-09-20T10:00:00.000Z';
function copiaDe(c: ConfigConstructor, m: MetodoIntegracion, anterior?: Copiado): Copiado {
  const e = { ...BASE, config: c };
  return nuevaCopia(anterior, { firma: firmaCodigo(e, m), en: EN, metodo: m, config: c, contenido: firmaContenidoDe(e, m) });
}
const firmaDe = (c: ConfigConstructor, m: MetodoIntegracion = 'iframe') => firmaContenidoDe({ ...BASE, config: c }, m)!;
const pieza = (copia: Copiado, ahora: EntradaIntegracion, extra: Partial<Parameters<typeof piezaCopiada>[0]> = {}) =>
  piezaCopiada({ copia, base: ahora, metodoAhora: 'iframe', puedeGenerar: true, vistos: [], mes: null, ahora: AHORA, ...extra });

test('piezaCopiada: con foto y sin cambios, nada que avisar; con cambios, qué grupos', () => {
  const copia = copiaDe(CONFIG_POR_DEFECTO, 'iframe');
  const igual = pieza(copia, BASE);
  assert.equal(igual.desfasado, false);
  assert.deepEqual(igual.cambios, []);
  assert.equal(igual.metodo, 'iframe');
  assert.deepEqual(igual.estado, { tipo: 'sin-ver', forma: 'incrustado' });

  const cambiado = pieza(copia, conConfig({ tipos: ['tc-r'] }));
  assert.equal(cambiado.desfasado, true);
  assert.deepEqual(cambiado.cambios, ['qué clases salen']);
  // Sin código que dar, no hay «código nuevo» que copiar.
  assert.equal(pieza(copia, conConfig({ tipos: ['tc-r'] }), { puedeGenerar: false }).desfasado, false);
});

test('⚠️ piezaCopiada: manda lo que se ve (su web ya enseña la versión de ahora, pegada a mano)', () => {
  const copia = copiaDe(CONFIG_POR_DEFECTO, 'iframe');
  const ahora = { tipos: ['tc-r'] } satisfies Partial<ConfigConstructor>;
  const vistaAhora = fila({ firma: firmaDe({ ...CONFIG_POR_DEFECTO, ...ahora }) });

  const pegadaAMano = pieza(copia, conConfig(ahora), { vistos: [vistaAhora] });
  assert.equal(pegadaAMano.desfasado, false);
  assert.deepEqual(pegadaAMano.cambios, []);
  assert.equal(version(pegadaAMano.estado), 'al-dia');

  // Lo que la página no ve (el ancho) no lo demuestra: se queda en el ámbar, y
  // con ámbar no se da veredicto de versión.
  const conAncho = pieza(copia, conConfig({ ...ahora, ancho: 'completo' }), { vistos: [vistaAhora] });
  assert.equal(conAncho.desfasado, true);
  assert.deepEqual(conAncho.cambios, ['el ancho']);
  assert.equal(conAncho.estado.tipo, 'visto');
  assert.equal(version(conAncho.estado), null);

  // Si su web sigue con lo copiado, el ámbar se queda entero.
  const sinPegar = pieza(copia, conConfig(ahora), { vistos: [fila({ firma: firmaDe(CONFIG_POR_DEFECTO) })] });
  assert.deepEqual(sinPegar.cambios, ['qué clases salen']);
  assert.equal(version(sinPegar.estado), null);
});

test('piezaCopiada: «anterior» con el historial de copias; «distinta» si nunca se copió desde aquí', () => {
  const vieja = { ...CONFIG_POR_DEFECTO, mostrarPrecio: false };
  const copia = copiaDe(CONFIG_POR_DEFECTO, 'iframe', copiaDe(vieja, 'iframe'));
  assert.equal(version(pieza(copia, BASE, { vistos: [fila({ firma: firmaDe(vieja) })] }).estado), 'anterior');
  assert.equal(version(pieza(copia, BASE, { vistos: [fila({ firma: 'c1amano' })] }).estado), 'distinta');
  assert.equal(version(pieza(copia, BASE, { vistos: [fila({ firma: firmaDe(CONFIG_POR_DEFECTO) })] }).estado), 'al-dia');
});

test('piezaCopiada: una copia de antes (sin foto) que coincide es lo de ahora; si no coincide, solo se sabe QUE cambió', () => {
  const deAntes: Copiado = { firma: firmaCodigo(BASE, 'iframe'), en: EN };
  const coincide = pieza(deAntes, BASE, { vistos: [fila({ firma: firmaDe(CONFIG_POR_DEFECTO) })] });
  assert.equal(coincide.metodo, 'iframe');
  assert.equal(coincide.desfasado, false);
  assert.equal(coincide.cambios, null);
  assert.equal(version(coincide.estado), 'al-dia');

  const vieja = pieza({ firma: 'huellavieja', en: EN }, BASE, { vistos: [fila({})] });
  assert.equal(vieja.desfasado, true);
  assert.equal(vieja.cambios, null);
  assert.equal(vieja.metodo, null);
  // Sin saber qué forma se pegó, no se dice nada de su web.
  assert.deepEqual(vieja.estado, { tipo: 'oculto' });
});

test('piezaCopiada: el mes y lo visto se miden con la etiqueta COPIADA (y la de ahora)', () => {
  const copia = copiaDe({ ...CONFIG_POR_DEFECTO, etiqueta: 'insta' }, 'iframe');
  const mes = embudoPorWidget([
    { origen: 'insta', tipo: 'widget_loaded', n: 7 },
    { origen: 'web-horario', tipo: 'widget_loaded', n: 40 },
  ]);
  const p = pieza(copia, BASE, { mes });
  assert.equal(p.etiqueta, 'insta');
  assert.equal(p.mes?.visitas, 7);
  // Sin filas de lo visto y con visitas este mes: aún no sabemos desde qué web.
  assert.deepEqual(p.estado, { tipo: 'sin-dato' });
  assert.equal(pieza(copia, BASE, { mes, vistos: [fila({ origen: 'web-horario', firma: null })] }).estado.tipo, 'visto');
  // Sin etiqueta no hay mes que atribuirle.
  const sinEtiqueta = pieza(copiaDe({ ...CONFIG_POR_DEFECTO, etiqueta: '' }, 'iframe'), conConfig({ etiqueta: '' }), { mes });
  assert.equal(sinEtiqueta.etiqueta, null);
  assert.equal(sinEtiqueta.mes, null);
  assert.deepEqual(sinEtiqueta.estado, { tipo: 'sin-ver', forma: 'incrustado' });
});

test('piezaCopiada: un diseño propio en lo pegado (dentro de una página o encima) no recibe el estilo común', () => {
  const propia = { ...CONFIG_POR_DEFECTO, identidad: 'propia' as const, marca: '#112233' };
  assert.equal(pieza(copiaDe(propia, 'iframe'), BASE).disenoPropio, true);
  assert.equal(pieza(copiaDe(propia, 'popup'), BASE, { metodoAhora: 'popup' }).disenoPropio, true);
  assert.equal(pieza(copiaDe(propia, 'enlace'), BASE, { metodoAhora: 'enlace' }).disenoPropio, false);
  assert.equal(pieza(copiaDe(CONFIG_POR_DEFECTO, 'iframe'), BASE).disenoPropio, false);
  // «Propia» sin tocar nada no emite nada: sigue el estilo común.
  assert.equal(pieza(copiaDe({ ...CONFIG_POR_DEFECTO, identidad: 'propia' }, 'iframe'), BASE).disenoPropio, false);
});

test('piezaCopiada: la clave de ahora sale de la forma de AHORA (lo copiado dentro de la página, ahora encima)', () => {
  const copia = copiaDe(CONFIG_POR_DEFECTO, 'iframe');
  const p = pieza(copia, BASE, { metodoAhora: 'popup', vistos: [fila({ firma: firmaDe(CONFIG_POR_DEFECTO) })] });
  assert.deepEqual(p.cambios, ['dónde va']);
  // Su web enseña lo copiado (dentro de la página), no lo de ahora (encima).
  assert.equal(version(p.estado), null);
  assert.equal(claveVista('ventana', firmaDe(CONFIG_POR_DEFECTO, 'popup')), `ventana:${firmaDe(CONFIG_POR_DEFECTO)}`);
});

// ── Su web, sin autorizar ────────────────────────────────────────────────────

test('webSinAutorizar: solo la dirección que ella dio, con y sin «www»', () => {
  assert.equal(webSinAutorizar('albapilates.example.com', []), 'albapilates.example.com');
  assert.equal(webSinAutorizar('albapilates.example.com', ['https://albapilates.example.com']), null);
  assert.equal(webSinAutorizar('www.albapilates.example.com', ['https://albapilates.example.com']), null);
  assert.equal(webSinAutorizar('www.albapilates.example.com', ['https://otra.example.com']), 'www.albapilates.example.com');
  assert.equal(webSinAutorizar(null, []), null);
  assert.equal(webSinAutorizar('no es una web', []), null);
});
