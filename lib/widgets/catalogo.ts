// Tentare Widgets — el catálogo.
//
// UNA entrada por widget y nada más: qué es, en qué categoría vive, qué vista
// del motor pinta, cómo se puede integrar y qué ajustes de contenido tienen
// sentido para él. El constructor del panel (components/widgets/*) y el
// generador de código (./integracion.ts) se montan leyendo esto — añadir un
// widget es añadir una entrada aquí, no una pantalla nueva.
//
// ⚠️ Un widget NO es una página nueva ni un motor nuevo. Los disponibles son
// vistas del motor que ya reserva y cobra de verdad: `/reservar/[slug]` en
// modo incrustado (Modo A, iframe) y, para el horario, `public/widget.js`
// (Modo B, Shadow DOM). Ver app/reservar/[slug]/page.tsx y
// app/widget-bundle/main.tsx.
//
// ⚠️ «Calendario embebido» dejó de ser un widget: era el MISMO horario con
// otra forma de meterlo en la web. Ahora es el método `nativa` del horario.
// Y «Reserva esta clase», «Mis reservas» y «Calendario embebido» siguen
// leyéndose de lo guardado con sus ids viejos (`legado`).
//
// Los que están `en-preparacion` se declaran igual para que la arquitectura
// esté lista, pero NO generan código ni tienen ajustes: un widget que no hace
// nada de verdad es peor que no tenerlo. `falta` dice qué pieza del producto
// no existe todavía — sin prometer fecha.
//
// Sin imports de React ni de Next: lo leen tests de `node --test`.

import type { TipoPlan } from '../types.ts';

export type CategoriaWidget = 'reservas' | 'venta' | 'captacion' | 'estudio' | 'contenido';

export const CATEGORIAS: readonly { id: CategoriaWidget; nombre: string }[] = [
  { id: 'reservas', nombre: 'Reservas' },
  { id: 'venta', nombre: 'Venta' },
  { id: 'captacion', nombre: 'Captación' },
  { id: 'estudio', nombre: 'Estudio' },
  { id: 'contenido', nombre: 'Contenido' },
];

/**
 * Cómo entra el widget en la web del estudio.
 * - `iframe`: el recuadro incrustado de siempre, con auto-alto. El que funciona
 *   en cualquier web sin configurar nada.
 * - `nativa`: el bundle en Shadow DOM, sin marco (solo el horario, y solo con
 *   el dominio autorizado — CORS explícito por estudio).
 * - `popup`: un botón de la web que abre el widget en una ventana encima.
 * - `boton`: un botón que lleva a la página de reservas. Cero JavaScript.
 * - `enlace`: la dirección tal cual, para la bio de Instagram, un newsletter o
 *   WhatsApp.
 */
export type MetodoIntegracion = 'iframe' | 'nativa' | 'popup' | 'boton' | 'enlace';

export const METODOS: Record<MetodoIntegracion, { nombre: string; descripcion: string }> = {
  iframe: { nombre: 'Incrustado', descripcion: 'Dentro de una página de tu web, a su medida.' },
  nativa: { nombre: 'Integración nativa', descripcion: 'Sin marco: toma el espacio de tu web como si fuera suyo.' },
  popup: { nombre: 'Popup', descripcion: 'Un botón de tu web que lo abre en una ventana.' },
  boton: { nombre: 'Botón', descripcion: 'Un botón que lleva a tu página de reservas.' },
  enlace: { nombre: 'Enlace', descripcion: 'Para Instagram, un newsletter o WhatsApp.' },
};

/**
 * Ajustes de contenido que el widget honra DE VERDAD en el motor. Pintar un
 * control que el motor ignora es exactamente lo que no se hace aquí.
 * - `horario`: vista inicial, tipos/instructoras/salas, qué datos mostrar y la
 *   vista del horario (config-widget.ts).
 * - `sesion`: a qué clase concreta apunta.
 * - `cuentaInicio`: con qué abre «Mi cuenta».
 * - `tiposPlan`: qué se vende (cuotas, bonos, clase suelta).
 */
export type AjusteContenido = 'horario' | 'sesion' | 'cuentaInicio' | 'tiposPlan';

/** Una vista de `/reservar/[slug]`: la pestaña y los parámetros fijos. */
export interface VistaMotor {
  tab: 'clases' | 'citas' | 'misreservas' | 'cuenta' | 'estudio' | 'planes' | 'equipo';
  extra?: Readonly<Record<string, string>>;
}

/** Adónde lleva un enlace o un botón: la página de reservas COMPLETA. */
export interface VistaPagina {
  tab?: 'clases' | 'citas' | 'misreservas' | 'cuenta' | 'estudio';
  /** Ancla de una sección de la página (p. ej. los bonos). */
  ancla?: string;
}

interface Base {
  id: string;
  nombre: string;
  categoria: CategoriaWidget;
  descripcion: string;
  /** Nombre del icono de lucide-react (el panel lo traduce). */
  icono: string;
}

export interface WidgetDisponible extends Base {
  estado: 'disponible';
  /** La vista incrustada (iframe y popup). */
  embebido: VistaMotor;
  /** La vista a pantalla completa (enlace y botón). */
  pagina: VistaPagina;
  /** Métodos que admite, el primero es el recomendado. */
  metodos: readonly MetodoIntegracion[];
  contenido: readonly AjusteContenido[];
  /** Alto inicial del iframe hasta que llega la medida real. */
  alto: number;
  /** Ancho máximo del popup en px — un catálogo de planes se compara en fila. */
  anchoPopup: number;
  /** El texto del botón por defecto (botón y popup). */
  textoBoton: string;
  /** Ids con los que se guardó en `studios.widget_builder` antes del catálogo. */
  legado?: readonly string[];
  /** Solo vende estos tipos de plan (un preset sobre la misma vista). */
  tiposPlanFijos?: readonly TipoPlan[];
}

export interface WidgetEnPreparacion extends Base {
  estado: 'en-preparacion';
  /** La pieza del producto que falta, en una frase. */
  falta: string;
  /**
   * No se enseña en la biblioteca. Para los módulos congelados
   * (lib/frozen-features.ts): la estructura está lista, pero anunciarlos a la
   * propietaria contradice el propio congelado.
   */
  oculto?: boolean;
}

export type Widget = WidgetDisponible | WidgetEnPreparacion;

export const WIDGETS: readonly Widget[] = [
  // ── Reservas ─────────────────────────────────────────────────────────────
  {
    id: 'horario', estado: 'disponible', categoria: 'reservas', icono: 'CalendarDays',
    nombre: 'Horario y reservas',
    descripcion: 'Tu horario en vivo. Reservan y pagan sin salir de tu web.',
    embebido: { tab: 'clases' }, pagina: { tab: 'clases' },
    metodos: ['iframe', 'nativa', 'popup', 'boton', 'enlace'],
    contenido: ['horario'], alto: 640, anchoPopup: 720, textoBoton: 'Reservar clase',
    legado: ['clases', 'embed-script'],
  },
  {
    id: 'citas', estado: 'disponible', categoria: 'reservas', icono: 'Clock',
    nombre: 'Citas',
    descripcion: 'Servicios con hora concreta: valoraciones, sesiones 1 a 1…',
    embebido: { tab: 'citas' }, pagina: { tab: 'citas' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: [], alto: 640, anchoPopup: 640, textoBoton: 'Pedir cita',
    legado: ['citas'],
  },
  {
    id: 'cuenta', estado: 'disponible', categoria: 'reservas', icono: 'UserRound',
    nombre: 'Mi cuenta',
    descripcion: 'Sus reservas, sus bonos y su perfil, sin descargar nada.',
    embebido: { tab: 'misreservas', extra: { cuenta: 'completa' } }, pagina: { tab: 'misreservas' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: ['cuentaInicio'], alto: 560, anchoPopup: 560, textoBoton: 'Mi cuenta',
    legado: ['misreservas'],
  },
  {
    id: 'clase', estado: 'disponible', categoria: 'reservas', icono: 'CalendarCheck',
    nombre: 'Reserva una clase',
    descripcion: 'Directo a una clase concreta: para un post, una story o un newsletter.',
    embebido: { tab: 'clases' }, pagina: { tab: 'clases' },
    metodos: ['enlace', 'boton', 'popup', 'iframe'],
    contenido: ['sesion'], alto: 640, anchoPopup: 640, textoBoton: 'Reservar esta clase',
    legado: ['clase-concreta'],
  },

  // ── Venta ────────────────────────────────────────────────────────────────
  {
    id: 'planes', estado: 'disponible', categoria: 'venta', icono: 'BadgeEuro',
    nombre: 'Planes y precios',
    descripcion: 'Tus cuotas y bonos, comparables de un vistazo y con pago seguro.',
    embebido: { tab: 'planes' }, pagina: { ancla: 'bonos-membresias' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: ['tiposPlan'], alto: 520, anchoPopup: 960, textoBoton: 'Ver precios',
  },
  {
    id: 'bonos', estado: 'disponible', categoria: 'venta', icono: 'Ticket',
    nombre: 'Bonos y packs',
    descripcion: 'Solo tus bonos de clases, listos para comprar.',
    embebido: { tab: 'planes' }, pagina: { ancla: 'bonos-membresias' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: [], alto: 520, anchoPopup: 960, textoBoton: 'Comprar un bono',
    tiposPlanFijos: ['BONO'],
  },
  {
    id: 'regalo', estado: 'en-preparacion', categoria: 'venta', icono: 'Gift',
    nombre: 'Tarjetas regalo',
    descripcion: 'Que regalen clases a otra persona.',
    falta: 'Tentare todavía no emite tarjetas regalo.',
  },
  {
    id: 'tienda', estado: 'en-preparacion', categoria: 'venta', icono: 'ShoppingBag',
    nombre: 'Tienda',
    descripcion: 'Los productos de tu estudio, a la venta online.',
    falta: 'Los productos de tu caja aún no se pueden comprar online.',
  },

  // ── Captación ────────────────────────────────────────────────────────────
  {
    id: 'prueba', estado: 'en-preparacion', categoria: 'captacion', icono: 'Sparkles',
    nombre: 'Clase de prueba',
    descripcion: 'Convierte visitas en su primera clase.',
    falta: 'Necesita una tarifa de primera clase en tus planes.',
  },
  {
    id: 'contacto', estado: 'en-preparacion', categoria: 'captacion', icono: 'Mail',
    nombre: 'Formulario de contacto',
    descripcion: 'Consultas que llegan directas a tu panel.',
    falta: 'Necesita una bandeja de consultas en el panel.',
  },
  {
    id: 'newsletter', estado: 'en-preparacion', categoria: 'captacion', icono: 'Newspaper',
    nombre: 'Newsletter',
    descripcion: 'Suma suscriptoras a tu lista.',
    falta: 'Tentare todavía no envía newsletters.',
  },

  // ── Estudio ──────────────────────────────────────────────────────────────
  {
    id: 'estudio', estado: 'disponible', categoria: 'estudio', icono: 'Building2',
    nombre: 'El estudio',
    descripcion: 'Descripción, horario de apertura, clases y equipo.',
    embebido: { tab: 'estudio' }, pagina: { tab: 'estudio' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: [], alto: 480, anchoPopup: 760, textoBoton: 'Conoce el estudio',
    legado: ['estudio'],
  },
  {
    id: 'equipo', estado: 'disponible', categoria: 'estudio', icono: 'Users',
    nombre: 'Instructoras',
    descripcion: 'Tu equipo, con su foto y lo que imparte cada una.',
    embebido: { tab: 'equipo' }, pagina: { tab: 'estudio' },
    metodos: ['iframe', 'popup', 'boton', 'enlace'],
    contenido: [], alto: 360, anchoPopup: 760, textoBoton: 'Conoce al equipo',
  },
  {
    id: 'opiniones', estado: 'en-preparacion', categoria: 'estudio', icono: 'Star',
    nombre: 'Opiniones',
    descripcion: 'Lo que dicen tus alumnas.',
    falta: 'Las valoraciones son privadas: publicarlas necesita el permiso de cada alumna.',
  },

  // ── Contenido ────────────────────────────────────────────────────────────
  {
    id: 'eventos', estado: 'en-preparacion', categoria: 'contenido', icono: 'PartyPopper',
    nombre: 'Eventos y workshops',
    descripcion: 'Talleres y actividades especiales con inscripción.',
    falta: 'Necesita eventos con inscripción propia, aparte de las clases.',
  },
  {
    id: 'videoteca', estado: 'en-preparacion', categoria: 'contenido', icono: 'Clapperboard',
    nombre: 'Videoteca',
    descripcion: 'Tus vídeos online.',
    falta: 'El módulo de vídeos está congelado.',
    oculto: true,
  },
];

export function widgetPorId(id: string): Widget | undefined {
  return WIDGETS.find(w => w.id === id);
}

export function esDisponible(w: Widget | undefined): w is WidgetDisponible {
  return w?.estado === 'disponible';
}

/** Los que se enseñan en la biblioteca, en el orden del catálogo. */
export function widgetsVisibles(): Widget[] {
  return WIDGETS.filter(w => !(w.estado === 'en-preparacion' && w.oculto));
}

/** El método recomendado: el primero de su lista. */
export function metodoRecomendado(w: WidgetDisponible): MetodoIntegracion {
  return w.metodos[0];
}
