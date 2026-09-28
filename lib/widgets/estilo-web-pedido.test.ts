import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { MENSAJE_PEDIDO_ESTILO_INVALIDO, validarPedidoEstiloWeb } from './estilo-web-pedido.ts';
import { decidirEstiloWeb } from './estilo-web-aplicar.ts';
import { WIDGET_WEB_NEUTRO, leerWidgetWeb, mismoWidgetWeb, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { ESTILO_IDS, TIPOGRAFIA_IDS } from '../student/apariencia.ts';
import { DEFAULT_THEME, resolveTheme } from '../theme-schema.ts';
import { fusionarCampos } from '../theme-publicar-campos.ts';

const RAIZ = new URL('../../', import.meta.url);
const leer = (ruta: string) => readFileSync(new URL(ruta, RAIZ), 'utf8');

const w = (parcial: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });
const ARENA = w({ estilo: 'arena', letra: 'editorial', boton: 'tinta' });
const OTRO = w({ estilo: 'luz', web: 'otro', colorWeb: '#E8E1D3', fundido: true, forma: 'recto', densidad: 'compacta', ocultarPie: true });

/** Lo que manda `aplicarEstiloWidgetsApi` (lib/api-client.ts), tal cual viaja. */
const porLaRed = (p: unknown): unknown => JSON.parse(JSON.stringify(p));

test('acepta lo que manda el panel al aplicar y al deshacer', () => {
  for (const pedido of [
    { estilo: ARENA, esperado: null, motivo: 'aplicar' },
    { estilo: null, esperado: ARENA, motivo: 'deshacer' },
    { estilo: OTRO, esperado: ARENA, motivo: 'aplicar' },
    { estilo: w(), esperado: w(), motivo: 'aplicar' },
  ] as const) {
    const r = validarPedidoEstiloWeb(porLaRed(pedido));
    assert.ok(r.ok, JSON.stringify(pedido));
    if (r.ok) assert.deepEqual(r.pedido, pedido);
  }
});

test('todo estilo que pasa se vuelve a leer igual: lo que se escribe no se «repara» al leerlo', () => {
  for (const estilo of [null, ...ESTILO_IDS]) {
    for (const letra of [null, ...TIPOGRAFIA_IDS]) {
      const pedido = w({ estilo, letra, boton: 'fiel', web: 'crema' });
      const r = validarPedidoEstiloWeb(porLaRed({ estilo: pedido, esperado: null, motivo: 'aplicar' }));
      assert.ok(r.ok, `${estilo}/${letra}`);
      if (r.ok) assert.deepEqual(leerWidgetWeb(r.pedido.estilo), r.pedido.estilo);
    }
  }
});

test('⚠️ lo que no es exactamente un estilo es un 400, y no se escribe nada', () => {
  const malos: Array<[string, unknown]> = [
    ['sin cuerpo', null],
    ['texto', 'arena'],
    ['lista', [ARENA]],
    ['vacío', {}],
    ['sin motivo', { estilo: ARENA, esperado: null }],
    ['motivo inventado', { estilo: ARENA, esperado: null, motivo: 'publicar' }],
    ['sin esperado', { estilo: ARENA, motivo: 'aplicar' }],
    // El estudio sale de la sesión: pedirlo en el cuerpo no se ignora, se rechaza.
    ['estudio en el cuerpo', { estilo: ARENA, esperado: null, motivo: 'aplicar', studioId: 'otro-estudio' }],
    // Ni una clave del tema colada dentro del estilo (las `widget*` antiguas).
    ['clave de más', { estilo: { ...ARENA, widgetFondo: '#000000' }, esperado: null, motivo: 'aplicar' }],
    ['estilo a medias', { estilo: { estilo: 'arena' }, esperado: null, motivo: 'aplicar' }],
    ['estilo inventado', { estilo: w({ estilo: 'neon' as never }), esperado: null, motivo: 'aplicar' }],
    ['fundido en texto', { estilo: { ...ARENA, fundido: 'true' }, esperado: null, motivo: 'aplicar' }],
    // Lo que acabaría dentro del `<style>` de /reservar: solo hex de 6 dígitos.
    ['color que cierra el style', { estilo: w({ web: 'otro', colorWeb: '#fff;}</style>' }), esperado: null, motivo: 'aplicar' }],
    ['color con nombre', { estilo: w({ web: 'otro', colorWeb: 'red' }), esperado: null, motivo: 'aplicar' }],
    ['color de 3 dígitos', { estilo: w({ web: 'otro', colorWeb: '#fff' }), esperado: null, motivo: 'aplicar' }],
    ['«otro color» sin color', { estilo: w({ web: 'otro' }), esperado: null, motivo: 'aplicar' }],
    ['color sin «otro color»', { estilo: w({ web: 'crema', colorWeb: '#E8E1D3' }), esperado: null, motivo: 'aplicar' }],
    // El esperado pasa por la misma cerradura: es contra lo que se compara.
    ['esperado inválido', { estilo: ARENA, esperado: { estilo: 'arena' }, motivo: 'aplicar' }],
  ];
  for (const [nombre, cuerpo] of malos) {
    assert.deepEqual(validarPedidoEstiloWeb(cuerpo), { ok: false, error: MENSAJE_PEDIDO_ESTILO_INVALIDO }, nombre);
  }
});

// ── Lo que escribe lib/theme-data.ts con la decisión ─────────────────────────
// `aplicarEstiloWebTheme` fusiona `cambios` sobre lo publicado y lo guarda como
// JSON; /reservar lo lee con `resolveTheme`. Aquí esa misma cadena, sin BD.

const escribirYLeer = (publicado: object, cambios: object) =>
  resolveTheme(JSON.parse(JSON.stringify(fusionarCampos(publicado, publicado, cambios).publicado)));

test('lo aplicado llega entero a lo que lee /reservar, sin tocar el resto del tema', () => {
  const antes = resolveTheme({ ...DEFAULT_THEME, primary: '#8A3B5C', appAlumna: { estilo: 'bosque', tipografia: 'editorial', marca: 'suave', boton: 'tinta', encuadre: null } });
  const r = validarPedidoEstiloWeb(porLaRed({ estilo: OTRO, esperado: null, motivo: 'aplicar' }));
  assert.ok(r.ok);
  if (!r.ok) return;
  const d = decidirEstiloWeb(antes, r.pedido);
  assert.equal(d.tipo, 'escribir');
  if (d.tipo !== 'escribir') return;
  const despues = escribirYLeer(antes, d.cambios);
  assert.deepEqual(despues.widgetWeb, OTRO);
  assert.deepEqual({ ...despues, widgetWeb: undefined }, { ...antes, widgetWeb: undefined });
});

test('deshacer a «nada» deja el tema sin la clave, como si nunca se hubiera aplicado', () => {
  const antes = resolveTheme({ ...DEFAULT_THEME, widgetWeb: ARENA });
  const r = validarPedidoEstiloWeb(porLaRed({ estilo: null, esperado: ARENA, motivo: 'deshacer' }));
  assert.ok(r.ok);
  if (!r.ok) return;
  const d = decidirEstiloWeb(antes, r.pedido);
  assert.equal(d.tipo, 'escribir');
  if (d.tipo !== 'escribir') return;
  const despues = escribirYLeer(antes, d.cambios);
  assert.equal('widgetWeb' in despues, false);
  assert.deepEqual(despues, resolveTheme(DEFAULT_THEME));
});

test('aplicar lo que ya hay es «sin cambios»: la condición con la que no se escribe ni se apunta nada', () => {
  const antes = resolveTheme({ ...DEFAULT_THEME, widgetWeb: OTRO });
  // Mismo estilo, con el color en minúsculas: sigue siendo el mismo.
  const pedido = { estilo: { ...OTRO, colorWeb: OTRO.colorWeb!.toLowerCase() }, esperado: OTRO, motivo: 'aplicar' as const };
  const d = decidirEstiloWeb(antes, pedido);
  assert.equal(d.tipo, 'escribir');
  if (d.tipo === 'escribir') assert.ok(mismoWidgetWeb(d.aplicado, d.anterior));
  // Y un cambio de verdad no lo es.
  const otro = decidirEstiloWeb(antes, { estilo: ARENA, esperado: OTRO, motivo: 'aplicar' });
  assert.ok(otro.tipo === 'escribir' && !mismoWidgetWeb(otro.aplicado, otro.anterior));
});

// ── Contrato con la ruta ─────────────────────────────────────────────────────

const RUTA = 'app/api/estudio/widget-estilo/route.ts';

test('la ruta comprueba la sesión y el rol antes de tocar nada, y el estudio sale de la sesión', () => {
  const ruta = leer(RUTA);
  assert.match(ruta, /export const dynamic = 'force-dynamic'/);
  const sesion = ruta.indexOf('verificarSesionStaff(req)');
  const rol = ruta.indexOf("sesion.rol !== 'PROPIETARIO'");
  const aplicar = ruta.indexOf('aplicarEstiloWebTheme(sesion.studioId');
  assert.ok(sesion > 0 && rol > sesion && aplicar > rol, 'sesión → rol → aplicar, en ese orden');
  assert.ok(ruta.indexOf('status: 403', rol) - rol < 200, 'el rol corta con un 403');
  const validar = ruta.indexOf('validarPedidoEstiloWeb(');
  assert.ok(validar > rol && validar < aplicar, 'el cuerpo se valida antes de aplicar');
  // Sin candado de plan, como el resto de los widgets.
  assert.doesNotMatch(ruta, /featureDeEstudio|tieneFeature/);
  // El cuerpo se lee UNA vez y va directo al validador: no hay otra vía de entrada.
  assert.equal(ruta.match(/req\.json\(/g)?.length, 1);
  assert.match(ruta, /validarPedidoEstiloWeb\(await req\.json\(\)/);
  assert.match(ruta, /studio_id: sesion\.studioId/);
});

test('la ruta deja constancia en Actividad y responde lo que el panel necesita para deshacer', () => {
  const ruta = leer(RUTA);
  assert.match(ruta, /from\('actividad_reciente'\)\.insert\(\{[\s\S]*?tipo: 'WIDGETS_ESTILO_CAMBIADO'[\s\S]*?socio_id: null[\s\S]*?actor_nombre: sesion\.nombre/);
  assert.match(ruta, /NextResponse\.json\(\{ aplicado: resultado\.aplicado, anterior: resultado\.anterior \}\)/);
  assert.match(ruta, /status: 409/);
  assert.match(ruta, /status: 422/);
  // El panel llama justo a esta ruta.
  assert.ok(existsSync(new URL(RUTA, RAIZ)));
  assert.match(leer('lib/api-client.ts'), /fetch\('\/api\/estudio\/widget-estilo'/);
});

test('el servidor mide el contraste del ESTILO, no del tema entero, y escribe sin pisar a nadie', () => {
  const datos = leer('lib/theme-data.ts');
  const inicio = datos.indexOf('export async function aplicarEstiloWebTheme');
  assert.ok(inicio > 0, 'falta aplicarEstiloWebTheme');
  const cuerpo = datos.slice(inicio, datos.indexOf('\n}\n', inicio));
  for (const pieza of ['decidirEstiloWeb(', 'escribirSiNoHaCambiado(', 'invalidarCatalogoPublico(', 'throw new ConflictoTheme()']) {
    assert.ok(cuerpo.includes(pieza), `aplicarEstiloWebTheme sin ${pieza}`);
  }
  // Un tema publicado antiguo que incumpla el contraste del tema entero no
  // puede bloquear un cambio que no toca ninguno de sus colores.
  assert.ok(!cuerpo.includes('validarContrasteTheme'), 'el contraste del tema entero no pinta nada aquí');
});
