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
  // FIJOS: la mitad de arriba del Inicio. Se listan y se editan, pero no se
  // arrastran ni se ocultan — ver `fijo` en el registro y el comentario de
  // BLOQUES_FIJOS_POR_PANTALLA.
  'cabecera', 'proximaClase',
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
  home: ['cabecera', 'proximaClase', 'estaSemana', 'accesosRapidos', 'invitarAmiga', 'contenidoEstudio', 'tiraSemana', 'progresoSemanal', 'retos'],
  clases: ['listadoClases'],
  bonos: ['listadoBonos'],
};

/**
 * Los bloques que existen SIEMPRE y no se mueven.
 *
 * ⚠️ El saludo y la tarjeta grande son el 48 % del alto del Inicio —medido en
 * un estudio real— y hasta ahora no estaban en el editor: ni listados, ni
 * seleccionables, ni editables. Era la mitad de la pantalla, y la primera que
 * ve la socia.
 *
 * No entran en el contenedor flex que ordena los demás con CSS `order`: los
 * efectos de scroll de portal-home-view.tsx dependen de esa estructura, y
 * "el saludo y tu próxima clase se mantienen siempre arriba" es una decisión
 * de producto, no una limitación. Así que se listan y se editan, pero sin
 * agarradera de arrastre ni ojo de ocultar: mentirían.
 */
export const BLOQUES_FIJOS_POR_PANTALLA: Record<PantallaId, readonly BloqueSistemaId[]> = {
  home: ['cabecera', 'proximaClase'],
  clases: [],
  bonos: [],
};

/** Si un bloque es de los que existen siempre y no se reordenan. */
export function esBloqueFijo(bloque: BloqueHome): boolean {
  return bloque.kind === 'sistema' && bloque.fijo === true;
}

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
// Estilo del bloque. Ocho controles: en lista plana no se lee de un vistazo,
// así que van en tres secciones con el orden canónico color → disposición →
// forma (el mismo que usan todos los contenedores del tema de referencia).
//
// ⚠️ "Esquinas" es el primer campo del portal con condición REAL: sobre un
// bloque transparente y sin sombra, redondear las esquinas no se ve. El dato
// ya estaba en el render (`estilo?.esquinas ? … : (estilo?.fondo ? … )`), solo
// que no estaba en el schema. Banner es la excepción y trae el suyo, abajo.
export const CAMPOS_ESTILO = [
  { tipo: 'colorHeredado', id: 'fondo', etiqueta: 'Fondo', porDefecto: null, grupo: 'Color' },
  { tipo: 'colorHeredado', id: 'color', etiqueta: 'Texto', porDefecto: null, grupo: 'Color' },
  {
    tipo: 'opciones', id: 'alineacion', etiqueta: 'Alineación', porDefecto: 'izquierda', grupo: 'Disposición',
    opciones: [
      { id: 'izquierda', label: 'Izquierda' }, { id: 'centro', label: 'Centro' }, { id: 'derecha', label: 'Derecha' },
    ],
  },
  {
    tipo: 'opciones', id: 'ancho', etiqueta: 'Ancho', porDefecto: 'completo', grupo: 'Disposición',
    opciones: [
      { id: 'completo', label: 'Completo' }, { id: 'contenido', label: 'Con margen' },
    ],
  },
  {
    tipo: 'opciones', id: 'espaciado', etiqueta: 'Espaciado', porDefecto: 'normal', grupo: 'Disposición',
    opciones: [
      { id: 'compacto', label: 'Compacto' }, { id: 'normal', label: 'Normal' }, { id: 'amplio', label: 'Amplio' },
    ],
  },
  {
    tipo: 'opciones', id: 'tamanoTexto', etiqueta: 'Tamaño del texto', porDefecto: 'normal', grupo: 'Disposición',
    opciones: [
      { id: 'pequeno', label: 'Pequeño' }, { id: 'normal', label: 'Normal' }, { id: 'grande', label: 'Grande' },
    ],
  },
  {
    tipo: 'opciones', id: 'sombra', etiqueta: 'Sombra', porDefecto: 'ninguna', grupo: 'Forma',
    opciones: [
      { id: 'ninguna', label: 'Ninguna' }, { id: 'suave', label: 'Suave' }, { id: 'marcada', label: 'Marcada' },
    ],
  },
  {
    tipo: 'opciones', id: 'esquinas', etiqueta: 'Esquinas', porDefecto: 'redondeada', grupo: 'Forma',
    // Sin fondo NI sombra no hay nada cuyo borde redondear.
    //
    // ⚠️ `{ campo: 'sombra', distinto: 'ninguna' }` a secas NO vale, y el test
    // lo cazó: en `estilo` no se rellenan defaults (ausente = "hereda"), así
    // que `sombra` llega `undefined` y `undefined !== 'ninguna'` es cierto —
    // la condición se cumplía siempre. Hay que exigir además que exista. Es la
    // misma trampa de "ausente no es el valor por defecto" de todo este módulo.
    visibleSi: {
      alguna: [
        { campo: 'fondo', noVacio: true },
        { todas: [{ campo: 'sombra', noVacio: true }, { campo: 'sombra', distinto: 'ninguna' }] },
      ],
    },
    opciones: [
      { id: 'ninguna', label: 'Recta' }, { id: 'suave', label: 'Suave' }, { id: 'redondeada', label: 'Redonda' }, { id: 'pill', label: 'Cápsula' },
    ],
  },
] as const satisfies readonly CampoSchema[];

// Banner tiene su propia geometría (una foto a sangre con altura fija), así
// que sus dos excepciones al estilo común son de verdad, no un capricho:
//  · las esquinas SIEMPRE se ven —recortan la imagen—, sin condición;
//  · el fondo solo sirve si NO hay foto, porque la imagen tapa el bloque
//    entero. Esa frase ya estaba escrita en un comentario de
//    bloque-home-render.tsx; aquí pasa a ser schema, y el panel deja de
//    ofrecer un color que no se vería.
export const CAMPOS_ESTILO_BANNER = CAMPOS_ESTILO.map((c) =>
  c.id === 'esquinas' ? { ...c, visibleSi: undefined }
  : c.id === 'fondo' ? { ...c, visibleSi: { campo: 'imagenUrl', igual: '' } as const }
  : c,
) as readonly CampoSchema[];

export const CAMPOS_CONTENEDOR = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título (opcional)', porDefecto: '' },
  {
    tipo: 'opciones', id: 'direccion', etiqueta: 'Disposición', porDefecto: 'columna', grupo: 'Disposición',
    opciones: [{ id: 'columna', label: 'Una debajo de otra' }, { id: 'fila', label: 'En fila' }],
  },
  {
    tipo: 'opciones', id: 'separacion', etiqueta: 'Separación', porDefecto: 'normal', grupo: 'Disposición',
    opciones: [{ id: 'poca', label: 'Poca' }, { id: 'normal', label: 'Normal' }, { id: 'mucha', label: 'Mucha' }],
  },
  {
    // Solo tiene sentido en fila: en columna todas ocupan el ancho.
    tipo: 'opciones', id: 'reparto', etiqueta: 'Reparto', porDefecto: 'iguales', grupo: 'Disposición',
    visibleSi: { campo: 'direccion', igual: 'fila' },
    opciones: [{ id: 'iguales', label: 'Partes iguales' }, { id: 'ajustado', label: 'Al contenido' }],
  },
] as const satisfies readonly CampoSchema[];
export type ContenedorConfig = ConfigDe<typeof CAMPOS_CONTENEDOR>;

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
  | {
      id: string; kind: 'sistema'; sistemaId: BloqueSistemaId;
      config?: Record<string, unknown>; oculto?: boolean;
      /**
       * "Este bloque no se mueve ni se borra". Viaja EN EL DATO, no en una
       * regla que cada lector aplique por su cuenta.
       *
       * ⚠️ Antes era una constante global consultada en tiempo de lectura
       * (`BLOQUES_FIJOS_POR_PANTALLA` + `esBloqueFijo(pantalla, id)`), y el
       * 2026-08-06 costó un bug real: el render aplicaba la regla y el editor
       * no, así que la propietaria veía el bloque en su portal y en la vista
       * previa pero no podía ni seleccionarlo. Con la marca en la instancia
       * los dos caminos leen lo mismo por construcción, y el llamador ya no
       * puede equivocarse de pantalla al preguntar.
       *
       * La lista global sigue existiendo, pero solo para MATERIALIZAR la marca
       * (qué bloques deben existir en cada pantalla), no para responder "¿es
       * fijo?".
       */
      fijo?: true;
    }
  | { id: string; kind: 'banner'; config: BannerConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'texto'; config: TextoConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'cta'; config: CtaConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'faq'; config: FaqConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'galeria'; config: GaleriaConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'video'; config: VideoConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'testimonios'; config: TestimoniosConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] }
  | { id: string; kind: 'contenedor'; config: ContenedorConfig; oculto?: boolean; estilo?: EstiloBloque; hijos?: BloqueHijo[] };

/**
 * Un hijo es un bloque del catálogo SIN `hijos` propios — el tipo es quien
 * impide el segundo nivel, no una comprobación en tiempo de ejecución que se
 * pueda olvidar en algún camino.
 */
/**
 * ⚠️ `Omit` NO distribuye sobre uniones: `Omit<A | B, 'x'>` colapsa en UN
 * objeto con la unión de todas las claves, y ahí `kind` deja de estar
 * correlacionado con `config`. Este tipo llevaba varias PRs escrito así y
 * nadie lo notó porque el anidamiento no tenía consumidores; salió a la luz al
 * pintar el primer hijo de verdad. El `T extends unknown ?` fuerza el reparto.
 */
type SinHijos<T> = T extends unknown ? Omit<T, 'hijos'> : never;

/**
 * Un hijo es un bloque del catálogo SIN `hijos` propios, y nunca un
 * contenedor — el TIPO es quien impide el segundo nivel, no una comprobación
 * en tiempo de ejecución que se pueda olvidar en algún camino.
 */
export type BloqueHijo = SinHijos<Exclude<Extract<BloqueHome, { kind: BloqueTipoCatalogo }>, { kind: 'contenedor' }>>;

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
/**
 * Comodín de `hijos.admite`: "acepto cualquier bloque público del catálogo".
 *
 * Sin él, cada contenedor tendría que enumerar todos los tipos, y un bloque
 * nuevo no sería usable dentro de ninguno hasta editar a mano todos los
 * padres. Es lo que hace que el catálogo crezca sin tocar nada más — y es la
 * respuesta a "¿qué bloque debe aceptar hijos?": no hay que decidirlo bloque a
 * bloque, se crea UN contenedor y acepta todo.
 *
 * No incluye al propio `contenedor`: el anidamiento es de un nivel (ver el
 * comentario de `BloqueHome`), así que un contenedor dentro de otro no tendría
 * dónde pintar a sus nietos.
 */
export const COMODIN_CATALOGO = '@catalogo' as const;

/** Si `padre` admite un hijo de tipo `kind`, resolviendo el comodín. */
export function admiteHijo(padre: DefinicionBloque, kind: BloqueTipoCatalogo): boolean {
  if (!padre.hijos) return false;
  if (kind === 'contenedor') return padre.hijos.admite.includes('contenedor');
  return padre.hijos.admite.includes(kind) || padre.hijos.admite.includes(COMODIN_CATALOGO);
}

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
   * Schema de estilo propio. Ausente = `CAMPOS_ESTILO`, el común. Existe
   * porque un bloque puede tener geometría propia y entonces las condiciones
   * del estilo común son falsas para él (ver `CAMPOS_ESTILO_BANNER`).
   */
  camposEstilo?: readonly CampoSchema[];
  /**
   * Qué bloques admite dentro y cuántos. Ausente = no admite ninguno, que es
   * el caso de los siete de hoy. Los `sistema` lo llevan siempre ausente.
   */
  hijos?: { admite: readonly (BloqueTipoCatalogo | typeof COMODIN_CATALOGO)[]; max?: number };
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


/**
 * La cabecera. Dos frases según si la socia tiene clase hoy o no.
 *
 * ⚠️ La frase "con clase" tiene DOS literales distintos hoy según la variante
 * de cabecera del tema ('¿Lista para tu sesión de hoy?' en la clásica, 'Hoy
 * tienes una cita contigo.' en las demás). Por eso el `porDefecto` va vacío y
 * cada sitio del render pasa el suyo: sin tocar nada, cada tema conserva su
 * texto; en cuanto el estudio escribe uno, manda el suyo en todas.
 */
export const CAMPOS_CABECERA = [
  {
    tipo: 'texto', id: 'fraseSinClase', etiqueta: 'Frase cuando no tiene clase hoy',
    porDefecto: 'Tu sitio sigue aquí.', maxLargo: 60,
  },
  {
    tipo: 'texto', id: 'fraseConClase', etiqueta: 'Frase cuando sí tiene clase hoy',
    porDefecto: '', maxLargo: 60,
    ayuda: 'Vacío = la frase que traiga tu tema.',
  },
] as const satisfies readonly CampoSchema[];

/**
 * La tarjeta grande. Un solo componente con SEIS situaciones; el diseño solo
 * dibuja la primera, las demás cambian el texto y el destino.
 *
 * Están las seis a propósito: son la voz con la que el estudio habla a una
 * socia que no viene, a la que se le acaba el bono o a la que está a punto de
 * perder su racha. Era la misma para todos los estudios.
 *
 * Lo que NO se expone es lo que sale de los datos (el nombre de la clase, la
 * hora, "Racha de N semanas"): un campo ahí sería un control que no mueve
 * nada, o peor, que borra un dato real.
 */
// ⚠️ 16 campos: es el bloque más grande del portal, y en lista plana era un
// muro. `grupo` los reparte en las CINCO situaciones distintas que puede vivir
// la socia — solo una se da a la vez, así que el Inspector abre la primera y
// pliega el resto. El prefijo que antes llevaba cada etiqueta ("Sin clases ·
// Titular") lo pone ahora el título de la sección.
export const CAMPOS_PROXIMA_CLASE = [
  // Sin clases reservadas — la que ve una socia nueva, y la que ves tú en tu
  // propia vista previa.
  { tipo: 'texto', id: 'vaciaVolanta', etiqueta: 'Etiqueta', grupo: 'Sin clases', porDefecto: 'Sin clases reservadas', maxLargo: 40 },
  { tipo: 'texto', id: 'vaciaTitulo', etiqueta: 'Titular', grupo: 'Sin clases', porDefecto: 'Empieza por aquí', maxLargo: 50 },
  { tipo: 'texto', id: 'vaciaTexto', etiqueta: 'Texto', grupo: 'Sin clases', porDefecto: 'Elige el día que mejor te venga', maxLargo: 70 },
  { tipo: 'texto', id: 'vaciaBoton', etiqueta: 'Botón', grupo: 'Sin clases', porDefecto: 'Ver la agenda', maxLargo: 30 },
  // Con próxima clase — titular y detalles salen de la reserva.
  { tipo: 'texto', id: 'proximaVolanta', etiqueta: 'Etiqueta', grupo: 'Próxima clase', porDefecto: 'Tu próxima clase', maxLargo: 40 },
  { tipo: 'texto', id: 'proximaBoton', etiqueta: 'Botón', grupo: 'Próxima clase', porDefecto: 'Ver mi acceso', maxLargo: 30 },
  // Se le acaba el bono.
  { tipo: 'texto', id: 'bonoVolanta', etiqueta: 'Etiqueta', grupo: 'Bono acabándose', porDefecto: 'Tu bono se acaba', maxLargo: 40 },
  { tipo: 'texto', id: 'bonoTitulo', etiqueta: 'Titular', grupo: 'Bono acabándose', porDefecto: 'Te queda una sesión', maxLargo: 50 },
  { tipo: 'texto', id: 'bonoTexto', etiqueta: 'Texto', grupo: 'Bono acabándose', porDefecto: 'Renuévalo y sigues igual', maxLargo: 70 },
  { tipo: 'texto', id: 'bonoBoton', etiqueta: 'Botón', grupo: 'Bono acabándose', porDefecto: 'Renovar mi bono', maxLargo: 30 },
  // Racha en riesgo — la etiqueta lleva el número de semanas, no se toca.
  { tipo: 'texto', id: 'rachaTitulo', etiqueta: 'Titular', grupo: 'Racha en riesgo', porDefecto: 'No la pierdas ahora', maxLargo: 50 },
  { tipo: 'texto', id: 'rachaTexto', etiqueta: 'Texto', grupo: 'Racha en riesgo', porDefecto: 'Reserva esta semana', maxLargo: 70 },
  { tipo: 'texto', id: 'rachaBoton', etiqueta: 'Botón', grupo: 'Racha en riesgo', porDefecto: 'Buscar mi clase', maxLargo: 30 },
  // Lleva tiempo sin venir — la etiqueta lleva los días, no se toca.
  { tipo: 'texto', id: 'inactivaTitulo', etiqueta: 'Titular', grupo: 'Sin venir', porDefecto: 'Tu sitio te espera', maxLargo: 50 },
  { tipo: 'texto', id: 'inactivaTexto', etiqueta: 'Texto', grupo: 'Sin venir', porDefecto: 'Hay clases con hueco esta semana', maxLargo: 70 },
  { tipo: 'texto', id: 'inactivaBoton', etiqueta: 'Botón', grupo: 'Sin venir', porDefecto: 'Volver a reservar', maxLargo: 30 },
] as const satisfies readonly CampoSchema[];

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

export const CAMPOS_PROGRESO_SEMANAL = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: 'Tu semana', maxLargo: 40 },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_RETOS = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título', porDefecto: 'Retos', maxLargo: 40 },
  // Una foto por reto, del ESTUDIO. Vacío = la tarjeta de color de siempre,
  // que es lo que ve todo estudio que no suba nada.
  //
  // ⚠️ Fotos del estudio, nunca de archivo: la referencia que motivó esto
  // llevaba caras de gente que no existe y un "156K apuntadas" inventado.
  // El conteo de esta tarjeta ya es REAL (`reto_participaciones`), y mezclarlo
  // con personas de catálogo lo convertiría en decorado. Decisión del fundador
  // al reabrir el "nunca fotos" que documentaba retos-portal.ts.
  {
    tipo: 'imagen', id: 'imagenCore', etiqueta: 'Foto del reto «Core Pilates»',
    marcador: 'https://…', porDefecto: '',
    ayuda: 'Opcional. Sin foto, la tarjeta se queda con su color.',
  },
  {
    tipo: 'imagen', id: 'imagenCara', etiqueta: 'Foto del reto «Face Yoga»',
    marcador: 'https://…', porDefecto: '',
    ayuda: 'Opcional. Sin foto, la tarjeta se queda con su color.',
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_LISTADO_CLASES = [
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título de la pantalla', porDefecto: 'Clases', maxLargo: 40 },
  {
    tipo: 'texto', id: 'vacioDia', etiqueta: 'Cuando no hay clases ese día',
    porDefecto: 'No hay clases este día.', maxLargo: 90,
  },
  {
    tipo: 'texto', id: 'vacioMias', etiqueta: 'Cuando la socia no tiene reservas',
    porDefecto: 'Todavía no tienes ninguna clase reservada.', maxLargo: 90,
    ayuda: 'Es la primera frase que lee alguien que acaba de darse de alta.',
  },
] as const satisfies readonly CampoSchema[];

export const CAMPOS_LISTADO_BONOS = [
  { tipo: 'texto', id: 'antetitulo', etiqueta: 'Texto pequeño de arriba', porDefecto: 'Saldo y planes', maxLargo: 40 },
  { tipo: 'texto', id: 'titulo', etiqueta: 'Título de la pantalla', porDefecto: 'Bonos', maxLargo: 40 },
] as const satisfies readonly CampoSchema[];

export const REGISTRO_BLOQUES: Record<ClaveBloque, DefinicionBloque> = {
  contenedor: {
    id: 'contenedor', nombre: 'Grupo', icono: 'Rows3', origen: 'catalogo',
    categoria: 'texto', estilizable: true, campos: CAMPOS_CONTENEDOR,
    descripcion: 'Agrupa varios bloques y los coloca en fila o en columna.',
    // El comodín: acepta cualquier bloque del catálogo sin enumerarlos. `max`
    // no es estético — en fila, más de cuatro no caben en 390px sin que cada
    // una quede ilegible.
    hijos: { admite: [COMODIN_CATALOGO], max: 4 },
    // Un grupo vacío no pinta nada: sin esto dejaría un hueco con su padding
    // en el portal de la socia. Se comprueba sobre `hijos`, no sobre `config`,
    // así que vive en el render (ver ContenedorBloque) — `completoSi` solo
    // mira `config`.
  },
  banner: {
    id: 'banner', nombre: 'Banner', icono: 'Image', origen: 'catalogo',
    categoria: 'multimedia', estilizable: true, campos: CAMPOS_BANNER,
    camposEstilo: CAMPOS_ESTILO_BANNER,
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
  // muestran sale de los datos del estudio, no de un formulario) y sin
  // `estilo` propio — no se pueden añadir, ya existen siempre.
  //
  // ⚠️ Sus `nombre` llevaban el paréntesis explicativo DENTRO ("Retos
  // (carrusel con conteo real de apuntadas y botón Apuntarme)"). Eso ocupaba
  // tres líneas en el rail y hacía ilegible la lista: lo que se lee de un
  // vistazo tiene que ser el nombre, no la explicación. Ahora el paréntesis
  // vive en `descripcion` y el rail lo pinta como segunda línea en gris — se
  // sigue viendo lo mismo, en dos alturas tipográficas en vez de en una.
  // `descripcion` deja así de ser solo del catálogo de "añadir bloque".
  cabecera: {
    id: 'sistema', sistemaId: 'cabecera', nombre: 'Cabecera',
    descripcion: 'El saludo y la frase de arriba.',
    icono: 'Hand', origen: 'sistema', estilizable: false, campos: CAMPOS_CABECERA,
  },
  // ⚠️ Se llama `proximaClase` y no `tarjetaPrincipal` por dos motivos: es el
  // nombre que usa el diseño aprobado en el `bloquesHome` de los tres temas, y
  // `tarjetaPrincipal` YA EXISTE como eje de `variantes` (hero | rotulada).
  // Dos cosas distintas con el mismo id habrían sido un enredo garantizado.
  proximaClase: {
    id: 'sistema', sistemaId: 'proximaClase', nombre: 'Tarjeta de próxima clase',
    icono: 'Square', origen: 'sistema', estilizable: false, campos: CAMPOS_PROXIMA_CLASE,
  },
  estaSemana: {
    id: 'sistema', sistemaId: 'estaSemana', nombre: 'Esta semana',
    icono: 'CalendarDays', origen: 'sistema', estilizable: false, campos: CAMPOS_ESTA_SEMANA,
  },
  accesosRapidos: {
    id: 'sistema', sistemaId: 'accesosRapidos',
    nombre: 'Accesos rápidos',
    descripcion: 'Reservas, progreso, notificaciones y equipo.',
    icono: 'LayoutGrid', origen: 'sistema', estilizable: false, campos: CAMPOS_ACCESOS_RAPIDOS,
  },
  invitarAmiga: {
    id: 'sistema', sistemaId: 'invitarAmiga', nombre: 'Invita a una amiga',
    icono: 'UserPlus', origen: 'sistema', estilizable: false, campos: CAMPOS_INVITAR_AMIGA,
  },
  contenidoEstudio: {
    id: 'sistema', sistemaId: 'contenidoEstudio',
    nombre: 'Contenido del estudio',
    descripcion: 'Mensaje destacado y banners.',
    icono: 'Megaphone', origen: 'sistema', estilizable: false, campos: [],
  },
  listadoClases: {
    id: 'sistema', sistemaId: 'listadoClases', nombre: 'Calendario de clases',
    icono: 'CalendarRange', origen: 'sistema', estilizable: false, campos: CAMPOS_LISTADO_CLASES,
  },
  listadoBonos: {
    id: 'sistema', sistemaId: 'listadoBonos', nombre: 'Tu bono y accesos rápidos',
    icono: 'Ticket', origen: 'sistema', estilizable: false, campos: CAMPOS_LISTADO_BONOS,
  },
  tiraSemana: {
    id: 'sistema', sistemaId: 'tiraSemana',
    nombre: 'Tira de la semana',
    descripcion: 'Siete días, con un punto si hay clase reservada.',
    icono: 'CalendarCheck', origen: 'sistema', estilizable: false, campos: [],
  },
  // ⚠️ Ni el nombre ni la descripción llevan la frase "esta semana": haría
  // match de subcadena con el bloque "Esta semana", que está en la MISMA
  // pantalla (`getByText` no distingue mayúsculas ni exige palabra completa —
  // e2e/apariencia-inicio-portal.spec.ts).
  progresoSemanal: {
    id: 'sistema', sistemaId: 'progresoSemanal',
    nombre: 'Progreso semanal',
    descripcion: 'Anillo con tus clases reservadas.',
    icono: 'CircleDashed', origen: 'sistema', estilizable: false, campos: CAMPOS_PROGRESO_SEMANAL,
  },
  // "Apuntarme" en vez de "Apúntate"/"únete" a propósito: es el texto exacto
  // del botón, no una paráfrasis — mismo criterio que el resto de nombres de
  // este registro (describen lo que la propietaria ve, no lo reinterpretan).
  retos: {
    id: 'sistema', sistemaId: 'retos',
    nombre: 'Retos',
    descripcion: 'Carrusel con conteo real de apuntadas y botón Apuntarme.',
    icono: 'Trophy', origen: 'sistema', estilizable: false, campos: CAMPOS_RETOS,
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
// ⚠️ Pasan por `resolverBloque`, no por `bloqueSistema` a secas: desde que los
// bloques de sistema tienen campos, resolverlos les rellena su `config` con los
// textos de fábrica. Sin esto, el default y lo que devuelve
// `resolveBloquesPantalla` dejaban de ser iguales — y hay tests que comparan
// justo esas dos cosas, que fueron los que lo cazaron.
// ⚠️ Pasan por `conFijos`, no solo por `resolverBloque`: si no, los defaults
// saldrían SIN la marca `fijo` y no coincidirían con lo que devuelve
// `resolveBloquesPantalla` para el mismo estudio. Ya nos pasó con `config`:
// dos construcciones del mismo dato que divergen es la fuente de bug más
// repetida de este módulo.
export const DEFAULT_BLOQUES_POR_PANTALLA: Record<PantallaId, BloqueHome[]> = {
  home: conFijos(BLOQUES_SISTEMA_POR_PANTALLA.home.map((id) => resolverBloque(bloqueSistema(id))!), 'home'),
  clases: conFijos(BLOQUES_SISTEMA_POR_PANTALLA.clases.map((id) => resolverBloque(bloqueSistema(id))!), 'clases'),
  bonos: conFijos(BLOQUES_SISTEMA_POR_PANTALLA.bonos.map((id) => resolverBloque(bloqueSistema(id))!), 'bonos'),
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
          h !== null && h.kind !== 'sistema' && admiteHijo(def, h.kind))
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
/**
 * Lee una pantalla guardada, venga en el formato que venga.
 *
 * Acepta DOS formas a propósito:
 *  · **array** — como se ha guardado siempre;
 *  · **`{ bloques, orden }`** — el documento (mapa + orden) de la etapa 4.
 *
 * ⚠️ El orden de una migración es lector primero, escritor después. Esta
 * función es el lector: sale a producción sabiendo leer las dos formas ANTES
 * de que nada escriba la nueva. Si se hicieran a la vez, un rollback dejaría
 * datos que el código anterior no entiende — y aquí "no entiende" significa el
 * Inicio en blanco en el portal de una socia.
 *
 * Un `orden` con un id que no está en `bloques` se ignora, igual que un `kind`
 * desconocido: un dato a medio migrar no puede tumbar una pantalla.
 */
export function resolverBloques(raw: unknown): BloqueHome[] {
  if (Array.isArray(raw)) {
    return raw.map(resolverBloque).filter((b): b is BloqueHome => b !== null);
  }
  if (raw && typeof raw === 'object') {
    const doc = raw as { bloques?: unknown; orden?: unknown };
    if (doc.bloques && typeof doc.bloques === 'object' && Array.isArray(doc.orden)) {
      const mapa = doc.bloques as Record<string, unknown>;
      return doc.orden
        .filter((id): id is string => typeof id === 'string')
        .map((id) => resolverBloque(mapa[id]))
        .filter((b): b is BloqueHome => b !== null);
    }
  }
  return [];
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
/**
 * Añade los bloques FIJOS que falten, al principio y en su orden.
 *
 * ⚠️ Sin esto, un bloque de sistema nuevo NUNCA llega a un estudio que ya tiene
 * su Inicio guardado: `resolveBloquesPantalla` devuelve lo guardado tal cual.
 * Es lo que pasó con `tiraSemana`/`progresoSemanal`/`retos`, que solo aparecen
 * si instalas un tema que los siembre — y el comentario de arriba decía "se
 * añaden al final" cuando en realidad no se añadían.
 *
 * Solo se hace con los FIJOS: son los que existen siempre por definición. Los
 * reordenables no se inyectan, porque un estudio puede haberlos quitado a
 * propósito y volver a metérselos sería deshacerle una decisión.
 */
/**
 * Antepone los bloques FIJOS de la pantalla que falten. Un estudio que guardó
 * su borrador antes de que un bloque fijo existiera no lo tiene en el jsonb, y
 * sin esto se quedaría fuera para siempre.
 *
 * ⚠️ Exportada porque hacen falta DOS llamadas, no una: el render la aplica
 * dentro de `resolveBloquesPantalla` (servidor) y el EDITOR tiene que aplicar
 * la misma al cargar el borrador por la API (`fetchBloquesBorrador`). Cuando
 * solo la aplicaba el render, la propietaria veía el bloque en su portal y en
 * la vista previa pero NO en el panel: imposible de seleccionar y de editar.
 */
export function conFijos(bloques: BloqueHome[], pantalla: PantallaId): BloqueHome[] {
  const fijos = BLOQUES_FIJOS_POR_PANTALLA[pantalla];
  if (fijos.length === 0) return bloques;
  // Marca los que YA están: un borrador guardado antes de que la marca
  // existiera no la trae, y sin esto sus bloques fijos pasarían de golpe a ser
  // arrastrables y borrables. Se persiste en el siguiente guardado.
  const marcados = bloques.map((b) => (
    b.kind === 'sistema' && fijos.includes(b.sistemaId) && b.fijo !== true ? { ...b, fijo: true as const } : b
  ));
  const presentes = new Set(marcados.filter((b) => b.kind === 'sistema').map((b) => b.sistemaId));
  const faltan = fijos.filter((id) => !presentes.has(id));
  if (faltan.length === 0) return marcados;
  return [...faltan.map((id) => ({ ...resolverBloque(bloqueSistema(id))!, fijo: true as const })), ...marcados];
}

export function resolveBloquesPantalla(
  raw: unknown,
  pantallaId: PantallaId,
  legacyPortalHome?: { orden: string[]; ocultos: string[] },
): HomeBloquesShape {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const draft = resolverBloques(obj.draft);
  const publicado = resolverBloques(obj.publicado);

  if (draft.length > 0 || publicado.length > 0) {
    return {
      draft: conFijos(draft.length > 0 ? draft : publicado, pantallaId),
      publicado: conFijos(publicado, pantallaId),
    };
  }

  if (pantallaId === 'home' && legacyPortalHome) {
    // ⚠️ Los FIJOS se excluyen aquí y se ponen delante con `conFijos` al final.
    // Si entraran en esta lista, el orden legacy los empujaría al MEDIO —
    // detrás de lo que el estudio hubiera reordenado— y el saludo acabaría
    // pintado entre dos módulos. Lo cazó un test que ya existía.
    const fijosHome = BLOQUES_FIJOS_POR_PANTALLA.home as readonly string[];
    const sistemaIds = BLOQUES_SISTEMA_POR_PANTALLA.home.filter((id) => !fijosHome.includes(id));
    const legacyOcultos = new Set(legacyPortalHome.ocultos);
    const ordenLegacy = [
      ...legacyPortalHome.orden.filter((id): id is BloqueSistemaId => (sistemaIds as readonly string[]).includes(id)),
      ...sistemaIds.filter((id) => !legacyPortalHome.orden.includes(id)),
    ];
    const sintetizado = conFijos(
      // `resolverBloque` también aquí: si no, los bloques sintetizados desde el
      // layout antiguo salían SIN su `config`, y el mismo estudio veía un texto
      // u otro según por qué rama entrara. Dos lecturas distintas del mismo
      // dato otra vez.
      ordenLegacy.map((id) => resolverBloque(legacyOcultos.has(id) ? { ...bloqueSistema(id), oculto: true } : bloqueSistema(id))!),
      'home',
    );
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

/**
 * Reordena/oculta los bloques `sistema` del Inicio según `bloquesHome` de un
 * `ThemeDefinition` — los que aparecen en la lista pasan a visibles, en ese
 * orden; los que no, se ocultan (nunca se borran: un bloque `sistema` no se
 * puede quitar del todo). Los bloques del CATÁLOGO se preservan tal cual, al
 * final — "cambiar de tema no debe borrar tu contenido".
 */
export function sembrarBloquesHome(actuales: BloqueHome[], orden: string[]): BloqueHome[] {
  const sistema = actuales.filter((b): b is Extract<BloqueHome, { kind: 'sistema' }> => b.kind === 'sistema');
  const catalogo = actuales.filter((b) => b.kind !== 'sistema');
  const porId = new Map(sistema.map((b) => [b.sistemaId, b]));

  const listados = orden
    .map((id) => porId.get(id as Extract<BloqueHome, { kind: 'sistema' }>['sistemaId']))
    .filter((b): b is Extract<BloqueHome, { kind: 'sistema' }> => !!b)
    .map((b) => ({ ...b, oculto: false }));
  const noListados = sistema
    .filter((b) => !orden.includes(b.sistemaId))
    .map((b) => ({ ...b, oculto: true }));

  return [...listados, ...noListados, ...catalogo];
}
