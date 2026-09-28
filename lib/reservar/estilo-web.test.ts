import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLOR_PRIMARIO_POR_DEFECTO, MENSAJE_BOTON_ILEGIBLE, MENSAJE_FUNDIDO_ILEGIBLE, PARAMS_DISENO_PROPIO,
  baseEstiloWeb, botonDeLaVentana, botonPorDefecto, botonWeb, leerBorradorWeb, paletaWidget, resolverEstiloWeb, resumenEstiloWeb,
  textoActividadEstiloWeb, urlTraeDisenoPropio, validarEstiloWeb, type Contexto,
} from './estilo-web.ts';
import { COLOR_WEB, PARAM_BORRADOR, WIDGET_WEB_NEUTRO, borradorAParam, type WidgetWeb } from './estilo-web-tipos.ts';
import {
  MARCA_DEL_ESTUDIO_EN_LINEA, MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE, cssDocumentoIncrustado, paletaEfectivaReservar,
  widgetDecide, type OpcionesWidget, type PaletaEfectiva, type TemaAppReservar,
} from './precedencia-tema.ts';
import { temaAppParaReservar, temaReservarCssText, tokensDeEstilo, type MarcaEstudio } from './tema-app.ts';
import { fondoCss, modoTextoDe, resolverApariencia as resolverAparienciaWidget, type AparienciaWidget } from './apariencia-widget.ts';
import { ESTILOS, ESTILO_IDS, TIPOGRAFIA_IDS, resolverApariencia, type EstiloId } from '../student/apariencia.ts';
import { RESERVAR_PALETA, tokensCalendarioDeApariencia, varsReservarModo } from '../reservar-publico-tokens.ts';
import { themeToCssVars } from '../theme-runtime.ts';
import { DEFAULT_THEME } from '../theme-schema.ts';
import { ratioContraste } from '../wcag-contrast.ts';
import { WIDGETS, esDisponible } from '../widgets/catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor } from '../widgets/config.ts';
import { tieneDisenoEnCodigo, urlEmbebido } from '../widgets/integracion.ts';
import { leerBotonVivo } from '../widgets/boton-vivo.ts';

const r = (a: string, b: string) => ratioContraste(a, b) ?? 0;
const w = (parcial: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });
const base = (color: string | null = '#E11D48', app: object | null = null) => baseEstiloWeb(color, app);
const params = (q: string) => new URLSearchParams(q);
/** Los 9 colores de marca de lib/student/apariencia.test.ts: los extremos y los que ya dieron guerra. */
const COLORES = ['#FFFFFF', '#FFFF00', '#F7A6C4', '#00FF00', '#666dcc', '#000000', '#E11D48', '#0EA5E9', '#C9A227'];
const MARCA: MarcaEstudio = { brand: '#2C352C', foreground: '#FFFFFF', texto: '#2C352C' };

/** Las declaraciones `--x: valor;` del bloque de `:root` de F1, como mapa. */
function declaraciones(css: string): Map<string, string> {
  const bloque = /^:root \{ (.*?) \}/.exec(css)?.[1] ?? '';
  const m = new Map<string, string>();
  for (const d of bloque.split(/;\s*/)) {
    const i = d.indexOf(':');
    if (i > 0) m.set(d.slice(0, i).trim(), d.slice(i + 1).trim());
  }
  return m;
}

// ── La regla de oro: sin nada elegido, F1 EXACTO ─────────────────────────────

/**
 * `paletaEfectivaReservar` de F1 (27-sep-2026), CONGELADA aquí a propósito: la
 * función real cambió para aceptar el estilo de su web, y compararla consigo
 * misma no probaría nada.
 */
function paletaF1(a: AparienciaWidget, embed: boolean, temaApp: TemaAppReservar, o: OpcionesWidget): PaletaEfectiva {
  if (!embed || !widgetDecide(a, temaApp, o)) return { tokens: temaApp.tokens, noche: temaApp.oscuro, varsEnLinea: null };
  const modo = modoTextoDe(a);
  return {
    tokens: tokensCalendarioDeApariencia(a, modo),
    noche: modo === 'noche',
    varsEnLinea: {
      ...varsReservarModo(modo),
      ...(modo === 'noche' ? MARCA_DEL_ESTUDIO_EN_LINEA_NOCHE : MARCA_DEL_ESTUDIO_EN_LINEA),
      ...(modo === 'dia' ? { colorScheme: 'light' } : {}),
    },
  };
}
function cssF1(a: AparienciaWidget, p: PaletaEfectiva): string {
  const decide = p.varsEnLinea != null;
  return `html,body{background:${fondoCss(a) ?? (decide ? p.tokens.bg : 'var(--portal-bg)')} !important;}${decide ? ':root:root{color-scheme:normal;}' : ''}`;
}

test('⚠️ sin claves nuevas, /reservar es F1 EXACTO: 8 estilos × parámetros del snippet × embed', () => {
  const sinElegir: (WidgetWeb | null | undefined)[] = [null, undefined, w(), w({ web: 'oscura' }), w({ web: 'otro', colorWeb: '#123456' })];
  for (const estilo of ESTILO_IDS) {
    const temaApp = temaAppParaReservar({ estilo, marca: estilo === 'carbon' ? 'fiel' : 'suave' });
    const b = base('#666dcc', { estilo });
    for (const q of ['', 'fondo=%23ffffff', 'marca=%23E11D48', 'diseno=ligero', 'texto=claro']) {
      const p = params(q);
      const a = resolverAparienciaWidget(null, p);
      const o = { marca: p.get('marca'), ligero: p.get('diseno') === 'ligero' };
      for (const embed of [false, true]) {
        const antes = paletaF1(a, embed, temaApp, o);
        for (const x of sinElegir) for (const ctx of ['dentro', 'ventana'] as Contexto[]) {
          const web = resolverEstiloWeb(x, b, ctx);
          assert.equal(web, null, `${estilo} ${JSON.stringify(x)}`);
          const ahora = paletaEfectivaReservar(a, embed, temaApp, o, web);
          assert.deepEqual(ahora, antes, `${estilo} ?${q} embed=${embed}`);
          assert.equal(cssDocumentoIncrustado(a, ahora), cssF1(a, antes), `${estilo} ?${q}`);
        }
      }
    }
  }
});

test('el color por defecto es el `primary` de DEFAULT_THEME: lo que pinta F1 sin color de estudio', () => {
  assert.equal(COLOR_PRIMARIO_POR_DEFECTO, DEFAULT_THEME.primary);
  assert.equal(base(null).colorPrimario, null);
  assert.equal(base('red;}</style>').colorPrimario, null);
  assert.equal(base('#abc').colorPrimario, '#abc');
  assert.deepEqual(botonWeb(null, 'crema', base(null)).fondo, DEFAULT_THEME.primary);
});

// ── Un código con diseño propio no recibe el estilo de su web ────────────────

const DISPONIBLES = WIDGETS.filter(esDisponible);
const entrada = (widget: (typeof DISPONIBLES)[number], config: ConfigConstructor) =>
  ({ widget, config, origen: 'https://www.tentare.app', slug: 'estudio-ejemplo', colorEstudio: '#7A2E4F' });

test('urlTraeDisenoPropio: todo código «propio» del constructor con un eje tocado lo trae', () => {
  const ejes: Partial<ConfigConstructor>[] = [
    { marca: '#E11D48' }, { fondo: '#FFFFFF' }, { fondo: 'transparente' }, { tinta: '#112233' },
    { superficie: '#FAFAFA' }, { linea: '#DDDDDD' }, { tema: 'claro' }, { tema: 'oscuro' },
    { forma: 'recto' }, { densidad: 'compacta' }, { fuente: 'Poppins' }, { fuenteDisplay: 'Lobster' },
  ];
  for (const x of DISPONIBLES) for (const eje of ejes) for (const metodo of ['iframe', 'popup'] as const) {
    const c = { ...CONFIG_POR_DEFECTO, identidad: 'propia' as const, ...eje };
    const url = urlEmbebido(entrada(x, c), metodo);
    assert.equal(urlTraeDisenoPropio(new URL(url).searchParams), true, url);
    assert.equal(tieneDisenoEnCodigo(c), true, JSON.stringify(eje));
  }
});

test('urlTraeDisenoPropio: ningún código con la identidad del estudio lo trae, toque lo que toque de contenido', () => {
  const variantes: Partial<ConfigConstructor>[] = [
    {}, { tipos: ['tc-a'], mostrarPrecio: false, mostrarPie: false }, { diseno: 'ligero' }, { presentacion: 'semana' },
    { vista: 'hoy', etiqueta: 'mi-web' },
    // Lo que se guardó con «propia» y luego se volvió a «estudio»: no se emite.
    { marca: '#E11D48', fondo: '#000000', forma: 'recto', fuente: 'Poppins', tema: 'oscuro' },
  ];
  for (const x of DISPONIBLES) for (const v of variantes) for (const metodo of ['iframe', 'popup'] as const) {
    const c = { ...CONFIG_POR_DEFECTO, ...v, identidad: 'estudio' as const };
    const url = urlEmbebido(entrada(x, c), metodo);
    assert.equal(urlTraeDisenoPropio(new URL(url).searchParams), false, url);
    assert.equal(tieneDisenoEnCodigo(c), false);
  }
  // «Propia» sin tocar nada no emite nada: sigue su estilo, y las dos preguntas lo dicen igual.
  assert.equal(tieneDisenoEnCodigo({ ...CONFIG_POR_DEFECTO, identidad: 'propia' }), false);
});

test('urlTraeDisenoPropio: cualquier parámetro de diseño escrito a mano cuenta; vacío, no', () => {
  for (const k of PARAMS_DISENO_PROPIO) {
    assert.equal(urlTraeDisenoPropio(params(`embed=1&${k}=x`)), true, k);
    assert.equal(urlTraeDisenoPropio(params(`embed=1&${k}=`)), false, k);
  }
  assert.equal(urlTraeDisenoPropio(params('embed=1&tab=clases&diseno=ligero&pie=0&solo-pestana=1&ref=web')), false);
});

// ── Fundido ──────────────────────────────────────────────────────────────────

test('fundido: 8 estilos × las tres webs con nombre, siempre se lee y deja ver su web', () => {
  for (const estilo of ESTILO_IDS) for (const [nombre, color] of Object.entries(COLOR_WEB)) {
    const p = paletaWidget(estilo, color, true);
    assert.equal(p.legible, true, `${estilo} sobre ${nombre}`);
    assert.ok(r(p.tokens.ink, color) >= 4.5, `${estilo} sobre ${nombre}: texto`);
    assert.ok(r(p.tokens.muted, color) >= 4.5, `${estilo} sobre ${nombre}: secundario`);
    assert.equal(p.tokens.bg, color);
    assert.equal(p.fondoRaiz, 'transparent');
    const web = resolverEstiloWeb(w({ estilo, web: nombre as WidgetWeb['web'], fundido: true }), base(), 'dentro')!;
    assert.equal(web.varsEnLinea!['--portal-bg'], color);
    assert.equal(web.fondoRaiz, 'transparent');
  }
});

test('fundido: las tarjetas son las del estilo; y un estilo claro sobre una web oscura pasa a Carbón (y al revés)', () => {
  const arenaBlanca = paletaWidget('arena', COLOR_WEB.blanca, true);
  assert.equal(arenaBlanca.neutros, 'arena');
  assert.equal(arenaBlanca.tokens.surface, '#FFFCF7');
  const arenaOscura = paletaWidget('arena', COLOR_WEB.oscura, true);
  assert.equal(arenaOscura.neutros, 'carbon');
  assert.equal(arenaOscura.noche, true);
  assert.equal(paletaWidget('carbon', COLOR_WEB.oscura, true).neutros, 'carbon');
  assert.equal(paletaWidget('carbon', COLOR_WEB.blanca, true).neutros, 'crema');
});

test('⚠️ en la ventana que se abre encima nunca se funde: su marco es blanco fijo', () => {
  for (const x of [w({ estilo: 'arena', web: 'oscura', fundido: true }), w({ web: 'otro', colorWeb: '#223344', fundido: true })]) {
    const dentro = resolverEstiloWeb(x, base(), 'dentro')!;
    const ventana = resolverEstiloWeb(x, base(), 'ventana');
    assert.equal(dentro.fondoRaiz, 'transparent');
    assert.equal(ventana?.fondoRaiz ?? null, null);
    assert.notEqual(ventana?.tokens.bg, x.web === 'oscura' ? COLOR_WEB.oscura : '#223344');
  }
  // Solo «fundido» y nada más: en la ventana no queda nada que escribir en línea.
  assert.equal(resolverEstiloWeb(w({ web: 'oscura', fundido: true }), base(), 'ventana')!.varsEnLinea, null);
});

test('fundido sobre un gris medio: no se lee con ningún estilo, y no se deja aplicar', () => {
  const gris = w({ web: 'otro', colorWeb: '#808080', fundido: true });
  assert.equal(paletaWidget('crema', '#808080', true).legible, false);
  assert.deepEqual(validarEstiloWeb(gris, base()), [{ campo: 'colorWeb', mensaje: MENSAJE_FUNDIDO_ILEGIBLE }]);
  assert.deepEqual(validarEstiloWeb({ ...gris, fundido: false }, base()), []);
  // La vista previa enseña algo igualmente (el que menos pierde), nunca rompe.
  assert.ok(resolverEstiloWeb(gris, base(), 'dentro')!.varsEnLinea);
});

// ── Oscuro y claro ───────────────────────────────────────────────────────────

test('Carbón en su recuadro es de noche, y lo dice (`color-scheme: dark`)', () => {
  const web = resolverEstiloWeb(w({ estilo: 'carbon' }), base(), 'dentro')!;
  assert.equal(web.noche, true);
  assert.equal(web.varsEnLinea!.colorScheme, 'dark');
  assert.equal(web.varsEnLinea!['--portal-bg'], '#17181B');
});

test('un estilo claro sobre una app Carbón escribe su paleta ENTERA y pide `color-scheme: light`', () => {
  const web = resolverEstiloWeb(w({ estilo: 'crema' }), base('#E11D48', { estilo: 'carbon' }), 'dentro')!;
  assert.equal(web.noche, false);
  assert.equal(web.varsEnLinea!.colorScheme, 'light');
  for (const [k, v] of Object.entries(varsReservarModo('dia'))) assert.equal(web.varsEnLinea![k], v, k);
  assert.deepEqual(web.tokens, RESERVAR_PALETA.dia);
});

// ── Botones ──────────────────────────────────────────────────────────────────

test('botones elegidos: 8 estilos × 9 colores × 3 opciones, el texto encima siempre se lee', () => {
  for (const estilo of ESTILO_IDS) for (const c of COLORES) {
    const b = base(c, { estilo });
    for (const opcion of ['tinta', 'suave', 'fiel'] as const) {
      const x = botonWeb(opcion, estilo, b);
      assert.ok(r(x.fondo, x.texto) >= 4.5, `${estilo}/${c}/${opcion}: ${x.fondo} con ${x.texto}`);
      assert.deepEqual(validarEstiloWeb(w({ estilo, boton: opcion }), b), [], `${estilo}/${c}/${opcion}`);
    }
  }
});

test('por defecto (`null`) los botones son los de F1, carácter por carácter', () => {
  for (const c of COLORES) {
    // Crema + suave: F1 no toca la marca, se queda la del tema en `:root`.
    const tema = themeToCssVars({ ...DEFAULT_THEME, primary: c }) as Record<string, string>;
    assert.deepEqual(botonWeb(null, 'crema', base(c)), { fondo: tema['--portal-brand'], texto: tema['--portal-brand-foreground'] }, c);
    for (const app of [{ estilo: 'arena', marca: 'suave' }, { estilo: 'carbon', marca: 'fiel' }] as const) {
      const d = declaraciones(temaReservarCssText(c, app, MARCA));
      assert.deepEqual(botonWeb(null, app.estilo, base(c, app)),
        { fondo: d.get('--portal-brand'), texto: d.get('--portal-brand-foreground') }, `${app.estilo}/${c}`);
    }
  }
});

test('«Tu color tal cual»: el color crudo si su texto se lee; si no, oscurecido lo justo', () => {
  assert.deepEqual(botonWeb('fiel', 'crema', base('#1F4E79')), { fondo: '#1F4E79', texto: '#FFFFFF' });
  assert.equal(botonWeb('fiel', 'crema', base('#F7A6C4')).fondo, '#F7A6C4');
  // Un gris medio: ni blanco ni casi negro llegan a AA encima (~4,4 y ~4,2).
  // Tal cual se quedaría así; «tal cual» no es «ilegible».
  const medio = botonWeb('fiel', 'crema', base('#787878'));
  assert.notEqual(medio.fondo.toLowerCase(), '#787878');
  assert.ok(r(medio.fondo, medio.texto) >= 4.5);
  // Y en Carbón, «Oscuros» son claros.
  assert.deepEqual(botonWeb('tinta', 'carbon', base()), { fondo: '#F2F3F5', texto: '#17181B' });
});

test('botonPorDefecto: la opción que se ve igual que la de por defecto, o ninguna', () => {
  assert.equal(botonPorDefecto('crema', base('#1F4E79')), 'fiel');
  assert.equal(botonPorDefecto('arena', base('#1F4E79', { estilo: 'arena' })), 'suave');
  assert.equal(botonPorDefecto('carbon', base('#1F4E79', { estilo: 'carbon', marca: 'fiel' })), 'fiel');
  // App en Crema + «fiel»: por defecto va el acento fiel de la app, y un rosa
  // pastel tal cual (con letra oscura) no se le parece: ninguna coincide.
  assert.equal(botonPorDefecto('crema', base('#F7A6C4', { marca: 'fiel' })), null);
});

// ── El botón que abre la ventana (Fase D) ────────────────────────────────────

test('⚠️ botonDeLaVentana: los botones de DENTRO de la ventana, y el servidor nunca emite algo que el script rechace', () => {
  // 8 estilos de la app × sus dos marcas × 9 colores (y sin color) × con y sin
  // estilo solo para su web × 4 botones × 4 esquinas.
  let casos = 0;
  for (const [i, estilo] of ESTILO_IDS.entries()) for (const marca of ['suave', 'fiel'] as const) {
    for (const c of [...COLORES, null]) {
      const b = base(c, { estilo, marca });
      for (const propio of [null, ESTILO_IDS[(i + 3) % ESTILO_IDS.length]]) {
        for (const boton of [null, 'tinta', 'suave', 'fiel'] as const) for (const forma of [null, 'pill', 'redondeado', 'recto'] as const) {
          const x = w({ estilo: propio, boton, forma });
          const caso = `${estilo}/${marca}/${c}/${propio}/${boton}/${forma}`;
          const dentro = resolverEstiloWeb(x, b, 'ventana')?.boton ?? botonWeb(null, b.app.estilo, b);
          const vivo = botonDeLaVentana(x, b);
          assert.deepEqual(vivo, { ...dentro, esquinas: forma ?? 'pill' }, caso);
          assert.notEqual(leerBotonVivo(vivo), null, `${caso}: ${JSON.stringify(vivo)}`);
          casos++;
        }
      }
    }
  }
  assert.equal(casos, 8 * 2 * 10 * 2 * 4 * 4);
});

test('botonDeLaVentana: con nada elegido, los botones de F1 y las esquinas de siempre', () => {
  for (const x of [null, undefined, w(), w({ web: 'oscura' })]) {
    for (const c of COLORES) {
      assert.deepEqual(botonDeLaVentana(x, base(c)), { ...botonWeb(null, 'crema', base(c)), esquinas: 'pill' }, `${c}/${JSON.stringify(x)}`);
    }
  }
  // Sin color de estudio, el de por defecto.
  assert.equal(botonDeLaVentana(null, base(null)).fondo, COLOR_PRIMARIO_POR_DEFECTO);
});

test('⚠️ botonDeLaVentana: fundido no cuenta (el marco de la ventana es blanco fijo)', () => {
  // Arena fundida sobre una web oscura: dentro de su web pasa a Carbón y sus
  // botones con ella; en la ventana, y por tanto en el botón que la abre, no.
  const arena = { estilo: 'arena', boton: 'tinta', web: 'oscura' } as const;
  const b = base('#1F4E79');
  const fundido = botonDeLaVentana(w({ ...arena, fundido: true }), b);
  assert.deepEqual(fundido, botonDeLaVentana(w({ ...arena, fundido: false }), b));
  assert.deepEqual(fundido, { ...botonWeb('tinta', 'arena', b), esquinas: 'pill' });
  assert.notDeepEqual({ fondo: fundido.fondo, texto: fundido.texto }, resolverEstiloWeb(w({ ...arena, fundido: true }), b, 'dentro')!.boton);
});

test('la marca escrita en línea se lee como texto sobre lo que se ve, fundido incluido', () => {
  for (const estilo of ESTILO_IDS) for (const c of COLORES) for (const boton of [null, 'tinta', 'suave', 'fiel'] as const) {
    for (const web of [w({ estilo, boton }), w({ estilo, boton, web: 'oscura', fundido: true })]) {
      const x = resolverEstiloWeb(web, base(c), 'dentro')!;
      const v = x.varsEnLinea!;
      assert.equal(v['--portal-brand'], x.boton.fondo);
      for (const f of [x.tokens.bg, x.tokens.surface, x.tokens.surface2]) {
        assert.ok(r(v['--portal-brand-texto'], f) >= 4.5, `${estilo}/${c}/${boton}: marca como texto sobre ${f}`);
      }
    }
  }
});

// ── Letra ────────────────────────────────────────────────────────────────────

test('letra: 9 parejas de la app × 9 de su web, siempre las cuatro variables y ninguna en ciclo', () => {
  for (const deLaApp of TIPOGRAFIA_IDS) for (const letra of TIPOGRAFIA_IDS) {
    const v = resolverEstiloWeb(w({ letra }), base('#E11D48', { tipografia: deLaApp }), 'dentro')!.varsLetra!;
    assert.deepEqual(Object.keys(v).sort(), ['--font-display', '--font-ui', '--portal-heading-font', '--reservar-heading-weight']);
    for (const [k, valor] of Object.entries(v)) {
      assert.doesNotMatch(valor, /var\(--font-ui\)|var\(--font-display\)|var\(--portal-heading-font\)|var\(--reservar-heading-weight\)/, `${deLaApp}/${letra}: ${k}`);
    }
  }
  // Solo la letra: los colores se quedan los de la app.
  assert.equal(resolverEstiloWeb(w({ letra: 'editorial' }), base(), 'dentro')!.varsEnLinea, null);
});

// ── El borrador de la vista previa ───────────────────────────────────────────

test('el borrador solo cuenta en la vista previa incrustada del panel', () => {
  const arena = encodeURIComponent(borradorAParam(w({ estilo: 'arena' })));
  assert.deepEqual(leerBorradorWeb(params(`embed=1&vista-previa=1&${PARAM_BORRADOR}=${arena}`)), w({ estilo: 'arena' }));
  assert.equal(leerBorradorWeb(params(`embed=1&${PARAM_BORRADOR}=${arena}`)), undefined);
  assert.equal(leerBorradorWeb(params(`vista-previa=1&${PARAM_BORRADOR}=${arena}`)), undefined);
  assert.equal(leerBorradorWeb(params('embed=1&vista-previa=1')), undefined);
  assert.equal(leerBorradorWeb(params(`embed=1&vista-previa=1&${PARAM_BORRADOR}=%7Bno-json`)), undefined);
  // «Nada elegido» SÍ es un borrador: enseña la app aunque lo publicado sea otro.
  assert.deepEqual(leerBorradorWeb(params(`embed=1&vista-previa=1&${PARAM_BORRADOR}=%7B%7D`)), w());
  // Y lo que trae se valida como lo guardado.
  const malo = encodeURIComponent(JSON.stringify({ web: 'otro', colorWeb: '#fff;}</style>', fundido: true }));
  assert.deepEqual(leerBorradorWeb(params(`embed=1&vista-previa=1&${PARAM_BORRADOR}=${malo}`)), w({ fundido: true }));
});

test('⚠️ el tope del borrador lo corta el TAMAÑO: un JSON válido de más de 1000 caracteres no se lee', () => {
  // JSON válido y con un estilo que se leería (`relleno` no es una clave: se
  // ignora), para que lo único que pueda rechazarlo sea el tope. Con algo que
  // no fuera JSON, lo rechazaría `JSON.parse` y el tope podría no existir.
  const deLargo = (n: number) => {
    const sinRelleno = JSON.stringify({ estilo: 'arena', relleno: '' }).length;
    const crudo = JSON.stringify({ estilo: 'arena', relleno: 'a'.repeat(n - sinRelleno) });
    assert.equal(crudo.length, n);
    return `embed=1&vista-previa=1&${PARAM_BORRADOR}=${encodeURIComponent(crudo)}`;
  };
  assert.deepEqual(leerBorradorWeb(params(deLargo(1000))), w({ estilo: 'arena' }));
  assert.equal(leerBorradorWeb(params(deLargo(1001))), undefined);
  assert.equal(leerBorradorWeb(params(deLargo(5000))), undefined);
});

// ── Nada de lo que se escribe en línea puede salirse ─────────────────────────

test('⚠️ ningún valor emitido lleva `</`, `{` ni `;`', () => {
  const muestras: WidgetWeb[] = [];
  for (const estilo of [null, ...ESTILO_IDS] as (EstiloId | null)[]) {
    muestras.push(
      w({ estilo, letra: 'serena', boton: 'fiel' }),
      w({ estilo, boton: 'tinta', web: 'otro', colorWeb: '#E8E1D3', fundido: true }),
      w({ estilo, letra: 'moderna', boton: 'suave', web: 'oscura', fundido: true }),
    );
  }
  for (const x of muestras) for (const c of [...COLORES, null, '#abc']) for (const ctx of ['dentro', 'ventana'] as Contexto[]) {
    const res = resolverEstiloWeb(x, base(c), ctx)!;
    for (const v of Object.values({ ...res.varsEnLinea, ...res.varsLetra })) {
      assert.doesNotMatch(v, /<\/|\{|;/, `${JSON.stringify(x)}: ${v}`);
    }
  }
});

// ── Textos ───────────────────────────────────────────────────────────────────

test('el resumen y la línea de Actividad, en palabras de la interfaz', () => {
  const app = resolverApariencia({ estilo: 'arena' });
  assert.equal(resumenEstiloWeb(w({ estilo: 'arena', letra: 'editorial' }), app), 'Arena, solo para tu web · letra Editorial');
  assert.equal(resumenEstiloWeb(null, app), 'Igual que tu app · Arena');
  assert.equal(resumenEstiloWeb(w({ boton: 'tinta' }), resolverApariencia({ estilo: 'carbon' })), 'Igual que tu app · Carbón · botones claros');
  assert.equal(textoActividadEstiloWeb(w({ estilo: 'arena', letra: 'editorial' }), app, 'aplicar'),
    'Estilo de tus widgets: Arena, solo para tu web · letra Editorial');
  assert.equal(textoActividadEstiloWeb(null, app, 'aplicar'), 'Estilo de tus widgets: igual que tu app · Arena');
  assert.equal(textoActividadEstiloWeb(w({ estilo: 'luz' }), app, 'deshacer'), 'Estilo de tus widgets: vuelto al de antes');
});

test('⚠️ la línea de Actividad no lleva datos del estudio: ni su color, ni su web', () => {
  const todo = w({
    estilo: 'rubor', letra: 'romantica', boton: 'fiel', web: 'otro', colorWeb: '#E8E1D3', fundido: true,
    forma: 'recto', densidad: 'compacta', ocultarPie: true,
  });
  const texto = textoActividadEstiloWeb(todo, resolverApariencia(null), 'aplicar');
  assert.doesNotMatch(texto, /#|@|https?:/);
  assert.ok(texto.length < 200, texto);
});

test('validarEstiloWeb no juzga lo de por defecto: es lo que ya se ve hoy', () => {
  // Un color de tono medio con su texto por luminancia puede quedarse en ~4,3:
  // con los botones por defecto no se bloquea; elegidos, «tal cual» lo arregla.
  const medio = base('#787878');
  const porDefecto = botonWeb(null, 'crema', medio);
  assert.ok(r(porDefecto.fondo, porDefecto.texto) < 4.5);
  assert.deepEqual(validarEstiloWeb(w({ estilo: 'crema' }), medio), []);
  assert.deepEqual(validarEstiloWeb(w({ estilo: 'crema', boton: 'fiel' }), medio), []);
  // Los dos avisos, con las palabras aprobadas: los repiten el panel y el 422.
  assert.equal(MENSAJE_BOTON_ILEGIBLE, 'Con este estilo, el texto de los botones no se lee bien. Prueba otro color de botones.');
  assert.equal(MENSAJE_FUNDIDO_ILEGIBLE, 'Con este color de web, el texto fundido no se lee bien. Prueba «En su propio recuadro».');
  // Y los tokens del estilo en su recuadro son los de F1 para ese estilo.
  assert.deepEqual(resolverEstiloWeb(w({ estilo: 'piedra' }), base(), 'dentro')!.tokens, tokensDeEstilo(ESTILOS.find(e => e.id === 'piedra')!));
});
