import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { columnasSinPaleta, piezasAfectadas, type DatosAfectados } from './estilo-afectados.ts';
import { WIDGETS, esDisponible, type MetodoIntegracion, type WidgetDisponible } from './catalogo.ts';
import { CONFIG_POR_DEFECTO, type ConfigConstructor, type Copiado } from './config.ts';
import { firmaCodigo, urlEmbebido } from './integracion.ts';
import { metodoEnWeb, type PlataformaWeb } from './recetas.ts';
import { resolverApariencia } from '../reservar/apariencia-widget.ts';
import { resolverConfigWidget } from '../reservar/config-widget.ts';
import { baseEstiloWeb, resolverEstiloWeb, type BaseEstiloWeb } from '../reservar/estilo-web.ts';
import { WIDGET_WEB_NEUTRO, type WebId, type WidgetWeb } from '../reservar/estilo-web-tipos.ts';
import { paletaEfectivaReservar } from '../reservar/precedencia-tema.ts';
import { temaAppParaReservar } from '../reservar/tema-app.ts';
import { ESTILO_IDS, type EstiloId } from '../student/apariencia.ts';

const c = (parcial: Partial<ConfigConstructor> = {}): ConfigConstructor => ({ ...CONFIG_POR_DEFECTO, ...parcial });
const ww = (parcial: Partial<WidgetWeb> = {}): WidgetWeb => ({ ...WIDGET_WEB_NEUTRO, ...parcial });
const BASE = baseEstiloWeb('#343825', null);
const GENERADO = { origen: 'https://tentare.example.com', slug: 'pilates-centro', colorEstudio: '#343825' };
const widget = (id: string) => WIDGETS.find((x): x is WidgetDisponible => x.id === id && esDisponible(x))!;
const HORARIO = widget('horario');
const VACIO = { cambian: [], columnasSinPaleta: [], botonesVivos: [], botonesCongelados: [], hayNativa: false, hayPagina: false };
/** Un borrador que sí cambia cómo se ve el botón de la ventana (sus esquinas) frente a nada publicado. */
const BOTON_NUEVO = ww({ forma: 'recto' });

/** La copia que registra el constructor al copiar el código de esta config, tal como es ahora. */
function copiaDe(id: string, config: ConfigConstructor, plataforma: PlataformaWeb | null): Copiado {
  const w = widget(id);
  return { firma: firmaCodigo({ widget: w, config, ...GENERADO }, metodoEnWeb(config, w, plataforma)), en: '2026-09-28T10:00:00.000Z' };
}

/** Todos los de `configs` copiados tal como son ahora, salvo los que se den en `copiados`. */
function datos(
  configs: Record<string, ConfigConstructor>, plataforma: PlataformaWeb | null,
  extra: Partial<DatosAfectados> = {},
): DatosAfectados {
  const copiados: Record<string, Copiado> = {};
  for (const [id, config] of Object.entries(configs)) copiados[id] = copiaDe(id, config, plataforma);
  return { configs, copiados, plataforma, ...GENERADO, estilo: null, publicado: null, base: BASE, ...extra };
}

test('nada copiado desde aquí: nada que nombrar', () => {
  assert.deepEqual(piezasAfectadas(datos({ horario: c() }, null, { copiados: {} })), VACIO);
});

test('solo lo COPIADO desde el constructor, por su nombre y en el orden del catálogo', () => {
  const configs = { planes: c({ metodo: 'iframe' }), horario: c({ metodo: 'iframe' }), cuenta: c({ metodo: 'iframe' }) };
  const todos = datos(configs, null);
  // «Mi cuenta» tiene su config pero no se copió desde aquí: no se nombra.
  const r = piezasAfectadas({ ...todos, copiados: { planes: todos.copiados.planes, horario: todos.copiados.horario } });
  assert.deepEqual(r.cambian, ['Horario y reservas', 'Planes y precios']);
});

test('la ventana encima cambia (su botón no); sin marco y los enlaces a la página, no', () => {
  const r = piezasAfectadas(datos({ horario: c({ metodo: 'popup' }), planes: c({ metodo: 'boton' }), cuenta: c({ metodo: 'enlace' }) }, 'otra', { estilo: BOTON_NUEVO }));
  assert.deepEqual(r.cambian, ['Horario y reservas']);
  // Copiado sin la marca de la Fase D: su botón es de un código anterior.
  assert.deepEqual(r.botonesCongelados, ['Horario y reservas']);
  assert.deepEqual(r.botonesVivos, []);
  assert.equal(r.hayPagina, true);
  assert.equal(r.hayNativa, false);
  const nativa = piezasAfectadas(datos({ horario: c({ metodo: 'nativa' }) }, 'otra'));
  assert.deepEqual(nativa, { ...VACIO, hayNativa: true });
});

test('⚠️ un widget con diseño propio en su código no cuenta: a ese no le llega el estilo', () => {
  const r = piezasAfectadas(datos({
    horario: c({ metodo: 'iframe', identidad: 'propia', marca: '#E11D48' }),
    planes: c({ metodo: 'popup', identidad: 'propia', forma: 'recto' }),
  }, null));
  assert.deepEqual(r, VACIO);
  // «Propia» sin tocar nada no emite diseño: sí cambia.
  assert.equal(piezasAfectadas(datos({ horario: c({ metodo: 'iframe', identidad: 'propia' }) }, null)).cambian.length, 1);
});

test('el método es el que se usa de verdad en su web, no el elegido si su web no lo admite', () => {
  // Sin web no se puede poner un iframe: el horario se queda en el enlace.
  assert.deepEqual(piezasAfectadas(datos({ horario: c({ metodo: 'iframe' }) }, 'sinweb')), { ...VACIO, hayPagina: true });
  // Copiado sin config guardada: la de por defecto (el recomendado del catálogo).
  const porDefecto = datos({}, null, { copiados: { horario: copiaDe('horario', CONFIG_POR_DEFECTO, null) } });
  assert.deepEqual(piezasAfectadas(porDefecto).cambian, ['Horario y reservas']);
});

// ── Lo copiado tiene que seguir siendo lo de ahora ───────────────────────────

test('⚠️ cambiado después de copiarlo: no sabemos qué lleva lo pegado, y no se nombra en ninguna línea', () => {
  // Copiado con un diseño propio (lo pegado lleva `marca=`) y quitado después sin volver a copiarlo.
  const antes = c({ metodo: 'iframe', identidad: 'propia', marca: '#E11D48' });
  const ahora = c({ metodo: 'iframe', identidad: 'estudio', marca: '#E11D48' });
  const r = piezasAfectadas(datos({ horario: ahora }, null, { copiados: { horario: copiaDe('horario', antes, null) } }));
  assert.deepEqual(r, VACIO);
  // Copiado sin marco y cambiado a iframe: tampoco (ni «sin marco» ni «cambia»).
  const nativa = c({ metodo: 'nativa' });
  const r2 = piezasAfectadas(datos({ horario: c({ metodo: 'iframe' }) }, 'otra', { copiados: { horario: copiaDe('horario', nativa, 'otra') } }));
  assert.deepEqual(r2, VACIO);
  // Una huella de otra visita que no es la de ningún código de ahora.
  assert.deepEqual(piezasAfectadas(datos({ horario: c() }, null, { copiados: { horario: { firma: 'huella', en: '2026-09-12T10:00:00.000Z' } } })), VACIO);
  // Y tampoco en la línea de las columnas: con Carbón, un horario que ahora va
  // en columnas pero se copió por días no se da por copiado.
  const r3 = piezasAfectadas(datos({ horario: c({ metodo: 'iframe', diseno: 'ligero' }) }, null, {
    copiados: { horario: copiaDe('horario', c({ metodo: 'iframe' }), null) },
    estilo: ww({ estilo: 'carbon' }),
  }));
  assert.deepEqual(r3, VACIO);
});

// ── «Siete días en columnas» con un estilo de noche ──────────────────────────
// La regla es la de /reservar: sobre un estilo oscuro, `diseno=ligero` decide
// la paleta (`widgetDecide`) y el estilo de su web solo le pone la letra, las
// esquinas, la separación y el pie. Se compara contra `paletaEfectivaReservar`
// de verdad, resuelta como la resuelve la página con la URL de su código.

/** ¿Recibe el widget la paleta del estilo de su web? Lo que pinta /reservar, por valor. */
function recibePaleta(w: WidgetDisponible, config: ConfigConstructor, metodo: MetodoIntegracion, estilo: WidgetWeb, base: BaseEstiloWeb): boolean | null {
  const p = new URL(urlEmbebido({ widget: w, config, ...GENERADO }, metodo)).searchParams;
  const web = resolverEstiloWeb(estilo, base, metodo === 'popup' ? 'ventana' : 'dentro');
  if (!web?.varsEnLinea) return null;
  const cw = resolverConfigWidget(p);
  const paleta = paletaEfectivaReservar(
    resolverApariencia(web.capa, p), true, temaAppParaReservar(base.app), { marca: cw.colorPrimario, ligero: cw.diseno === 'ligero' }, web,
  );
  return isDeepStrictEqual(paleta.varsEnLinea, web.varsEnLinea) && isDeepStrictEqual(paleta.tokens, web.tokens);
}

test('⚠️ columnas + estilo de noche: sale de «cambian» a su propia línea, igual que decide /reservar', () => {
  let sinPaleta = 0;
  let conPaleta = 0;
  const bases = [BASE, baseEstiloWeb('#343825', { estilo: 'carbon' })];
  const webs: [WebId | null, boolean][] = [[null, false], ['oscura', false], ['oscura', true], [null, true]];
  for (const w of [HORARIO, widget('prueba')]) {
    for (const metodo of ['iframe', 'popup'] as const) {
      for (const orden of [{ diseno: 'ligero' as const }, { diseno: null }, { diseno: 'ligero' as const, presentacion: 'semana' as const }]) {
        const config = c({ metodo, ...orden });
        for (const base of bases) for (const estilo of [null, ...ESTILO_IDS] as (EstiloId | null)[]) for (const [web, fundido] of webs) {
          const borrador = ww({ estilo, web, fundido, letra: 'editorial' });
          const recibe = recibePaleta(w, config, metodo, borrador, base);
          const sin = columnasSinPaleta(w, config, metodo, borrador, base);
          const caso = `${w.id}/${metodo}/${JSON.stringify(orden)}/${base.app.estilo}/${estilo}/${web}/${fundido}`;
          // Lo que dice el panel es lo que pinta la página: ni más ni menos.
          assert.equal(sin, recibe === false, caso);
          if (sin) sinPaleta++;
          else if (recibe) conPaleta++;
          // Y solo pasa con las columnas y de noche.
          if (sin) {
            assert.equal(orden.diseno, 'ligero', caso);
            assert.notEqual((orden as { presentacion?: string }).presentacion, 'semana', caso);
            assert.equal(resolverEstiloWeb(borrador, base, metodo === 'popup' ? 'ventana' : 'dentro')!.noche, true, caso);
          }
          const r = piezasAfectadas({
            configs: { [w.id]: config }, copiados: { [w.id]: copiaDe(w.id, config, null) }, plataforma: null, ...GENERADO, estilo: borrador, publicado: null, base,
          });
          assert.deepEqual(r.columnasSinPaleta, sin ? [w.nombre] : [], caso);
          assert.deepEqual(r.cambian, sin ? [] : [w.nombre], caso);
        }
      }
    }
  }
  // Ni vacío en un sentido ni en el otro: el caso existe y no es todo.
  assert.ok(sinPaleta > 0, 'ningún caso sin paleta');
  assert.ok(conPaleta > 0, 'ningún caso con paleta');
});

test('los casos que se ven: Carbón, y «Oscura» fundida, sí; en la ventana encima, fundido no cuenta', () => {
  const columnas = c({ metodo: 'iframe', diseno: 'ligero' });
  const carbon = ww({ estilo: 'carbon' });
  const fundidaOscura = ww({ web: 'oscura', fundido: true });
  assert.equal(columnasSinPaleta(HORARIO, columnas, 'iframe', carbon, BASE), true);
  assert.equal(columnasSinPaleta(HORARIO, columnas, 'iframe', fundidaOscura, BASE), true);
  // En la ventana encima no se funde: Crema de día, con su paleta.
  assert.equal(columnasSinPaleta(HORARIO, c({ metodo: 'popup', diseno: 'ligero' }), 'popup', fundidaOscura, BASE), false);
  assert.equal(columnasSinPaleta(HORARIO, c({ metodo: 'popup', diseno: 'ligero' }), 'popup', carbon, BASE), true);
  // Día a día, o el calendario con horas: la paleta le llega entera.
  assert.equal(columnasSinPaleta(HORARIO, c({ metodo: 'iframe' }), 'iframe', carbon, BASE), false);
  assert.equal(columnasSinPaleta(HORARIO, c({ metodo: 'iframe', diseno: 'ligero', presentacion: 'semana' }), 'iframe', carbon, BASE), false);
  // Solo la letra: no hay paleta del estilo de su web que perder.
  assert.equal(columnasSinPaleta(HORARIO, columnas, 'iframe', ww({ letra: 'editorial' }), baseEstiloWeb('#343825', { estilo: 'carbon' })), false);
  // Con un diseño propio no le llega nada: eso es otra línea.
  assert.equal(columnasSinPaleta(HORARIO, c({ metodo: 'iframe', diseno: 'ligero', identidad: 'propia', forma: 'recto' }), 'iframe', carbon, BASE), false);

  const r = piezasAfectadas(datos({ horario: columnas, planes: c({ metodo: 'iframe' }) }, null, { estilo: carbon }));
  assert.deepEqual(r, { ...VACIO, cambian: ['Planes y precios'], columnasSinPaleta: ['Horario y reservas'] });
  // Mientras carga el estilo (sin base) no se puede saber: nadie enseña la confirmación así.
  assert.deepEqual(piezasAfectadas(datos({ horario: columnas }, null, { estilo: carbon, base: null })).cambian, ['Horario y reservas']);
});

// ── Fase D: el botón que abre la ventana ────────────────────────────────────

test('el botón de la ventana: sigue el estilo si se copió leyendo sus variables; si no, es de un código anterior', () => {
  const popup = c({ metodo: 'popup' });
  const sinMarca = datos({ horario: popup, planes: popup }, null, { estilo: BOTON_NUEVO });
  const conMarca: DatosAfectados = {
    ...sinMarca, copiados: { ...sinMarca.copiados, planes: { ...sinMarca.copiados.planes, botonVivo: true } },
  };
  const r = piezasAfectadas(conMarca);
  assert.deepEqual(r.botonesVivos, ['Planes y precios']);
  assert.deepEqual(r.botonesCongelados, ['Horario y reservas']);
  // Lo de dentro de la ventana cambia en los dos.
  assert.deepEqual(r.cambian, ['Horario y reservas', 'Planes y precios']);
  assert.deepEqual(piezasAfectadas(sinMarca).botonesCongelados, ['Horario y reservas', 'Planes y precios']);
});

test('el botón de la ventana: con diseño propio, cambiado después de copiarlo o fuera del popup, en ninguna de las dos', () => {
  // Diseño propio: esa línea ya dice que no cambia.
  const propio = c({ metodo: 'popup', identidad: 'propia', marca: '#E11D48' });
  const d = datos({ horario: propio }, null, { estilo: BOTON_NUEVO });
  assert.deepEqual(piezasAfectadas({ ...d, copiados: { horario: { ...d.copiados.horario, botonVivo: true } } }), VACIO);
  assert.deepEqual(piezasAfectadas(d), VACIO);
  // Otra huella: no sabemos qué hay pegado.
  const otra = piezasAfectadas(datos({ horario: c({ metodo: 'popup' }) }, null, {
    copiados: { horario: { firma: 'huella', en: '2026-09-28T10:00:00.000Z', botonVivo: true } }, estilo: BOTON_NUEVO,
  }));
  assert.deepEqual(otra, VACIO);
  // Dentro de una página no hay botón que abra nada.
  const iframe = datos({ horario: c({ metodo: 'iframe' }) }, null, { estilo: BOTON_NUEVO });
  const r = piezasAfectadas({ ...iframe, copiados: { horario: { ...iframe.copiados.horario, botonVivo: true } } });
  assert.deepEqual([r.botonesVivos, r.botonesCongelados], [[], []]);
});

test('⚠️ el botón de la ventana: si este estilo no cambia cómo se ve (solo la letra), ninguna de las dos líneas habla de él', () => {
  const popup = c({ metodo: 'popup' });
  const sinMarca = datos({ horario: popup, planes: popup }, null, { estilo: ww({ letra: 'editorial' }) });
  const conMarca: DatosAfectados = {
    ...sinMarca, copiados: { ...sinMarca.copiados, planes: { ...sinMarca.copiados.planes, botonVivo: true } },
  };
  const r = piezasAfectadas(conMarca);
  // Lo de dentro de la ventana sí cambia: la letra.
  assert.deepEqual(r.cambian, ['Horario y reservas', 'Planes y precios']);
  assert.deepEqual([r.botonesVivos, r.botonesCongelados], [[], []]);
  // Lo mismo si el botón ya se veía así en su web: se compara con lo PUBLICADO.
  const tinta = ww({ boton: 'tinta' });
  const r2 = piezasAfectadas({ ...conMarca, publicado: tinta, estilo: { ...tinta, letra: 'editorial' } });
  assert.deepEqual([r2.botonesVivos, r2.botonesCongelados], [[], []]);
  // «Tu color tal cual» que se ve igual que el de por defecto: por valor, no hay cambio.
  const r3 = piezasAfectadas({ ...conMarca, estilo: ww({ boton: 'fiel' }) });
  assert.deepEqual([r3.botonesVivos, r3.botonesCongelados], [[], []]);
});

test('el botón de la ventana: si este estilo cambia el color de los botones, sí salen las dos líneas', () => {
  const popup = c({ metodo: 'popup' });
  const sinMarca = datos({ horario: popup, planes: popup }, null, { estilo: ww({ boton: 'tinta' }) });
  const r = piezasAfectadas({
    ...sinMarca, copiados: { ...sinMarca.copiados, planes: { ...sinMarca.copiados.planes, botonVivo: true } },
  });
  assert.deepEqual(r.botonesVivos, ['Planes y precios']);
  assert.deepEqual(r.botonesCongelados, ['Horario y reservas']);
  // Y al volver de ese color a nada elegido, también: el botón se ve distinto.
  const vuelta = piezasAfectadas({ ...sinMarca, estilo: null, publicado: ww({ boton: 'tinta' }) });
  assert.deepEqual(vuelta.botonesCongelados, ['Horario y reservas', 'Planes y precios']);
  // Sin base (cargando) no se sabe cómo se ve: no se afirma nada del botón.
  assert.deepEqual(piezasAfectadas({ ...sinMarca, base: null }).botonesCongelados, []);
});
