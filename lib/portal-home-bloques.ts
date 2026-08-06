// ═══════════════════════════════════════════════════════════════════════════
// Constructor de bloques del portal (Theme Builder — Fase 1 de la
// generalización, sobre la Fase 3 del editor de temas)
// ═══════════════════════════════════════════════════════════════════════════
//
// Fase 3 construyó el constructor tipo Shopify Sections SOLO para el Inicio
// del portal: una lista ordenada de "bloques", donde los módulos de siempre
// son bloques `sistema` y se pueden AÑADIR bloques del catálogo
// (banner/texto/cta/faq) con su propia configuración.
//
// Esta fase generaliza ese MISMO modelo a Clases y Bonos, en vez de crear un
// sistema nuevo por pantalla: cada pantalla tiene su propia lista de bloques
// `sistema` (Home conserva sus 4 de siempre; Clases/Bonos tienen uno solo, su
// propio contenido funcional, que nunca se puede quitar del todo) más el
// mismo catálogo añadible, ya genérico, sin cambios.
//
// `PANTALLA_IDS`/`BLOQUES_SISTEMA_POR_PANTALLA` son la ÚNICA lista a tocar
// para dar de alta una pantalla nueva en el constructor de bloques — así una
// pantalla futura hereda el sistema añadiendo una entrada, no construyendo
// uno desde cero.
//
// Puro (sin zod, sin React) para poder usarse en el bundle de cliente sin
// arrastrar peso — mismo principio que layout-runtime.ts. La validación con
// zod vive en layout-schema.ts, que envuelve estos mismos tipos.

import { cumpleCondicion, defaultsDe, resolverConfig, type CampoSchema, type CondicionCampo, type ConfigDe } from './theme/campos.ts';

export const PANTALLA_IDS = ['home', 'clases', 'bonos'] as const;
export type PantallaId = (typeof PANTALLA_IDS)[number];

export const PANTALLA_LABEL: Record<PantallaId, string> = {
  home: 'Inicio',
  clases: 'Clases',
  bonos: 'Bonos',
};

export const BLOQUES_SISTEMA_IDS = [
  'estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'listadoClases', 'listadoBonos',
  // Tema "Oliva"/"Noir"/"Bloom" — ver lib/theme-definitions.ts (bloquesHome).
  // Ninguno aparece en un estudio que no los active a mano o instale uno de
  // esos temas: se añaden al FINAL de BLOQUES_SISTEMA_POR_PANTALLA.home, así
  // que no cambian el orden por defecto de nadie que ya tenga bloques guardados.
  'tiraSemana', 'progresoSemanal', 'retos',
] as const;
export type BloqueSistemaId = (typeof BLOQUES_SISTEMA_IDS)[number];


// Qué bloques `sistema` tiene cada pantalla, en su orden por defecto. Se
// pueden reordenar/ocultar como cualquier otro bloque, pero no eliminar: son
// el contenido funcional de la pantalla, no decorativo. `tiraSemana`/
// `progresoSemanal`/`retos` van OCULTOS por defecto (ver bloqueSistema() más
// abajo) — un estudio que no instale Oliva/Noir/Bloom ni los active a mano
// no los ve.
export const BLOQUES_SISTEMA_POR_PANTALLA: Record<PantallaId, readonly BloqueSistemaId[]> = {
  home: ['estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'tiraSemana', 'progresoSemanal', 'retos'],
  clases: ['listadoClases'],
  bonos: ['listadoBonos'],
};

// ── Schemas de campo ────────────────────────────────────────────────────────
// La forma de cada bloque se declara UNA vez y de ahí se derivan el tipo TS
// (abajo), el zod (lib/layout-schema.ts) y el formulario del editor. Las
// etiquetas y marcadores son EXACTAMENTE los de los formularios escritos a
// mano de hoy (components/theme/portal-bloques-editor.tsx) para que el panel
// generado salga idéntico.

export const CAMPOS_BANNER = [
  { tipo: 'imagen', id: 'imagenUrl', etiqueta: 'URL de la imagen', marcador: 'https://…', porDefecto: '' },
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: '' },
  { tipo: 'texto', id: 'texto', etiqueta: 'Texto', porDefecto: '' },
  { tipo: 'url', id: 'href', etiqueta: 'Enlace (opcional)', marcador: '/reservar o https://…', porDefecto: '' },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_TEXTO = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título (opcional)', porDefecto: '' },
  { tipo: 'textoLargo', id: 'texto', etiqueta: 'Texto', porDefecto: '' },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_CTA = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: '' },
  { tipo: 'texto', id: 'textoBoton', etiqueta: 'Texto del botón', porDefecto: '' },
  { tipo: 'url', id: 'href', etiqueta: 'Enlace', marcador: '/reservar o https://…', porDefecto: '' },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_FAQ = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título (opcional)', porDefecto: '' },
  {
    tipo: 'lista', id: 'preguntas', etiqueta: 'Preguntas',
    etiquetaElemento: 'pregunta', resumenCampo: 'pregunta', porDefecto: [],
    campos: [
      { tipo: 'texto', id: 'pregunta', etiqueta: 'Pregunta', marcador: 'Pregunta', porDefecto: '' },
      { tipo: 'textoLargo', id: 'respuesta', etiqueta: 'Respuesta', marcador: 'Respuesta', porDefecto: '', filas: 2 },
    ],
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_GALERIA = [
  {
    tipo: 'lista', id: 'imagenes', etiqueta: 'Imágenes',
    etiquetaElemento: 'imagen', resumenCampo: 'alt', porDefecto: [],
    campos: [
      { tipo: 'imagen', id: 'url', etiqueta: 'Imagen', marcador: 'https://…', porDefecto: '' },
      { tipo: 'texto', id: 'alt', etiqueta: 'Texto alternativo', marcador: 'Texto alternativo', porDefecto: '' },
    ],
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_VIDEO = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título (opcional)', porDefecto: '' },
  { tipo: 'url', id: 'url', etiqueta: 'URL de YouTube o Vimeo', marcador: 'https://youtube.com/watch?v=…', porDefecto: '' },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_TESTIMONIOS = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título (opcional)', porDefecto: '' },
  {
    tipo: 'lista', id: 'testimonios', etiqueta: 'Testimonios',
    etiquetaElemento: 'testimonio', resumenCampo: 'autor', porDefecto: [],
    campos: [
      { tipo: 'textoLargo', id: 'cita', etiqueta: 'Cita', marcador: 'Cita', porDefecto: '', filas: 2 },
      { tipo: 'texto', id: 'autor', etiqueta: 'Autora', marcador: 'Autora', porDefecto: '' },
      { tipo: 'texto', id: 'rol', etiqueta: 'Rol (opcional)', marcador: 'Rol (opcional)', porDefecto: '' },
    ],
  },
] as const satisfies readonly CampoSchema[];

// Los tipos de config se DERIVAN del schema. Antes eran interfaces escritas a
// mano, y eran una de las cuatro copias de la misma forma; ahora son la misma
// forma vista desde otro sitio. Los nombres exportados no cambian, así que
// ningún caller se entera.
export type BannerConfig = ConfigDe<typeof CAMPOS_BANNER>;
export type TextoConfig = ConfigDe<typeof CAMPOS_TEXTO>;
export type CtaConfig = ConfigDe<typeof CAMPOS_CTA>;
export type FaqConfig = ConfigDe<typeof CAMPOS_FAQ>;
export type GaleriaConfig = ConfigDe<typeof CAMPOS_GALERIA>;
export type VideoConfig = ConfigDe<typeof CAMPOS_VIDEO>;
export type TestimoniosConfig = ConfigDe<typeof CAMPOS_TESTIMONIOS>;

// Estilo PROPIO de una sección — pedido explícitamente por el usuario ("no es
// nada personalizable, tiene que ser un constructor totalmente libre"): antes
// solo existía el tema global (Ajustes), así que un banner y un CTA no podían
// distinguirse visualmente entre sí por mucho que el estudio quisiera. Cada
// bloque del CATÁLOGO (no los `sistema` — esos son UI de producto, no
// contenido de la propietaria) puede pisar el tema global para sí mismo.
// Todo opcional: sin `estilo`, el bloque se ve exactamente como antes
// (hereda del tema), así que temas ya guardados no cambian de aspecto solos.
//
// `tamanoTexto`/`esquinas`/`sombra` son enums que INDEXAN los tokens ya
// existentes en lib/portal-design.ts (mismo principio que `espaciado` con
// ESPACIADO_PADDING) — nunca un número libre nuevo, para no fragmentar la
// escala visual del resto del portal.
//
// ⚠️ **`estilo` es el único sitio donde "ausente" NO significa "el valor por
// defecto"** — significa "hereda del tema", que es un tercer estado. El render
// lo distingue de verdad: `estilo?.esquinas ? X : (estilo?.fondo ? radio.card
// : undefined)`. De ahí dos reglas que hay que respetar al generalizar:
//  · `EstiloBloque` es `Partial<>` a propósito: las claves siguen siendo
//    opcionales, no se vuelven obligatorias por venir de un schema.
//  · **Nunca pasar `estilo` por `resolverConfig()`.** Rellenar los defaults
//    ahí escribiría "redondeada"/"normal" en bloques que hoy heredan, y
//    cambiaría el aspecto de estudios reales sin que nadie tocara nada.
// El `porDefecto` de cada campo es sólo "qué opción sale marcada en el panel"
// — exactamente el `?? 'redondeada'` que hoy escribe a mano `EstiloForm` — y
// sólo se persiste cuando la propietaria pulsa.
export const CAMPOS_ESTILO = [
  { tipo: 'colorHeredado', id: 'fondo', etiqueta: 'Fondo', porDefecto: null },
  { tipo: 'colorHeredado', id: 'color', etiqueta: 'Texto', porDefecto: null },
  {
    tipo: 'opciones', id: 'alineacion', etiqueta: 'Alineación', porDefecto: 'izquierda',
    opciones: [
      { id: 'izquierda', label: 'Izquierda' }, { id: 'centro', label: 'Centro' }, { id: 'derecha', label: 'Derecha' },
    ],
  },
  {
    tipo: 'opciones', id: 'espaciado', etiqueta: 'Espaciado', porDefecto: 'normal',
    opciones: [
      { id: 'compacto', label: 'Compacto' }, { id: 'normal', label: 'Normal' }, { id: 'amplio', label: 'Amplio' },
    ],
  },
  {
    tipo: 'opciones', id: 'tamanoTexto', etiqueta: 'Tamaño del texto', porDefecto: 'normal',
    opciones: [
      { id: 'pequeno', label: 'Pequeño' }, { id: 'normal', label: 'Normal' }, { id: 'grande', label: 'Grande' },
    ],
  },
  {
    tipo: 'opciones', id: 'esquinas', etiqueta: 'Esquinas', porDefecto: 'redondeada',
    opciones: [
      { id: 'ninguna', label: 'Recta' }, { id: 'suave', label: 'Suave' }, { id: 'redondeada', label: 'Redonda' }, { id: 'pill', label: 'Cápsula' },
    ],
  },
  {
    tipo: 'opciones', id: 'sombra', etiqueta: 'Sombra', porDefecto: 'ninguna',
    opciones: [
      { id: 'ninguna', label: 'Ninguna' }, { id: 'suave', label: 'Suave' }, { id: 'marcada', label: 'Marcada' },
    ],
  },
  {
    tipo: 'opciones', id: 'ancho', etiqueta: 'Ancho', porDefecto: 'completo',
    opciones: [
      { id: 'completo', label: 'Completo' }, { id: 'contenido', label: 'Con margen' },
    ],
  },
] as const satisfies readonly CampoSchema[];

export type EstiloBloque = Partial<ConfigDe<typeof CAMPOS_ESTILO>>;

// `hijos` solo lo llevan los bloques del CATÁLOGO, y de UN nivel: un hijo no
// puede tener hijos a su vez. No es una limitación temporal, es una decisión:
//
//  · Los `sistema` no anidan porque `portal-home-view.tsx` los ordena con CSS
//    `order` dentro de UN solo contenedor flex, sin mover el DOM — los efectos
//    de scroll dependen de esa estructura. Un hijo tiene que vivir DENTRO del
//    subárbol de su padre, y `order` no cruza contenedores. Anidarlos exigiría
//    reestructurar ese fichero, que está vetado.
//  · Un solo nivel porque dos ya no se pueden enseñar en un rail de 272 px sin
//    que la sangría se coma el nombre, y porque el caso real —una sección con
//    columnas, un acordeón con items— se resuelve con uno.
//
// Aditivo y opcional: el jsonb de los estudios que ya existen no cambia de
// forma, y un bloque sin `hijos` se comporta exactamente igual que antes.
export type BloqueHome =
  // ⚠️ `config` es ADITIVA y opcional también aquí: un bloque de sistema
  // guardado antes de que existieran estos campos se lee igual que siempre,
  // porque `resolverConfig` rellena las claves ausentes con el texto de hoy.
  | { id: string; kind: 'sistema'; sistemaId: BloqueSistemaId; config?: Record<string, unknown>; oculto?: boolean }
  | { id: string; kind: 'banner'; config: BannerConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'texto'; config: TextoConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'cta'; config: CtaConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'faq'; config: FaqConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'galeria'; config: GaleriaConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'video'; config: VideoConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'testimonios'; config: TestimoniosConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] };

/**
 * Un hijo es un bloque del catálogo SIN `hijos` propios — el tipo es quien
 * impide el segundo nivel, no una comprobación en tiempo de ejecución que se
 * pueda olvidar en algún camino.
 */
export type BloqueHijo = Omit<Extract<BloqueHome, { kind: BloqueTipoCatalogo }>, 'hijos'>;

export type BloqueTipoCatalogo = Exclude<BloqueHome['kind'], 'sistema'>;

// ── Registro de bloques ─────────────────────────────────────────────────────
// La ÚNICA fuente de verdad de "qué bloques existen y qué sabe hacer cada
// uno". Antes esa información estaba repartida en cuatro sitios que había que
// mantener a mano y en sincronía: la interfaz de config, el zod, el
// formulario del editor y el render. Añadir un campo obligaba a tocar los
// cuatro, y olvidarse de uno no rompía la compilación — simplemente el campo
// no se guardaba, o no se pintaba, o se podaba en el siguiente guardado.
//
// Los `sistema` viven en el MISMO registro que los del catálogo, aunque no se
// puedan añadir ni configurar: el rail del editor, el render y el gate de
// publicar necesitan preguntar lo mismo de ambos ("¿cómo se llama?", "¿existe
// este kind?"), y tenerlos en dos tablas distintas es justo lo que obligaba a
// escribir un `if (kind === 'sistema')` en cada consumidor. Se distinguen por
// `origen`, no por vivir en otro sitio.
//
// Icono como NOMBRE de lucide-react (string, no el componente) para no meter
// React en este módulo puro — el editor resuelve el nombre a un icono real.
//
// ⚠️ Regla de retrocompatibilidad: `id` es lo que se persiste en el jsonb de
// cada estudio. **Nunca se renombra ni se borra una entrada** — renombrarla
// convierte los bloques guardados en `kind` desconocidos, y borrarla hace que
// el zod los pode en el siguiente guardado, perdiendo contenido escrito por
// la propietaria. Para retirar un bloque se le marca `obsoleto`, igual que a
// un campo.

/** Agrupa el picker de "Añadir sección". Solo aplica a `origen: 'catalogo'`. */
export type CategoriaBloque = 'texto' | 'multimedia' | 'interaccion';

export const CATEGORIA_BLOQUE_LABEL: Record<CategoriaBloque, string> = {
  texto: 'Texto',
  multimedia: 'Imagen y vídeo',
  interaccion: 'Interacción',
};

export interface DefinicionBloque {
  /** El `kind` persistido. Ver la regla de retrocompatibilidad de arriba. */
  id: BloqueTipoCatalogo | 'sistema';
  /** Para los `sistema`, cuál de ellos: la clave real dentro de la pantalla. */
  sistemaId?: BloqueSistemaId;
  /** Lo que la propietaria lee en el rail y en el picker. */
  nombre: string;
  /** Solo en el catálogo: la frase del picker. Un `sistema` no se añade. */
  descripcion?: string;
  icono: string;
  categoria?: CategoriaBloque;
  origen: 'catalogo' | 'sistema';
  campos: readonly CampoSchema[];
  /** Si admite `estilo` propio. Los `sistema` son UI de producto, no. */
  estilizable: boolean;
  /**
   * Qué bloques admite dentro y cuántos. Ausente = no admite ninguno, que es
   * el caso de los siete de hoy. Los `sistema` lo llevan siempre ausente.
   */
  hijos?: { admite: readonly BloqueTipoCatalogo[]; max?: number };
  /**
   * Cuándo el bloque tiene contenido suficiente para pintarse. Ausente =
   * siempre completo (es el caso de `banner`, que se pinta con o sin imagen).
   * La MISMA condición gobierna el `return null` del render y el gate de
   * "antes de publicar" del editor: antes eran dos listas escritas por
   * separado que podían contradecirse en silencio.
   */
  completoSi?: CondicionCampo;
}

/**
 * Clave del registro: el `kind` para el catálogo, el `sistemaId` para los
 * `sistema` (todos comparten `kind: 'sistema'`, así que el kind no los
 * distingue).
 */
export type ClaveBloque = BloqueTipoCatalogo | BloqueSistemaId;


// ─────────────────────────────────────────────────────────────────────────────
// Campos de los bloques del SISTEMA.
//
// Hasta ahora los nueve tenían `campos: []`, así que una propietaria abría el
// editor y solo podía reordenarlos y ocultarlos — y como el estado por defecto
// de las tres pantallas es 100 % bloques de sistema, eso era LO ÚNICO que
// podía hacer hasta que añadiera un bloque de catálogo. "No estoy editando un
// tema, solo estoy reordenando bloques" describía el producto con exactitud.
//
// ⚠️ **Cada `porDefecto` es LITERALMENTE el texto que hoy está escrito a fuego
// en el render.** Esa es la garantía de que abrir esto no cambia el portal de
// ningún estudio: sin config guardada, `resolverConfig` devuelve exactamente
// lo que se pintaba antes. Si algún día se cambia un texto en el render, hay
// que cambiarlo aquí — hay un test que lo fija.
//
// Lo que NO se expone: nada que el render no honre. Un campo que no mueva
// nada es peor que su ausencia, porque la propietaria lo toca y no pasa nada.

export const CAMPOS_ESTA_SEMANA = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: 'Esta semana', maxLargo: 40 },
  {
    tipo: 'texto', id: 'enlaceTexto', etiqueta: 'Enlace de la derecha',
    porDefecto: 'Agenda →', maxLargo: 24,
    ayuda: 'Lleva al calendario de clases.',
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_ACCESOS_RAPIDOS = [
  {
    tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: '', maxLargo: 40,
    ayuda: 'Déjalo vacío para que la sección no lleve rótulo.',
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_INVITAR_AMIGA = [
  { tipo: 'texto', id: 'antetitulo', etiqueta: 'Texto pequeño de arriba', porDefecto: 'Trae a quien quieras', maxLargo: 40 },
  { tipo: 'texto', id: 'titulo', etiqueta: 'Titular', porDefecto: 'La calma se comparte mejor.', maxLargo: 70 },
  { tipo: 'texto', id: 'subtitulo', etiqueta: 'Texto de apoyo', porDefecto: 'Invita a una amiga y ganáis las dos', maxLargo: 80 },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_CONTENIDO_ESTUDIO = [] as const satisfies readonly CampoSchema[];

export const REGISTRO_BLOQUES: Record<ClaveBloque, DefinicionBloque> = {
  banner: {
    id: 'banner', nombre: 'Banner', icono: 'Image', origen: 'catalogo',
    categoria: 'multimedia', estilizable: true, campos: CAMPOS_BANNER,
    // Sin `completoSi`: un banner se pinta con o sin imagen y sin enlace.
    descripcion: 'Imagen a todo lo ancho con título, texto y enlace opcional.',
  },
  texto: {
    id: 'texto', nombre: 'Texto', icono: 'Type', origen: 'catalogo',
    categoria: 'texto', estilizable: true, campos: CAMPOS_TEXTO,
    completoSi: { alguna: [{ campo: 'titulo', noVacio: true }, { campo: 'texto', noVacio: true }] },
    descripcion: 'Un bloque de texto libre, con título opcional.',
  },
  cta: {
    id: 'cta', nombre: 'Llamada a la acción', icono: 'MousePointerClick', origen: 'catalogo',
    categoria: 'interaccion', estilizable: true, campos: CAMPOS_CTA,
    completoSi: { todas: [{ campo: 'href', valido: 'href' }, { campo: 'textoBoton', noVacio: true }] },
    descripcion: 'Título y un botón que lleva a donde quieras.',
  },
  faq: {
    id: 'faq', nombre: 'Preguntas frecuentes', icono: 'HelpCircle', origen: 'catalogo',
    categoria: 'texto', estilizable: true, campos: CAMPOS_FAQ,
    completoSi: { campo: 'preguntas', minimo: 1 },
    descripcion: 'Lista de preguntas y respuestas, plegable.',
  },
  galeria: {
    id: 'galeria', nombre: 'Galería de imágenes', icono: 'GalleryHorizontal', origen: 'catalogo',
    categoria: 'multimedia', estilizable: true, campos: CAMPOS_GALERIA,
    completoSi: { campo: 'imagenes', minimo: 1 },
    descripcion: 'Varias imágenes en un carrusel horizontal.',
  },
  video: {
    id: 'video', nombre: 'Vídeo', icono: 'Video', origen: 'catalogo',
    categoria: 'multimedia', estilizable: true, campos: CAMPOS_VIDEO,
    completoSi: { campo: 'url', valido: 'videoEmbed' },
    descripcion: 'Un vídeo embebido de YouTube o Vimeo.',
  },
  testimonios: {
    id: 'testimonios', nombre: 'Testimonios', icono: 'Quote', origen: 'catalogo',
    categoria: 'texto', estilizable: true, campos: CAMPOS_TESTIMONIOS,
    completoSi: { campo: 'testimonios', minimo: 1 },
    descripcion: 'Citas de socias, con autora y rol opcional.',
  },

  // Los `sistema`: contenido funcional del producto. Sin `campos` (lo que
  // muestran sale de los datos del estudio, no de un formulario), sin
  // `estilo` propio y sin `descripcion` de picker — no se pueden añadir, ya
  // existen siempre. Los `nombre` son los de siempre, con sus paréntesis
  // explicativos: describen lo que la propietaria ve en pantalla, y hay e2e
  // que buscan por ese texto exacto.
  estaSemana: {
    id: 'sistema', sistemaId: 'estaSemana', nombre: 'Esta semana',
    icono: 'CalendarDays', origen: 'sistema', estilizable: false, campos: CAMPOS_ESTA_SEMANA,
  },
  accesosRapidos: {
    id: 'sistema', sistemaId: 'accesosRapidos',
    nombre: 'Accesos rápidos (reservas, progreso, notificaciones, equipo)',
    icono: 'LayoutGrid', origen: 'sistema', estilizable: false, campos: CAMPOS_ACCESOS_RAPIDOS,
  },
  invitarAmiga: {
    id: 'sistema', sistemaId: 'invitarAmiga', nombre: 'Invita a una amiga',
    icono: 'UserPlus', origen: 'sistema', estilizable: false, campos: CAMPOS_INVITAR_AMIGA,
  },
  contenidoEstudio: {
    id: 'sistema', sistemaId: 'contenidoEstudio',
    nombre: 'Contenido del estudio (mensaje destacado y banners)',
    icono: 'Megaphone', origen: 'sistema', estilizable: false, campos: [],
  },
  listadoClases: {
    id: 'sistema', sistemaId: 'listadoClases', nombre: 'Calendario de clases',
    icono: 'CalendarRange', origen: 'sistema', estilizable: false, campos: [],
  },
  listadoBonos: {
    id: 'sistema', sistemaId: 'listadoBonos', nombre: 'Tu bono y accesos rápidos',
    icono: 'Ticket', origen: 'sistema', estilizable: false, campos: [],
  },
  tiraSemana: {
    id: 'sistema', sistemaId: 'tiraSemana',
    nombre: 'Tira de la semana (7 días, con punto si hay clase reservada)',
    icono: 'CalendarCheck', origen: 'sistema', estilizable: false, campos: [],
  },
  // Sin la frase "esta semana" a propósito: colisionaba con el bloque
  // "Esta semana" en los e2e existentes (getByText hace match de subcadena
  // sin distinguir mayúsculas por defecto — e2e/apariencia-inicio-portal.spec.ts).
  progresoSemanal: {
    id: 'sistema', sistemaId: 'progresoSemanal',
    nombre: 'Progreso semanal (anillo con tus clases reservadas)',
    icono: 'CircleDashed', origen: 'sistema', estilizable: false, campos: [],
  },
  // "Apuntarme" en vez de "Apúntate"/"únete" a propósito: es el texto exacto
  // del botón, no una paráfrasis — mismo criterio que el resto de nombres de
  // este registro (describen lo que la propietaria ve, no lo reinterpretan).
  retos: {
    id: 'sistema', sistemaId: 'retos',
    nombre: 'Retos (carrusel con conteo real de apuntadas y botón Apuntarme)',
    icono: 'Trophy', origen: 'sistema', estilizable: false, campos: [],
  },
};

/** Una definición por su clave, sin poder confiar en que el string sea válida. */
export function getDefinicionBloque(clave: string): DefinicionBloque | undefined {
  return Object.prototype.hasOwnProperty.call(REGISTRO_BLOQUES, clave)
    ? REGISTRO_BLOQUES[clave as ClaveBloque]
    : undefined;
}

/** La definición de un bloque ya construido, resolviendo `sistema` por su id. */
export function definicionDe(bloque: BloqueHome): DefinicionBloque | undefined {
  return getDefinicionBloque(bloque.kind === 'sistema' ? bloque.sistemaId : bloque.kind);
}

export const DEFINICIONES_CATALOGO: DefinicionBloque[] =
  Object.values(REGISTRO_BLOQUES).filter((d) => d.origen === 'catalogo');

// ── Vistas derivadas (compatibilidad) ───────────────────────────────────────
// Lo que consumía el editor antes del registro. Se mantienen para no tocar
// una docena de callers en la misma PR que introduce el registro; el
// contenido es exactamente el de antes, y hay tests que lo fijan contra un
// oráculo copiado a mano.

export interface BlockCatalogEntry<K extends BloqueTipoCatalogo = BloqueTipoCatalogo> {
  kind: K;
  label: string;
  descripcion: string;
  icono: string;
  defaultConfig: Extract<BloqueHome, { kind: K }>['config'];
}

/** @deprecated Usa `DEFINICIONES_CATALOGO`. */
export const BLOCK_CATALOG: BlockCatalogEntry[] = DEFINICIONES_CATALOGO.map((d) => ({
  kind: d.id as BloqueTipoCatalogo,
  label: d.nombre,
  descripcion: d.descripcion ?? '',
  icono: d.icono,
  defaultConfig: defaultsDe(d.campos) as BlockCatalogEntry['defaultConfig'],
}));

/** @deprecated Usa `REGISTRO_BLOQUES[sistemaId].nombre`. */
export const BLOQUE_SISTEMA_LABEL: Record<BloqueSistemaId, string> = Object.fromEntries(
  Object.values(REGISTRO_BLOQUES)
    .filter((d) => d.origen === 'sistema')
    .map((d) => [d.sistemaId, d.nombre]),
) as Record<BloqueSistemaId, string>;

/** @deprecated Usa `getDefinicionBloque`. */
export function getBlockCatalogEntry(kind: string): BlockCatalogEntry | undefined {
  const def = getDefinicionBloque(kind);
  if (!def || def.origen !== 'catalogo') return undefined;
  // `defaultConfig` se re-CLONA en cada llamada, no se devuelve el del array.
  // El editor lo usa tal cual al insertar (`config: entry.defaultConfig`), así
  // que devolver siempre el mismo objeto haría que dos FAQ de la misma
  // pantalla compartieran el array `preguntas`. Hoy no rompe nada de milagro
  // (todos los onChange construyen arrays nuevos), pero es una mina esperando
  // al primer `.push()`.
  return { ...BLOCK_CATALOG.find((b) => b.kind === kind)!, defaultConfig: defaultsDe(def.campos) as BlockCatalogEntry['defaultConfig'] };
}

// Ocultos por defecto: los que ningún estudio ve hasta que instala el tema
// que los pide (lib/theme-definitions.ts, bloquesHome) o los activa a mano.
const SISTEMA_OCULTO_POR_DEFECTO = new Set<BloqueSistemaId>(['tiraSemana', 'progresoSemanal', 'retos']);

function bloqueSistema(sistemaId: BloqueSistemaId): BloqueHome {
  return SISTEMA_OCULTO_POR_DEFECTO.has(sistemaId)
    ? { id: `sistema-${sistemaId}`, kind: 'sistema', sistemaId, oculto: true }
    : { id: `sistema-${sistemaId}`, kind: 'sistema', sistemaId };
}

// Por defecto (ningún estudio ha tocado esto todavía): los bloques `sistema`
// de cada pantalla, en su orden por defecto, visibles salvo los que se
// activan por tema (ver SISTEMA_OCULTO_POR_DEFECTO arriba).
export const DEFAULT_BLOQUES_POR_PANTALLA: Record<PantallaId, BloqueHome[]> = {
  home: BLOQUES_SISTEMA_POR_PANTALLA.home.map(bloqueSistema),
  clases: BLOQUES_SISTEMA_POR_PANTALLA.clases.map(bloqueSistema),
  bonos: BLOQUES_SISTEMA_POR_PANTALLA.bonos.map(bloqueSistema),
};
/** @deprecated usar DEFAULT_BLOQUES_POR_PANTALLA.home */
export const DEFAULT_HOME_BLOQUES: BloqueHome[] = DEFAULT_BLOQUES_POR_PANTALLA.home;

export interface HomeBloquesShape {
  draft: BloqueHome[];
  publicado: BloqueHome[];
}
export type BloquesPorPantallaShape = Record<PantallaId, HomeBloquesShape>;

export const DEFAULT_BLOQUES_SHAPE: BloquesPorPantallaShape = {
  home: { draft: DEFAULT_BLOQUES_POR_PANTALLA.home, publicado: DEFAULT_BLOQUES_POR_PANTALLA.home },
  clases: { draft: DEFAULT_BLOQUES_POR_PANTALLA.clases, publicado: DEFAULT_BLOQUES_POR_PANTALLA.clases },
  bonos: { draft: DEFAULT_BLOQUES_POR_PANTALLA.bonos, publicado: DEFAULT_BLOQUES_POR_PANTALLA.bonos },
};
/** @deprecated usar DEFAULT_BLOQUES_SHAPE.home */
export const DEFAULT_HOME_BLOQUES_SHAPE: HomeBloquesShape = DEFAULT_BLOQUES_SHAPE.home;

/**
 * Lee UN bloque de jsonb crudo, o `null` si no se puede confiar en él.
 *
 * El agujero que cierra: la lectura hacía un cast crudo (`obj.draft as
 * BloqueHome[]`) sin mirar nada, y `BloqueHomeRender` acaba en un `return
 * <TestimoniosBloque>` sin guarda. Un `kind` desconocido —una fila escrita
 * por una versión más nueva, un jsonb tocado a mano, un rollback del
 * deploy— no daba un bloque raro: reventaba la pantalla ENTERA de la socia,
 * con sus clases y su bono dentro.
 *
 * Tres reglas, del mismo espíritu que `resolveTheme`/`resolveVariantes`:
 *  · `kind` desconocido → se descarta ESE bloque; el resto de la pantalla se
 *    pinta igual.
 *  · clave ausente → se rellena con su `porDefecto`. Esto vale más que la
 *    tolerancia en sí: lo guardado pasa a ser un PARCHE sobre los defaults
 *    del schema, así que **un campo nuevo es retroactivo para todos los
 *    estudios sin migrar datos**. Es exactamente el problema que ya nos
 *    mordió con los `defaults` de los temas, que no eran retroactivos.
 *  · clave desconocida → **se conserva**. Es contenido que escribió alguien;
 *    tirarlo en lectura lo borraría en el siguiente guardado.
 *
 * ⚠️ `estilo` NO pasa por `resolverConfig`: ahí "ausente" significa "hereda
 * del tema", un tercer estado que el render distingue de verdad. Rellenarlo
 * con defaults cambiaría el aspecto de estudios reales sin que nadie tocara
 * nada.
 */
export function resolverBloque(raw: unknown): BloqueHome | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || typeof b.kind !== 'string') return null;
  const oculto = b.oculto === true ? { oculto: true as const } : {};

  if (b.kind === 'sistema') {
    if (typeof b.sistemaId !== 'string') return null;
    const def = getDefinicionBloque(b.sistemaId);
    if (!def || def.origen !== 'sistema') return null;
    // Mismas reglas que el catálogo: claves ausentes al valor de hoy, claves
    // desconocidas conservadas. Un bloque de sistema SIN campos (los que
    // todavía no se han abierto) sigue resolviendo a `{}` y se omite, para no
    // ensuciar el jsonb de todos los estudios con objetos vacíos.
    const guardadaSis = b.config && typeof b.config === 'object' && !Array.isArray(b.config)
      ? (b.config as Record<string, unknown>)
      : {};
    const resuelta = def.campos.length > 0
      ? { config: resolverConfig(def.campos, guardadaSis) as Record<string, unknown> }
      : {};
    return { id: b.id, kind: 'sistema', sistemaId: b.sistemaId as BloqueSistemaId, ...resuelta, ...oculto };
  }

  const def = getDefinicionBloque(b.kind);
  if (!def || def.origen !== 'catalogo') return null;
  const guardada = b.config && typeof b.config === 'object' && !Array.isArray(b.config)
    ? (b.config as Record<string, unknown>)
    : {};
  const estilo = b.estilo && typeof b.estilo === 'object' && !Array.isArray(b.estilo)
    ? { estilo: b.estilo as EstiloBloque }
    : {};
  // Los hijos se resuelven con las MISMAS reglas que el padre (kind
  // desconocido fuera, claves ausentes rellenadas, desconocidas conservadas) y
  // además se filtran por lo que el padre admite: un hijo que su padre ya no
  // acepta —porque el registro cambió— se descarta en vez de pintarse en un
  // sitio donde no encaja. Y se les quita `hijos` recursivamente, que es lo
  // que garantiza el nivel único aunque el jsonb venga con más profundidad.
  const hijos = def.hijos && Array.isArray(b.hijos)
    ? b.hijos
        .map(resolverBloque)
        .filter((h): h is Extract<BloqueHome, { kind: BloqueTipoCatalogo }> =>
          h !== null && h.kind !== 'sistema' && def.hijos!.admite.includes(h.kind))
        .map(({ hijos: _descartado, ...resto }) => resto as BloqueHijo)
        .slice(0, def.hijos.max ?? Infinity)
    : [];
  return {
    id: b.id,
    kind: b.kind,
    config: resolverConfig(def.campos, guardada),
    ...oculto,
    ...estilo,
    ...(hijos.length > 0 ? { hijos } : {}),
  } as BloqueHome;
}

/** Una lista de bloques crudos, sin los que no se puedan resolver. */
export function resolverBloques(raw: unknown): BloqueHome[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(resolverBloque).filter((b): b is BloqueHome => b !== null);
}

/**
 * Resuelve los bloques de UNA pantalla. Mismo principio que resolveTheme():
 * ante cualquier duda cae al default visual de siempre, nunca lanza.
 *
 * `legacyPortalHome` solo se usa (y solo tiene sentido) para `home`: es la
 * compatibilidad con Fase 2, que dejaba reordenar/ocultar sus 4 módulos fijos
 * antes de que existiera este constructor de bloques. Un estudio que ya
 * reordenó en Fase 2 ve EXACTAMENTE lo mismo al entrar aquí, sin migrar
 * datos. Clases y Bonos no tienen legado que migrar — si no hay nada
 * guardado, arrancan siempre con su único bloque sistema.
 */
export function resolveBloquesPantalla(
  raw: unknown,
  pantallaId: PantallaId,
  legacyPortalHome?: { orden: string[]; ocultos: string[] },
): HomeBloquesShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const draft = resolverBloques(obj.draft);
  const publicado = resolverBloques(obj.publicado);

  if (draft.length > 0 || publicado.length > 0) {
    return { draft: draft.length > 0 ? draft : publicado, publicado };
  }

  if (pantallaId === 'home' && legacyPortalHome) {
    const sistemaIds = BLOQUES_SISTEMA_POR_PANTALLA.home;
    const legacyOcultos = new Set(legacyPortalHome.ocultos);
    const ordenLegacy = [
      ...legacyPortalHome.orden.filter((id): id is BloqueSistemaId => (sistemaIds as readonly string[]).includes(id)),
      ...sistemaIds.filter((id) => !legacyPortalHome.orden.includes(id)),
    ];
    const sintetizado = ordenLegacy.map((id) => (legacyOcultos.has(id) ? { ...bloqueSistema(id), oculto: true } : bloqueSistema(id)));
    return { draft: sintetizado, publicado: sintetizado };
  }

  return DEFAULT_BLOQUES_SHAPE[pantallaId];
}

/** Bloques visibles, en orden — lo que de verdad se pinta en la pantalla. */
export function bloquesVisibles(bloques: BloqueHome[]): BloqueHome[] {
  return bloques.filter((b) => !b.oculto);
}

// Re-exportados desde lib/theme/enlaces.ts, donde viven ahora para que el
// motor de campos pueda usar la MISMA validación sin crear un ciclo. Se
// re-exportan para no tocar a los callers (el render los importa de aquí).
export { resolverHrefBloque, resolverVideoEmbed } from './theme/enlaces.ts';

/**
 * Si un bloque del catálogo tiene contenido suficiente para pintarse de
 * verdad. Ya no es una cadena de `if` por kind: la condición vive en el
 * registro (`completoSi`) y aquí solo se evalúa. Sigue siendo la MISMA
 * fuente de verdad para el `return null` de cada componente de render y para
 * el gate de "antes de publicar" del editor.
 */
export function bloqueEstaCompleto(b: Exclude<BloqueHome, { kind: 'sistema' }>): boolean {
  const def = getDefinicionBloque(b.kind);
  if (!def) return false;
  return cumpleCondicion(def.completoSi, b.config as Record<string, unknown>);
}
