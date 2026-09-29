import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RECUADRO_NATIVA, datosEstiloNativaDeBase, datosEstiloNativaDeTema, estiloDeLaNativa, leerDatosEstiloNativa, marcaDeLaNativa,
  type AppDeLaNativa, type DatosEstiloNativa, type EstiloNativa,
} from './estilo-nativa.ts';
import { baseEstiloWeb, botonWeb, resolverEstiloWeb } from '../reservar/estilo-web.ts';
import {
  WIDGET_WEB_NEUTRO, esNeutro, leerWidgetWeb, type BotonWeb, type WebId, type WidgetWeb,
} from '../reservar/estilo-web-tipos.ts';
import { temaAppParaReservar, varsPareja } from '../reservar/tema-app.ts';
import { ESTILO_IDS, TIPOGRAFIA_IDS, type EstiloId, type TipografiaId } from '../student/apariencia.ts';

const ww = (p: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...p });
/** El índigo que escribe el alta en `studios.color_primario` y no ha elegido nadie. */
const COLUMNA = '#4F46E5';
const TEMA = '#7A2E4F';
const APP: AppDeLaNativa = { estilo: 'crema', tipografia: 'moderna', marca: 'suave' };
const conEstilo = (w: WidgetWeb, color: string | null = TEMA, app: AppDeLaNativa = APP): DatosEstiloNativa =>
  ({ color, web: { widgetWeb: w, app } });
const COLUMNAS = { columnas: true };
const DIAS = { columnas: false };
/** Las cuatro variables de una pareja y la familia que hereda el texto: con «Como tu app», ninguna. */
const DE_LETRA = ['--font-ui', '--portal-heading-font', '--font-display', '--reservar-heading-weight', 'fontFamily'];

// ── Lo que viaja: del tema, del panel y por la red ──────────────────────────

test('datosEstiloNativaDeTema: el color del TEMA gana a la columna; sin uno válido, la columna', () => {
  assert.equal(datosEstiloNativaDeTema({ primary: TEMA }, COLUMNA).color, TEMA);
  for (const primary of [undefined, null, '', 'red', '#12345', '#123456;}', 7]) {
    assert.equal(datosEstiloNativaDeTema({ primary }, COLUMNA).color, COLUMNA, String(primary));
  }
  // `#rgb` no vale, igual que para /reservar y la app (`colorMarcaDelEstudio`): el mismo color en los tres sitios.
  assert.equal(datosEstiloNativaDeTema({ primary: '#abc' }, COLUMNA).color, COLUMNA);
  assert.equal(datosEstiloNativaDeTema({ primary: undefined }, 'basura').color, null);
});

test('datosEstiloNativaDeTema: sin estilo, neutro o corrupto, `web: null` (la nativa se ve como siempre)', () => {
  for (const widgetWeb of [undefined, null, 'arena', 42, [], {}, { ...WIDGET_WEB_NEUTRO }, { estilo: 'x', boton: 'nada' }, { web: 'oscura' }, { web: 'otro', colorWeb: '#1D1E1B' }]) {
    assert.equal(datosEstiloNativaDeTema({ primary: TEMA, widgetWeb }, COLUMNA).web, null, JSON.stringify(widgetWeb));
  }
});

test('⚠️ datosEstiloNativaDeTema: de la app viajan SOLO tres claves (ni el botón principal ni el encuadre)', () => {
  const d = datosEstiloNativaDeTema({
    primary: TEMA, widgetWeb: { estilo: 'arena' },
    appAlumna: { estilo: 'bosque', tipografia: 'editorial', marca: 'fiel', boton: 'marca', encuadre: 'arriba', otra: 'cosa' },
  }, COLUMNA);
  assert.deepEqual(d.web?.app, { estilo: 'bosque', tipografia: 'editorial', marca: 'fiel' });
  assert.deepEqual(Object.keys(d.web!.app).sort(), ['estilo', 'marca', 'tipografia']);
  // El estilo, entero y validado (las nueve claves), aunque se guardara con menos.
  assert.deepEqual(d.web?.widgetWeb, ww({ estilo: 'arena' }));
});

const TEMAS: { primary: unknown; widgetWeb: unknown; appAlumna: unknown }[] = [
  { primary: TEMA, widgetWeb: { estilo: 'arena', forma: 'recto' }, appAlumna: { estilo: 'crema', tipografia: 'editorial', marca: 'fiel', boton: 'marca', encuadre: 'arriba' } },
  { primary: '#343825', widgetWeb: { estilo: 'carbon', letra: 'serena', boton: 'tinta' }, appAlumna: null },
  { primary: '#F2C94C', widgetWeb: { web: 'otro', colorWeb: '#1D1E1B', fundido: true, densidad: 'compacta', ocultarPie: true }, appAlumna: { estilo: 'carbon' } },
  { primary: TEMA, widgetWeb: { letra: 'geometrica', boton: 'fiel' }, appAlumna: { estilo: 'rubor', marca: 'fiel' } },
  { primary: TEMA, widgetWeb: null, appAlumna: { estilo: 'bosque' } },
  { primary: TEMA, widgetWeb: { web: 'oscura' }, appAlumna: {} },
  { primary: TEMA, widgetWeb: { estilo: 'x', letra: 'editorial' }, appAlumna: { estilo: 'nope', tipografia: 7 } },
];

test('ida y vuelta: lo que manda el servidor, pasado por JSON y leído en el bundle, es lo mismo', () => {
  for (const t of TEMAS) {
    const enviado = datosEstiloNativaDeTema(t, COLUMNA);
    assert.deepEqual(leerDatosEstiloNativa(JSON.parse(JSON.stringify(enviado))), enviado, JSON.stringify(t));
  }
  assert.ok(TEMAS.some(t => datosEstiloNativaDeTema(t, COLUMNA).web !== null), 'la matriz no prueba ningún estilo');
});

test('⚠️ panel = servidor: con el mismo tema, la vista previa y la web del estudio reciben lo mismo', () => {
  // Es lo que deja a la previa del panel enseñar lo que pintará su web.
  for (const t of TEMAS) {
    const panel = datosEstiloNativaDeBase(leerWidgetWeb(t.widgetWeb), baseEstiloWeb(t.primary, t.appAlumna));
    assert.deepEqual(panel, datosEstiloNativaDeTema(t, COLUMNA), JSON.stringify(t));
  }
  // Un borrador neutro (quitarlo todo) también: la previa vuelve a lo de siempre.
  assert.equal(datosEstiloNativaDeBase(ww(), baseEstiloWeb(TEMA, null)).web, null);
  assert.equal(datosEstiloNativaDeBase(null, baseEstiloWeb(TEMA, null)).web, null);
});

test('leerDatosEstiloNativa: lo que no es un objeto no es nada (un servidor de antes no lo manda)', () => {
  for (const crudo of [undefined, null, 'estilo', 7, true, [], [{ color: TEMA }]]) {
    assert.equal(leerDatosEstiloNativa(crudo), null, JSON.stringify(crudo));
  }
  assert.deepEqual(leerDatosEstiloNativa({}), { color: null, web: null });
});

test('⚠️ leerDatosEstiloNativa: todo se relee clave a clave; nada llega crudo a un `style`', () => {
  // El color: solo `#rrggbb`.
  for (const color of ['red;}', `${TEMA};} body{display:none`, '#abc', ' #7A2E4F', 'url(x)', 7]) {
    assert.equal(leerDatosEstiloNativa({ color })!.color, null, String(color));
  }
  // El estilo, clave a clave: lo que no encaja cae y no arrastra a las demás.
  const d = leerDatosEstiloNativa({ color: TEMA, web: { widgetWeb: { estilo: 'x', letra: 'editorial', colorWeb: 'red;}' }, app: APP } });
  assert.deepEqual(d?.web?.widgetWeb, ww({ letra: 'editorial' }));
  // Un estilo que se queda en nada es «nada elegido».
  assert.equal(leerDatosEstiloNativa({ color: TEMA, web: { widgetWeb: { estilo: 'x' }, app: 7 } })!.web, null);
  // Una apariencia de la app con basura: la de por defecto.
  for (const app of [7, 'carbon', null, { estilo: 'x', tipografia: [], marca: {} }]) {
    assert.deepEqual(leerDatosEstiloNativa({ web: { widgetWeb: { estilo: 'arena' }, app } })!.web!.app, APP, JSON.stringify(app));
  }
  // `web` que no es un objeto.
  for (const web of ['arena', 7, [], [{ widgetWeb: { estilo: 'arena' } }]]) {
    assert.equal(leerDatosEstiloNativa({ color: TEMA, web })!.web, null, JSON.stringify(web));
  }
});

// ── Sin nada elegido: como hasta ahora ──────────────────────────────────────

test('⚠️ sin nada elegido, `null`: la nativa se ve EXACTAMENTE como hasta ahora', () => {
  assert.equal(estiloDeLaNativa(null, COLUMNAS), null);
  assert.equal(estiloDeLaNativa({ color: TEMA, web: null }, DIAS), null);
  // Contestar cómo es su web no cambia nada sin fundirse (solo dibuja la previa).
  const neutros: WidgetWeb[] = [ww(), ww({ web: 'oscura' }), ww({ web: 'crema' }), ww({ web: 'otro', colorWeb: '#1D1E1B' })];
  for (const w of neutros) {
    for (const x of [COLUMNAS, DIAS]) {
      // Por las tres puertas, y también si un neutro se colara a mano.
      assert.equal(estiloDeLaNativa(datosEstiloNativaDeTema({ primary: TEMA, widgetWeb: w }, COLUMNA), x), null);
      assert.equal(estiloDeLaNativa(datosEstiloNativaDeBase(w, baseEstiloWeb(TEMA, null)), x), null);
      assert.equal(estiloDeLaNativa(leerDatosEstiloNativa({ color: TEMA, web: { widgetWeb: w, app: APP } }), x), null);
      assert.equal(estiloDeLaNativa(conEstilo(w), x), null);
    }
  }
});

// ── Con algo elegido: lo del iframe ──────────────────────────────────────────

/** Toda la matriz del diseño, con su resultado y lo que el iframe pinta con lo mismo. */
function* matriz(): Generator<{ caso: string; w: WidgetWeb; app: AppDeLaNativa; color: string; columnas: boolean; e: EstiloNativa | null }> {
  const apps: AppDeLaNativa[] = ESTILO_IDS.flatMap(estilo => (['suave', 'fiel'] as const).map(marca => ({ estilo, tipografia: 'moderna' as const, marca })));
  for (const app of apps) {
    for (const color of [TEMA, '#F2C94C']) {
      for (const estilo of [null, 'arena', 'carbon'] as (EstiloId | null)[]) {
        for (const letra of [null, 'editorial'] as (TipografiaId | null)[]) {
          for (const boton of [null, 'tinta', 'fiel'] as (BotonWeb | null)[]) {
            for (const fundido of [false, true]) {
              for (const web of [null, 'oscura'] as (WebId | null)[]) {
                for (const columnas of [false, true]) {
                  const w = ww({ estilo, letra, boton, fundido, web });
                  const e = estiloDeLaNativa(datosEstiloNativaDeBase(w, baseEstiloWeb(color, app)), { columnas });
                  yield { caso: JSON.stringify({ app, color, w, columnas }), w, app, color, columnas, e };
                }
              }
            }
          }
        }
      }
    }
  }
}

test('⚠️ igual que el iframe: los mismos tokens y el mismo botón que /reservar con el mismo estilo', () => {
  let conPaleta = 0;
  let soloLetra = 0;
  for (const { caso, w, app, color, columnas, e } of matriz()) {
    if (esNeutro(w)) {
      assert.equal(e, null, caso);
      continue;
    }
    assert.ok(e, caso);
    const base = baseEstiloWeb(color, app);
    const iframe = resolverEstiloWeb(w, base, 'dentro');
    // Solo la letra ⇔ en columnas y de noche (lo que el iframe tampoco pinta).
    assert.equal(e.soloLetra, columnas && iframe!.noche, caso);
    if (e.soloLetra) {
      soloLetra++;
      continue;
    }
    conPaleta++;
    assert.deepEqual(e.tokens, iframe?.tokens ?? temaAppParaReservar(app).tokens, caso);
    const boton = iframe?.boton ?? botonWeb(null, app.estilo, base);
    assert.equal(e.raiz['--portal-brand'], boton.fondo, caso);
    assert.equal(e.raiz['--portal-brand-foreground'], boton.texto, caso);
  }
  assert.ok(conPaleta > 1000 && soloLetra > 100, `la matriz se ha quedado corta: ${conPaleta}/${soloLetra}`);
});

test('solo la letra: los casos que se ven (Carbón y Crema fundida sobre una web oscura, en columnas)', () => {
  const nativa = (w: WidgetWeb, x: { columnas: boolean }) => estiloDeLaNativa(conEstilo(w), x)!;
  assert.equal(nativa(ww({ estilo: 'carbon' }), COLUMNAS).soloLetra, true);
  assert.equal(nativa(ww({ estilo: 'carbon' }), DIAS).soloLetra, false);
  assert.equal(nativa(ww({ estilo: 'crema', fundido: true, web: 'oscura' }), COLUMNAS).soloLetra, true);
  assert.equal(nativa(ww({ estilo: 'arena' }), COLUMNAS).soloLetra, false);
  // Con la app en Carbón, cualquier cambio sin estilo propio es de noche.
  assert.equal(estiloDeLaNativa(conEstilo(ww({ densidad: 'compacta' }), TEMA, { ...APP, estilo: 'carbon' }), COLUMNAS)!.soloLetra, true);
  // Y entonces nada más: ni tokens, ni recuadro, ni esquinas, ni separación.
  const e = nativa(ww({ estilo: 'carbon', forma: 'recto', densidad: 'compacta' }), COLUMNAS);
  assert.deepEqual({ ...e, raiz: undefined }, { tokens: null, raiz: undefined, letra: null, radiosEsc: null, densidadEsc: null, soloLetra: true });
  assert.deepEqual(e.raiz, { colorScheme: 'light' });
});

test('el recuadro: en su recuadro, el fondo del estilo con 12 px de radio y 16 de aire; fundido, sin fondo', () => {
  for (const x of [COLUMNAS, DIAS]) {
    const recuadro = estiloDeLaNativa(conEstilo(ww({ estilo: 'arena' })), x)!;
    assert.equal(recuadro.raiz.background, recuadro.tokens!.bg);
    assert.equal(recuadro.raiz.borderRadius, '12px');
    assert.equal(recuadro.raiz.padding, '16px');
    assert.deepEqual(RECUADRO_NATIVA, { borderRadius: '12px', padding: '16px' });
    // Fundido, la web se ve de verdad por detrás: la nativa vive en su DOM.
    const fundido = estiloDeLaNativa(conEstilo(ww({ estilo: 'arena', fundido: true, web: 'crema' })), x)!;
    for (const k of ['background', 'borderRadius', 'padding']) assert.equal(k in fundido.raiz, false, k);
    // Y lo que lee encima es lo que ella declaró de su web: su color hace de fondo de los tokens.
    assert.equal(fundido.tokens!.bg, '#F5EFE4');
  }
});

test('⚠️ la letra (enmienda): con «Como tu app» se queda la de su web; solo una elegida la cambia', () => {
  let casos = 0;
  for (const { caso, w, e } of matriz()) {
    if (!e) continue;
    casos++;
    assert.equal(e.letra, w.letra, caso);
    if (w.letra === null) {
      for (const k of DE_LETRA) assert.equal(k in e.raiz, false, `${caso}: ${k}`);
    } else {
      // Siempre las cuatro (también en columnas de noche), y la familia que hereda el texto.
      assert.deepEqual(
        Object.fromEntries(DE_LETRA.map(k => [k, e.raiz[k]])),
        { ...varsPareja(w.letra), fontFamily: 'var(--font-ui)' },
        caso,
      );
    }
  }
  assert.ok(casos > 0);
  // Ni aunque la app tenga otra pareja: «Como tu app» en la nativa es la de su web.
  const e = estiloDeLaNativa(conEstilo(ww({ estilo: 'arena' }), TEMA, { ...APP, tipografia: 'editorial' }), DIAS)!;
  for (const k of DE_LETRA) assert.equal(k in e.raiz, false, k);
  // Las nueve parejas, cuando se eligen.
  for (const letra of TIPOGRAFIA_IDS) {
    const conLetra = estiloDeLaNativa(conEstilo(ww({ letra })), DIAS)!;
    assert.equal(conLetra.raiz['--font-ui'], varsPareja(letra)['--font-ui'], letra);
    assert.equal(conLetra.letra, letra);
  }
});

test('colorScheme: oscuro de noche, claro de día y claro con solo la letra (sus celdas son de día)', () => {
  assert.equal(estiloDeLaNativa(conEstilo(ww({ estilo: 'carbon' })), DIAS)!.raiz.colorScheme, 'dark');
  assert.equal(estiloDeLaNativa(conEstilo(ww({ estilo: 'arena' })), DIAS)!.raiz.colorScheme, 'light');
  assert.equal(estiloDeLaNativa(conEstilo(ww({ estilo: 'carbon', letra: 'editorial' })), COLUMNAS)!.raiz.colorScheme, 'light');
  for (const { caso, w, app, color, e } of matriz()) {
    if (!e) continue;
    const noche = resolverEstiloWeb(w, baseEstiloWeb(color, app), 'dentro')!.noche;
    assert.equal(e.raiz.colorScheme, noche && !e.soloLetra ? 'dark' : 'light', caso);
  }
});

test('esquinas y separación: por las props que ya tiene el calendario; con solo la letra, ninguna', () => {
  const recto = estiloDeLaNativa(conEstilo(ww({ forma: 'recto', densidad: 'compacta' })), DIAS)!;
  assert.deepEqual(recto.radiosEsc, { tarjeta: 10, boton: 6, input: 10 });
  assert.equal(recto.densidadEsc, 0.75);
  // Sin elegir, las de siempre (las del calendario por defecto).
  const nada = estiloDeLaNativa(conEstilo(ww({ estilo: 'arena' })), DIAS)!;
  assert.equal(nada.radiosEsc, null);
  assert.equal(nada.densidadEsc, null);
  const noche = estiloDeLaNativa(conEstilo(ww({ estilo: 'carbon', forma: 'recto', densidad: 'compacta' })), COLUMNAS)!;
  assert.equal(noche.radiosEsc, null);
  assert.equal(noche.densidadEsc, null);
});

// ── Seguridad: esto se escribe en la web de un tercero ──────────────────────

const PROHIBIDO = ['</', '{', '}', ';', 'url('];

function sinInyeccion(e: EstiloNativa, caso: string) {
  for (const [k, v] of Object.entries(e.raiz)) {
    assert.match(k, /^(--[a-z0-9-]+|[a-zA-Z]+)$/, `${caso}: clave ${k}`);
    for (const p of PROHIBIDO) assert.equal(v.includes(p), false, `${caso}: ${k}=${v}`);
  }
  for (const [k, v] of Object.entries(e.tokens ?? {})) {
    for (const p of PROHIBIDO) assert.equal(String(v).includes(p), false, `${caso}: tokens.${k}=${v}`);
  }
}

test('⚠️ seguridad: nada del `style` ni de los tokens puede salirse de su declaración', () => {
  let n = 0;
  for (const { caso, e } of matriz()) {
    if (!e) continue;
    sinInyeccion(e, caso);
    n++;
  }
  assert.ok(n > 1000);
  // Lo peor que puede llegar por la red: se lee, se descarta lo que no encaja y lo que queda se pinta limpio.
  const malicioso = leerDatosEstiloNativa({
    color: '#123456;} body{display:none} </style><script>',
    web: {
      widgetWeb: { estilo: 'carbon', letra: "moderna'; }", web: 'otro', colorWeb: 'url(javascript:x)', fundido: true, forma: 'recto{' },
      app: { estilo: 'crema</style>', tipografia: 'editorial' },
    },
  });
  assert.equal(malicioso?.color, null);
  for (const x of [COLUMNAS, DIAS]) {
    const e = estiloDeLaNativa(malicioso, x);
    assert.ok(e);
    sinInyeccion(e, JSON.stringify(x));
  }
});

// ── La marca de siempre ──────────────────────────────────────────────────────

test('marcaDeLaNativa: la regla de `pintarMarca`, texto claro sobre un color oscuro y oscuro sobre uno claro', () => {
  assert.deepEqual(marcaDeLaNativa('#1A1A1A'), { '--portal-brand': '#1A1A1A', '--portal-brand-foreground': '#FFFFFF' });
  assert.deepEqual(marcaDeLaNativa(TEMA), { '--portal-brand': TEMA, '--portal-brand-foreground': '#FFFFFF' });
  assert.deepEqual(marcaDeLaNativa('#F5EFE4'), { '--portal-brand': '#F5EFE4', '--portal-brand-foreground': '#22261F' });
  assert.equal(marcaDeLaNativa('#FFFFFF')['--portal-brand-foreground'], '#22261F');
  // El de por defecto de la nativa, y `#rgb` (el `data-marca` corto también vale).
  assert.equal(marcaDeLaNativa('#343825')['--portal-brand-foreground'], '#FFFFFF');
  assert.equal(marcaDeLaNativa('#fff')['--portal-brand-foreground'], '#22261F');
  // Lo que no es hex (el `data-color` de antes, sin validar): texto oscuro, como siempre.
  assert.equal(marcaDeLaNativa('red')['--portal-brand-foreground'], '#22261F');
});
