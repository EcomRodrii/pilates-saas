// «Lo que tienes en tu web» (Fase C del constructor, 28-sep-2026): qué dice la
// portada de cada pieza copiada. Reglas puras —sin React ni Supabase— para
// probarlas con `node --test`; la pantalla es components/widgets/lo-que-tienes.tsx.
//
// Dos preguntas distintas, con dos fuentes distintas:
//  - ¿Cambió algo AQUÍ después de copiarlo? Sale de lo guardado al copiar
//    (`copiado.config`, la foto) contra lo de ahora: `gruposCambiados`.
//  - ¿Qué se ve en SU WEB? Sale de lo que /reservar cuenta al cargar dentro de
//    su web (`widget_vistos()`): `estadoEnTuWeb`.
// Cuando las dos hablan de lo mismo, manda lo que se ve: si su web ya enseña la
// versión de ahora (la pegó a mano, sin copiar desde aquí), el aviso de «tu web
// sigue con lo de antes» sería falso en lo que la página ve.
//
// ⚠️ Lo que NUNCA se dice (ver el diseño de la Fase C, §6): «instalado», «no
// está instalado» ni «funciona»; que su web está desactualizada sin decir
// cuándo lo vimos; «Visto en…» de un botón o un enlace; «Aún no lo vemos» si la
// consulta falló o su rol no puede leerla (la RLS le devuelve `[]` a
// recepción, que no es «nada»); ni la ruta de la página. No verlo no es lo
// mismo que no estar: una web con `no-referrer`, o una pieza que aún no ha
// abierto nadie, tampoco se ve.

import { relativo } from '../student/formato.ts';
import { normalizarOrigenWidget } from '../widget/dominios-autorizados.ts';
import type { MetodoIntegracion } from './catalogo.ts';
import { claveDeCopia, etiquetaEfectiva, type ConfigConstructor, type Copiado } from './config.ts';
import type { EmbudoWidget } from './embudo.ts';
import { VERSION_FIRMA } from './firma-contenido.ts';
import { firmaCodigo, firmaContenidoDe, tieneDisenoEnCodigo, type EntradaIntegracion } from './integracion.ts';
import { claveVista, formaDeMetodo, type FormaPegada, type VistoWidget } from './pegado.ts';
import { origenesConYSinWww } from './recetas.ts';

// ── ¿Qué cambió después de copiarlo? ─────────────────────────────────────────

/**
 * Los ajustes de una pieza, por lo que ella entiende que ha cambiado. Cada
 * clave de `ConfigConstructor` está en UN grupo (salvo `metodo`, que se
 * compara aparte como «dónde va»): lo vigila un test, para que un ajuste nuevo
 * no se quede sin nombre en el aviso.
 */
export const GRUPOS: readonly { nombre: string; campos: (keyof ConfigConstructor)[] }[] = [
  { nombre: 'qué clases salen', campos: ['tipos', 'instructoras', 'salas'] },
  { nombre: 'qué se ve de cada clase', campos: ['mostrarPrecio', 'mostrarNivel', 'mostrarSustituta'] },
  { nombre: 'cómo se ordena', campos: ['vista', 'presentacion', 'diseno'] },
  { nombre: 'qué clase', campos: ['sesion'] },
  { nombre: 'con qué se abre', campos: ['cuentaInicio'] },
  { nombre: 'qué planes salen', campos: ['tiposPlan'] },
  { nombre: 'su diseño propio', campos: ['identidad', 'tema', 'fondo', 'marca', 'tinta', 'superficie', 'linea', 'forma', 'densidad', 'fuente', 'fuenteDisplay'] },
  { nombre: 'el ancho', campos: ['ancho'] },
  { nombre: 'cómo carga', campos: ['cargaDiferida'] },
  { nombre: 'el botón', campos: ['textoBoton', 'estiloBoton', 'abrirEn'] },
  { nombre: 'el pie', campos: ['mostrarPie'] },
  { nombre: 'su etiqueta', campos: ['etiqueta'] },
];

/**
 * Qué grupos cambiaron entre lo copiado (`foto`) y lo de ahora (`base`).
 *
 * Un grupo cambia si el código de la foto con ESE grupo tomado de ahora deja de
 * ser el de la foto (`firmaCodigo`). Las dos huellas salen de la misma
 * plantilla de hoy, así que un cambio en la plantilla de Tentare (el alto del
 * iframe, su script) nunca cuenta como un cambio suyo.
 *
 * `seVe`: el cambio llega a lo que la página entiende (`firmaContenidoDe`). Un
 * ancho, la carga diferida o el texto del botón van en el código pero la página
 * no los ve: aunque su web enseñe la versión de ahora, eso no lo demuestra.
 *
 * Si la forma de ahora no es la que se copió, «dónde va» va delante.
 */
export function gruposCambiados(
  foto: ConfigConstructor,
  base: EntradaIntegracion,
  metodoCopiado: MetodoIntegracion,
  metodoAhora: MetodoIntegracion,
): { nombre: string; seVe: boolean }[] {
  const deFoto: EntradaIntegracion = { ...base, config: foto };
  const firmaFoto = firmaCodigo(deFoto, metodoAhora);
  const contenidoFoto = firmaContenidoDe(deFoto, metodoAhora);
  const out: { nombre: string; seVe: boolean }[] = [];
  if (metodoCopiado !== metodoAhora) {
    out.push({ nombre: 'dónde va', seVe: formaDeMetodo(metodoCopiado) !== formaDeMetodo(metodoAhora) });
  }
  for (const g of GRUPOS) {
    const hibrido: Record<string, unknown> = { ...foto };
    for (const k of g.campos) hibrido[k] = base.config[k];
    const e: EntradaIntegracion = { ...base, config: hibrido as unknown as ConfigConstructor };
    if (firmaCodigo(e, metodoAhora) === firmaFoto) continue;
    out.push({ nombre: g.nombre, seVe: firmaContenidoDe(e, metodoAhora) !== contenidoFoto });
  }
  return out;
}

/** «a», «a y b», «a, b y c». */
export function unirGrupos(nombres: readonly string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? '';
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

/**
 * El aviso ámbar de una pieza. `null` = qué cambió no se sabe: la copia es de
 * antes de la Fase C (sin foto) y solo se sabe QUE cambió.
 */
export function textoCambios(nombres: readonly string[] | null): string {
  return nombres && nombres.length
    ? `Lo cambiaste después de copiarlo (${unirGrupos(nombres)}): tu web sigue con lo de antes.`
    : 'Lo cambiaste después de copiarlo: tu web sigue con lo de antes.';
}

// ── ¿Qué se ve en su web? ────────────────────────────────────────────────────

/**
 * Cuánto dura «esta semana»: lo visto hace más no dice nada de la versión de
 * hoy (la purga guarda 13 meses, y una web que ya no lo tiene seguiría ahí).
 */
export const VENTANA_VERSION_MS = 7 * 24 * 3600_000;
/**
 * El margen tras ver la versión de ahora en el que otra versión todavía no
 * cuenta como «viva»: una pestaña abierta desde antes de pegar, o la caché de
 * su web, la siguen enseñando un rato.
 */
export const MARGEN_MISMA_VERSION_MS = 3600_000;

export type Version = 'al-dia' | 'anterior' | 'distinta' | 'dos-versiones';

export type EstadoEnTuWeb =
  | { tipo: 'oculto' }
  | { tipo: 'no-medible' }
  | { tipo: 'sin-ver'; forma: FormaPegada }
  | { tipo: 'sin-dato' }
  | {
    tipo: 'visto';
    forma: FormaPegada;
    anfitrion: string | null;
    ultimo: string;
    /** Otras webs, sin contar la de `anfitrion` ni las que no dicen su dirección. */
    otrasWebs: number;
    version: Version | null;
    /** La otra versión que se ve (con `anterior`, `distinta` y `dos-versiones`). */
    laOtra?: { anfitrion: string | null; ultimo: string };
  };

const ms = (iso: string) => Date.parse(iso);
const masReciente = (a: VistoWidget, b: VistoWidget) => (ms(b.ultimo) > ms(a.ultimo) ? b : a);

/**
 * La versión que enseña su web, con las filas de esta pieza EN LA FORMA
 * COPIADA. `null` si no hay con qué decirlo (sin versión de ahora que
 * comparar, o nada con firma esta semana).
 *
 * ⚠️ Solo esa forma: la misma pieza puede estar pegada a propósito dentro de
 * una página y, en otra, como botón que se abre encima (el iframe y el popup
 * cargan la misma URL, y llevan la misma etiqueta). Eso no son «dos
 * versiones» de lo copiado: son dos cosas pegadas, y compararlas entre sí
 * daría un aviso perpetuo que ningún código nuevo arregla.
 */
function versionVista(
  filas: readonly VistoWidget[],
  forma: FormaPegada,
  claveAhora: string | null,
  conocidas: readonly string[],
  ahora: number,
): { version: Version; laOtra?: { anfitrion: string | null; ultimo: string } } | null {
  if (!claveAhora) return null;
  const recientes = filas.filter(f =>
    f.forma === forma && f.firma && f.firma.startsWith(VERSION_FIRMA) && ahora - ms(f.ultimo) <= VENTANA_VERSION_MS);
  if (!recientes.length) return null;
  const clave = (f: VistoWidget) => claveVista(f.forma, f.firma!);
  const actual = recientes.filter(f => clave(f) === claveAhora);
  const desde = actual.length ? Math.min(...actual.map(f => ms(f.primero))) : null;
  // De cada otra versión, su fila más reciente.
  const otras = new Map<string, VistoWidget>();
  for (const f of recientes) {
    const k = clave(f);
    if (k === claveAhora) continue;
    const antes = otras.get(k);
    otras.set(k, antes ? masReciente(antes, f) : f);
  }
  const vivas = [...otras].filter(([, f]) => desde === null || ms(f.ultimo) > desde + MARGEN_MISMA_VERSION_MS);
  if (!vivas.length) return { version: 'al-dia' };
  const [claveOtra, otra] = vivas.reduce((a, b) => (ms(b[1].ultimo) > ms(a[1].ultimo) ? b : a));
  const laOtra = { anfitrion: otra.anfitrion, ultimo: otra.ultimo };
  if (actual.length) return { version: 'dos-versiones', laOtra };
  // «Anterior» solo si la copió desde aquí alguna vez: si no, no lo sabemos.
  return { version: conocidas.includes(claveOtra) ? 'anterior' : 'distinta', laOtra };
}

/**
 * Qué se dice de una pieza en su web. En orden:
 *  1. `oculto`: sin permiso de resultados, cargando o con error (`vistos`
 *     `undefined`/`null`), sin `ahora`, sin saber qué forma se copió, o sin
 *     `etiquetas` (se copió sin etiqueta: `widget_vistos()` descarta las
 *     cargas sin `origen`, así que nunca se podrá ver y «Aún no lo vemos»
 *     sería mentira para siempre).
 *  2. `no-medible`: un botón o un enlace (no se mide de dónde llegan, a propósito).
 *  3. Las filas de su etiqueta (la copiada y la de ahora). Sin filas: `sin-dato`
 *     si este mes tuvo visitas, y si no `sin-ver`.
 *  4. `visto`, con la fila más reciente de la forma copiada (si no hay, la más
 *     reciente de todas). La versión, solo si no hay ámbar (el ámbar ya dice
 *     que su web sigue con lo de antes), y solo entre filas de esa forma.
 */
export function estadoEnTuWeb(x: {
  metodoCopiado: MetodoIntegracion | null;
  etiquetas: readonly string[];
  claveAhora: string | null;
  conocidas: readonly string[];
  vistos: readonly VistoWidget[] | null | undefined;
  visitasMes: number | null;
  hayAmbar: boolean;
  ahora: number | null;
}): EstadoEnTuWeb {
  if (!x.vistos || x.ahora === null || !x.metodoCopiado || !x.etiquetas.length) return { tipo: 'oculto' };
  const forma = formaDeMetodo(x.metodoCopiado);
  if (!forma) return { tipo: 'no-medible' };
  const filas = x.vistos.filter(v => x.etiquetas.includes(v.origen));
  if (!filas.length) return (x.visitasMes ?? 0) > 0 ? { tipo: 'sin-dato' } : { tipo: 'sin-ver', forma };
  // Lo que se copió manda: su fila, si la hay, da la web y el momento.
  const deSuForma = filas.filter(f => f.forma === forma);
  const principal = (deSuForma.length ? deSuForma : filas).reduce(masReciente);
  const otrasWebs = new Set(filas.map(f => f.anfitrion).filter((a): a is string => !!a && a !== principal.anfitrion)).size;
  const v = x.hayAmbar ? null : versionVista(filas, forma, x.claveAhora, x.conocidas, x.ahora);
  return {
    tipo: 'visto', forma: principal.forma, anfitrion: principal.anfitrion, ultimo: principal.ultimo, otrasWebs,
    version: v?.version ?? null,
    ...(v?.laOtra ? { laOtra: v.laOtra } : {}),
  };
}

/** El host, sin esquema. Se enseña como TEXTO, nunca como enlace. */
export function hostDe(origen: string): string {
  try {
    return new URL(origen).host;
  } catch {
    return origen;
  }
}

/** Las frases de una pieza: la de su web y, si toca, la de la versión que enseña. */
export function textosEnTuWeb(e: EstadoEnTuWeb, ahora: number): { linea: string | null; version: string | null } {
  const hace = (iso: string) => relativo(iso, new Date(ahora));
  switch (e.tipo) {
    case 'oculto':
      return { linea: null, version: null };
    case 'no-medible':
      return { linea: 'De un botón o un enlace no vemos desde dónde llegan, solo cuántas visitas: las tienes en los resultados del mes.', version: null };
    case 'sin-dato':
      return { linea: 'Este mes ha tenido visitas, pero aún no sabemos desde qué web. Lo sabremos la próxima vez que alguien lo abra.', version: null };
    case 'sin-ver':
      return {
        linea: e.forma === 'ventana'
          ? 'Aún no lo ha abierto nadie desde tu web. Cuando alguien pulse el botón, aparecerá aquí.'
          : 'Aún no lo vemos en tu web. Cuando alguien abra la página donde lo pegaste, aparecerá aquí.',
        version: null,
      };
    case 'visto': {
      const verbo = e.forma === 'ventana' ? 'Abierto' : 'Visto';
      const mas = e.otrasWebs === 0 ? '' : e.otrasWebs === 1 ? ' y en otra web más' : ` y en ${e.otrasWebs} webs más`;
      const linea = e.anfitrion
        ? `${verbo} en ${hostDe(e.anfitrion)} ${hace(e.ultimo)}${mas}`
        : `${verbo} ${hace(e.ultimo)} en una web que no nos dice su dirección`;
      if (!e.version || e.version === 'al-dia' || !e.laOtra) return { linea, version: null };
      const cuando = hace(e.laOtra.ultimo);
      const donde = e.laOtra.anfitrion ? `, en ${hostDe(e.laOtra.anfitrion)}` : '';
      const version = e.version === 'anterior'
        ? `La última vez que lo vimos (${cuando}${donde}), tu web tenía una versión anterior. Pega el código de ahora en lugar del que hay; cuando alguien lo abra, cambiará aquí.`
        : e.version === 'distinta'
          ? `La última vez que lo vimos (${cuando}${donde}), tu web tenía una versión distinta de la de aquí. Si nadie la cambió a mano, pega el código de ahora en lugar del que hay.`
          : `Esta semana tu web ha enseñado dos versiones: la de ahora y otra distinta (la última vez ${cuando}${donde}). Si lo pegaste en varias páginas, cambia el código también en las demás.`;
      return { linea, version };
    }
  }
}

// ── Una pieza copiada, entera ────────────────────────────────────────────────

/**
 * Las etiquetas con las que se busca lo visto de una pieza: la copiada (la que
 * lleva lo que hay en su web) y la de ahora (si la cambió y pegó el código
 * nuevo sin copiarlo desde aquí, su web ya lleva esa). Son las que pide el
 * panel a `widget_vistos()`.
 *
 * Vacío si se copió SIN etiqueta («Nombre para tus estadísticas» en blanco):
 * `widget_vistos()` descarta las cargas sin `origen`, así que lo pegado así no
 * se puede ver nunca, ni siquiera con la etiqueta de ahora.
 */
export function etiquetasDeCopia(copia: Copiado, base: EntradaIntegracion): string[] {
  const copiada = etiquetaEfectiva(copia.config ?? base.config, base.widget);
  if (!copiada) return [];
  const deAhora = etiquetaEfectiva(base.config, base.widget);
  return deAhora && deAhora !== copiada ? [copiada, deAhora] : [copiada];
}

export interface PiezaCopiada {
  /** La forma que se copió, o `null` si no se sabe (una copia de antes de la Fase C que ya no es lo de ahora). */
  metodo: MetodoIntegracion | null;
  /** Hay algo en el código de ahora que no está en lo copiado. */
  desfasado: boolean;
  /** Qué, si se sabe: `null` en una copia sin foto. */
  cambios: string[] | null;
  /** La etiqueta con la que se copió: la que mide el mes y lo visto. `null` = ninguna. */
  etiqueta: string | null;
  /** El mes de esa etiqueta; `null` si no ha cargado (o no se puede ver). */
  mes: EmbudoWidget | null;
  /** Lo pegado lleva su propio diseño en el código: el estilo de sus widgets no le llega. */
  disenoPropio: boolean;
  /**
   * Fase D: un popup sin diseño propio copiado SIN la marca `botonVivo` (un
   * código anterior, o copiado desde un panel sin actualizar): su botón lleva
   * el color literal de cuando se copió y no sigue el estilo de sus widgets;
   * lo de dentro de la ventana, sí. Copiar el código de ahora lo arregla. Con
   * diseño propio no: ese botón no cambia nunca, a propósito.
   */
  botonCongelado: boolean;
  estado: EstadoEnTuWeb;
}

/**
 * Todo lo que la portada dice de una pieza copiada, y el `desfasado` que usan
 * también la cabecera, las tarjetas de «¿Qué quieres poner?» y «Ponlo en tu web»
 * (un mismo veredicto en toda la pantalla).
 *
 * - Con foto (`copia.config` y `copia.metodo`): qué cambió, por grupos. Y manda
 *   lo que se ve: si su web ya enseña la versión de ahora, los grupos que la
 *   página ve se dan por pegados; si no queda ninguno, no hay ámbar.
 * - Sin foto (copias de antes): la regla de siempre, con `firmaCodigo`. Si
 *   coincide con lo de ahora, lo copiado ES lo de ahora (su forma y su versión).
 *
 * `puedeGenerar`: sin código que dar (`faltaParaGenerar`) no hay «código nuevo»
 * que copiar, y no se avisa de nada. Tampoco hay versión de ahora con la que
 * comparar lo que enseña su web: ni «al día» ni «anterior».
 */
export function piezaCopiada(x: {
  copia: Copiado;
  /** Lo de ahora, con la configuración sin huérfanos. */
  base: EntradaIntegracion;
  metodoAhora: MetodoIntegracion;
  puedeGenerar: boolean;
  vistos: readonly VistoWidget[] | null | undefined;
  /**
   * Las etiquetas que se pidieron para `vistos` (se pide filtrado, ver
   * `etiquetasDeCopia`). Si no cubre las de esta pieza —las cambió después de
   * pedirlo—, lo leído no dice nada de ella y cuenta como sin leer. Sin esto,
   * todo lo de `vistos`.
   */
  leidas?: readonly string[];
  /**
   * Lo visto en su web se ha pedido y aún no ha llegado. Con foto, lo que se
   * ve puede quitar el ámbar: pintarlo ya y quitarlo al llegar sería decirle
   * algo y desdecirse, así que se espera. Sin permiso para verlo no se pide, y
   * el ámbar sale como siempre.
   */
  esperandoVistos?: boolean;
  /** El mes por etiqueta (`embudoPorWidget`), o `null` si no ha cargado. */
  mes: readonly EmbudoWidget[] | null;
  ahora: number | null;
}): PiezaCopiada {
  const { copia: k, base, metodoAhora } = x;
  const formaAhora = formaDeMetodo(metodoAhora);
  const contenidoAhora = x.puedeGenerar ? firmaContenidoDe(base, metodoAhora) : null;
  // Sin código de ahora no hay versión de ahora: «Reserva una clase» sin clase
  // elegida no es «otra versión» de lo que hay en su web.
  const claveAhora = formaAhora && contenidoAhora ? claveVista(formaAhora, contenidoAhora) : null;

  const foto = k.config && k.metodo ? { config: k.config, metodo: k.metodo } : null;
  const coincide = !foto && k.firma === firmaCodigo(base, metodoAhora);
  const metodo = foto ? foto.metodo : coincide ? metodoAhora : (k.metodo ?? null);
  const pegada = foto ? foto.config : coincide ? base.config : null;

  // La etiqueta con la que se COPIÓ (la foto, aunque no se sepa su forma): es
  // la que lleva lo que hay en su web.
  const etiquetas = etiquetasDeCopia(k, base);
  const etiqueta = etiquetas[0] ?? null;
  const mes = x.mes && etiqueta ? x.mes.find(r => r.etiqueta === etiqueta) ?? null : null;
  const leido = !x.leidas || etiquetas.every(e => x.leidas!.includes(e));
  const entrada = {
    metodoCopiado: metodo,
    etiquetas,
    claveAhora,
    conocidas: foto ? [claveDeCopia(k), ...(k.anteriores ?? [])].filter((c): c is string => !!c) : coincide && claveAhora ? [claveAhora] : [],
    vistos: leido ? x.vistos : undefined,
    // Sin etiqueta, sus visitas no se distinguen de las de otros códigos.
    visitasMes: x.mes && etiqueta ? (mes?.visitas ?? 0) : null,
    ahora: x.ahora,
  };

  let cambios: string[] | null = null;
  let desfasado: boolean;
  let estado: EstadoEnTuWeb;
  if (foto) {
    const grupos = x.puedeGenerar ? gruposCambiados(foto.config, base, foto.metodo, metodoAhora) : [];
    const sinAmbar = estadoEnTuWeb({ ...entrada, hayAmbar: false });
    if (x.esperandoVistos && grupos.some(g => g.seVe)) {
      // Lo que llegue puede quitar el ámbar (o cambiar su lista): se espera.
      // Si ningún cambio llega a la página, nada de lo que llegue lo quita, y
      // no hay por qué callarlo.
      cambios = [];
      desfasado = false;
      estado = sinAmbar;
    } else {
      const alDia = sinAmbar.tipo === 'visto' && sinAmbar.version === 'al-dia';
      const quedan = alDia ? grupos.filter(g => !g.seVe) : grupos;
      cambios = quedan.map(g => g.nombre);
      desfasado = quedan.length > 0;
      estado = desfasado ? estadoEnTuWeb({ ...entrada, hayAmbar: true }) : sinAmbar;
    }
  } else {
    desfasado = x.puedeGenerar && !coincide;
    estado = estadoEnTuWeb({ ...entrada, hayAmbar: desfasado });
  }

  const disenoPropio = (metodo === 'iframe' || metodo === 'popup') && !!pegada && tieneDisenoEnCodigo(pegada);
  return {
    metodo, desfasado, cambios, etiqueta, mes, estado, disenoPropio,
    botonCongelado: metodo === 'popup' && !disenoPropio && k.botonVivo !== true,
  };
}

/**
 * Sin marco, el widget solo carga en las webs autorizadas. Si la dirección de
 * su web (la que ELLA nos dio) no lo está —ni con ni sin «www»—, su host para
 * decírselo; si no, `null`. ⚠️ Nunca se ofrece autorizar una web que venga de
 * fuera (una cabecera `Origin` se falsifica): solo la suya.
 */
export function webSinAutorizar(direccion: string | null, dominios: readonly string[]): string | null {
  const origen = direccion ? normalizarOrigenWidget(direccion) : null;
  if (!origen) return null;
  return origenesConYSinWww(origen).some(o => dominios.includes(o)) ? null : hostDe(origen);
}
