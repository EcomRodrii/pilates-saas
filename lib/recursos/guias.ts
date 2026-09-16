// ─────────────────────────────────────────────────────────────────────────────
// Registro de las guías de /recursos — FUENTE ÚNICA de lo que es de cada guía.
//
// De aquí salen: las tarjetas y la guía destacada del listado
// (app/recursos/page.tsx), las fechas y la sección del JSON-LD BlogPosting de
// cada guía (lib/recursos/schema.ts), su Open Graph de artículo, las entradas
// de /recursos/* del registro SEO (lib/seo/paginas.ts → sitemap) y su portada.
//
// ⚠️ Antes las fechas vivían en tres sitios que ya no cuadraban: la prop
// `datePublished` de cada page.tsx (el JSON-LD), la lista del registro SEO (el
// sitemap) y el texto de cada tarjeta («7 min · jul 2026»), más un «Actualizado
// jul 2026» fijo en la cabecera de TODAS las guías, también las de agosto.
// Ahora solo se escriben aquí; `lib/recursos/guias.test.ts` falla si una
// page.tsx vuelve a escribir una fecha a mano.
//
// Sin alias `@/` ni extensiones implícitas: lo leen `node --test` y el script
// `scripts/portadas-recursos.mjs`, y ninguno de los dos los resuelve.
// ─────────────────────────────────────────────────────────────────────────────

export type CategoriaRecursos = 'sustituciones' | 'rentabilidad' | 'operacion' | 'espana' | 'software';

/** Filtros del listado, en su orden. */
export const CATEGORIAS_RECURSOS: { key: CategoriaRecursos; label: string }[] = [
  { key: 'sustituciones', label: 'Sustituciones y equipo' },
  { key: 'rentabilidad', label: 'Rentabilidad' },
  { key: 'operacion', label: 'Operación' },
  { key: 'espana', label: 'España y fiscalidad' },
  { key: 'software', label: 'Elegir software' },
];

export interface CreditoPortada {
  autor: string;
  fuente: string;
  /** Página de origen. Vacía cuando no hay ninguna (una imagen propia). */
  url: string;
  licencia: string;
  /** AAAA-MM-DD. */
  fechaDescarga: string;
}

export interface PortadaRecursos {
  /** Raíz del nombre de los ficheros generados: descriptiva, para SEO. */
  id: string;
  /** Nombre del original en la carpeta de originales (fuera del repo). */
  original: string;
  alt: string;
  /** Medidas del fichero original. El script las comprueba antes de tocarlo. */
  ancho: number;
  alto: number;
  /**
   * Píxeles que se quitan del original [arriba, derecha, abajo, izquierda]. Los
   * originales son recortes de pantalla y traen un filete blanco de 1 a 4 px en
   * algún borde, que en una tarjeta se ve como una raya clara. El script para si
   * después de recortar sigue quedando un borde así.
   */
  recorte: readonly [number, number, number, number];
  credito: CreditoPortada;
  consentimiento: 'no-aplica' | 'firmado';
}

export interface Guia {
  slug: string;
  /** Título de la tarjeta del listado y del registro SEO. */
  titulo: string;
  /** Texto de la tarjeta del listado. */
  resumen: string;
  /** Filtro del listado. */
  categoria: CategoriaRecursos;
  /** La categoría que enseña la cabecera de la guía; es su `articleSection`. */
  seccion: string;
  /** Minutos de lectura (lo que dice la cabecera de la guía). */
  lectura: number;
  /** AAAA-MM-DD. */
  publicado: string;
  /** AAAA-MM-DD, solo si el contenido se revisó después de publicarlo. */
  actualizado?: string;
  portada: PortadaRecursos;
}

/**
 * Las portadas del blog las generó el fundador con IA para Tentare: no son
 * fotos de clientas ni de un estudio real, y ningún texto ni `alt` puede
 * presentarlas así. Por eso cada `alt` empieza por «Escena ilustrativa».
 */
const CREDITO_IA: CreditoPortada = {
  autor: 'Tentare',
  fuente: 'Generada con IA para Tentare',
  url: '',
  licencia: 'Propia',
  fechaDescarga: '2026-09-16',
};

const portada = (
  id: string, original: string, alt: string, ancho: number, alto: number, recorte: PortadaRecursos['recorte'],
): PortadaRecursos => ({
  id, original, alt, ancho, alto, recorte, credito: CREDITO_IA, consentimiento: 'no-aplica',
});

/** En el orden del registro SEO (y del sitemap). El del listado es ORDEN_LISTADO. */
export const GUIAS: Guia[] = [
  {
    slug: 'cubrir-baja-instructora',
    titulo: 'Cómo cubrir una baja de instructora sin hacer una llamada',
    resumen: 'El proceso que roba noches a las propietarias — y cómo convertirlo en algo que ocurre solo. Paso a paso, con lo que puedes automatizar hoy.',
    categoria: 'sustituciones',
    seccion: 'Sustituciones y equipo',
    lectura: 8,
    publicado: '2026-07-01',
    portada: portada('clase-reformer-sustituciones-instructora', '01-sustituciones-instructora.jpg',
      'Escena ilustrativa: una alumna de espaldas en una clase de Pilates en reformer, con más alumnas al fondo en una sala luminosa',
      505, 251, [0, 0, 4, 0]),
  },
  {
    slug: 'facturacion-electronica-verifactu',
    titulo: 'Facturación electrónica para estudios en España',
    resumen: 'Qué cambia con Veri*factu, cuándo es obligatorio y cómo dejarlo automatizado desde el primer cobro.',
    categoria: 'espana',
    seccion: 'España y fiscalidad',
    lectura: 7,
    publicado: '2026-07-01',
    actualizado: '2026-08-13',
    portada: portada('portatil-factura-facturacion-electronica', '04-facturacion-electronica.jpg',
      'Escena ilustrativa: unas manos escriben en un portátil que muestra una factura, junto a una taza en una mesa de madera',
      505, 244, [1, 0, 1, 0]),
  },
  {
    slug: 'precios-reformer-mat',
    titulo: 'Reformer vs. mat: cómo poner precio a cada clase',
    resumen: 'Dos formatos, dos costes, dos techos de ingresos. Cómo fijar precios que reflejen la diferencia — sin dejar dinero sobre la mesa.',
    categoria: 'rentabilidad',
    seccion: 'Rentabilidad',
    lectura: 7,
    publicado: '2026-07-01',
    portada: portada('reformers-sala-precio-reformer-mat', '03-reformer-mat-precio.jpg',
      'Escena ilustrativa: una fila de reformers con torre en una sala luminosa con plantas',
      508, 251, [0, 0, 4, 3]),
  },
  {
    slug: 'estudios-pilates-de-exito',
    titulo: 'Qué puedes aprender de los estudios de pilates que más crecen',
    resumen: 'Datos reales de Club Pilates, SLT, BASI y el mercado español (Eversports, Statista): qué hacen distinto — y qué puedes copiar mañana.',
    categoria: 'rentabilidad',
    seccion: 'Rentabilidad',
    lectura: 9,
    publicado: '2026-08-06',
    portada: portada('clase-grupo-pilates-estudios-que-crecen', '02-estudios-pilates-crecen.jpg',
      'Escena ilustrativa: una clase de grupo de Pilates en esterilla, con las alumnas en la postura del guerrero en una sala luminosa',
      501, 251, [0, 0, 4, 3]),
  },
  {
    slug: 'ocupacion-clases-valle',
    titulo: 'Cómo subir la ocupación de tus clases valle',
    resumen: 'Las 10:00 de un martes vacías cuestan dinero. Lo que hace ClassPass con el precio dinámico, y lo que puedes copiar sin depender de nadie.',
    categoria: 'rentabilidad',
    seccion: 'Rentabilidad',
    lectura: 7,
    publicado: '2026-08-06',
    portada: portada('clase-pilates-ocupacion-clases-valle', '05-ocupacion-clases.jpg',
      'Escena ilustrativa: una clase de Pilates en esterilla con los brazos estirados hacia arriba, en una sala con plantas',
      501, 244, [1, 0, 1, 3]),
  },
  {
    slug: 'reducir-cancelaciones-ultima-hora',
    titulo: 'Reduce las cancelaciones de última hora',
    resumen: 'Lo que cobran de verdad SoulCycle o Barry\'s, y lo que dice la evidencia clínica sobre los recordatorios.',
    categoria: 'operacion',
    seccion: 'Operación',
    lectura: 7,
    publicado: '2026-08-06',
    portada: portada('movil-cancelar-reserva-cancelaciones', '06-cancelaciones-ultima-hora.jpg',
      'Escena ilustrativa: una mano sujeta un móvil con la pantalla para cancelar una reserva de Pilates Reformer',
      508, 244, [1, 0, 1, 3]),
  },
  {
    slug: 'checklist-elegir-software-estudio',
    titulo: 'Checklist: cómo elegir el software de tu estudio',
    resumen: 'Lo que dicen miles de reseñas en Capterra y G2 — y las preguntas exactas para la demo.',
    categoria: 'software',
    seccion: 'Elegir software',
    lectura: 8,
    publicado: '2026-08-06',
    portada: portada('portatil-checklist-elegir-software', '07-elegir-software-estudio.jpg',
      'Escena ilustrativa: un portátil con una lista de comprobación para elegir el software del estudio, junto a una libreta y una taza',
      505, 253, [4, 0, 4, 0]),
  },
  {
    slug: 'reservas-en-tu-web',
    titulo: 'Cómo integrar reservas de Pilates en tu propia web',
    resumen: 'La alumna que sale de tu web para reservar, casi siempre no vuelve. Widget, plugin o API: qué opción encaja con tu estudio.',
    categoria: 'software',
    seccion: 'Software y web',
    lectura: 9,
    publicado: '2026-08-18',
    portada: portada('portatil-web-estudio-reservas-en-tu-web', '09-reservas-en-tu-web.jpg',
      'Escena ilustrativa: un portátil con la web de un estudio de Pilates y un botón para reservar clase',
      508, 253, [4, 0, 4, 3]),
  },
  {
    slug: 'widget-vs-iframe-reservas-pilates',
    titulo: 'Cómo integrar reservas online en la web de tu estudio de pilates',
    resumen: 'Las tres formas técnicas comparadas de verdad: qué pierdes con cada una, cómo instalarlas y el checklist antes de publicar.',
    categoria: 'software',
    seccion: 'Software y web',
    lectura: 10,
    publicado: '2026-08-18',
    portada: portada('movil-horario-clases-reservas-online', '10-reservas-online-web.jpg',
      'Escena ilustrativa: una mano sujeta un móvil con el horario de clases de un estudio',
      505, 255, [1, 1, 0, 0]),
  },
];

/** La guía destacada del listado. */
export const DESTACADA = 'cubrir-baja-instructora';

/** Tarjetas del listado que NO son una guía de /recursos: no entran en el Blog ni en el sitemap. */
export interface TarjetaSinGuia {
  clave: string;
  titulo: string;
  resumen: string;
  categoria: CategoriaRecursos;
  meta: string;
  /** Sin href: «En preparación». */
  href?: string;
  portada?: PortadaRecursos;
}

export const TARJETAS_SIN_GUIA: TarjetaSinGuia[] = [
  {
    clave: 'dependencia-instructora',
    titulo: 'Cómo evitar depender de una sola instructora',
    resumen: 'El riesgo silencioso de todo estudio: cómo repartir el conocimiento y la carga entre tu equipo.',
    categoria: 'sustituciones',
    meta: 'En preparación',
    portada: portada('instructoras-estudio-dependencia-instructora', '08-dependencia-instructora.jpg',
      'Escena ilustrativa: dos mujeres sonrientes con ropa deportiva, una con una esterilla enrollada, en un estudio de Pilates',
      501, 253, [4, 0, 4, 3]),
  },
  {
    // Es una comparativa (/comparativa), no una guía: sin portada y con su meta propia.
    clave: 'tentare-vs-glofox',
    titulo: 'Glofox vs. Tentare: cuál conviene a tu estudio de Pilates',
    resumen: 'Precio real en euros, permanencia, gestión por reformer individual y sustitución de instructoras — sin folletos de marketing.',
    categoria: 'software',
    href: '/comparativa/tentare-vs-glofox',
    meta: '11 min · ago 2026',
  },
];

/** Orden de las tarjetas del listado (la destacada va aparte). Slugs de guía o claves de tarjeta. */
export const ORDEN_LISTADO: string[] = [
  'estudios-pilates-de-exito',
  'precios-reformer-mat',
  'facturacion-electronica-verifactu',
  'ocupacion-clases-valle',
  'reducir-cancelaciones-ultima-hora',
  'checklist-elegir-software-estudio',
  'dependencia-instructora',
  'reservas-en-tu-web',
  'widget-vs-iframe-reservas-pilates',
  'tentare-vs-glofox',
];

export function guia(slug: string): Guia {
  const g = GUIAS.find((x) => x.slug === slug);
  if (!g) throw new Error(`No hay ninguna guía «${slug}» en lib/recursos/guias.ts`);
  return g;
}

export const urlGuia = (slug: string) => `/recursos/${slug}`;

/** La última fecha del contenido: la revisión si la hay, si no la publicación. */
export const fechaModificada = (g: Guia) => g.actualizado ?? g.publicado;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** '2026-08-06' → 'ago 2026'. Sin Intl: el mismo texto en servidor, cliente y test. */
export function mesCorto(fecha: string): string {
  const [anio, mes] = fecha.split('-');
  return `${MESES[Number(mes) - 1]} ${anio}`;
}

/** El pie de la tarjeta del listado: «9 min · ago 2026» (mes de publicación). */
export const metaTarjeta = (g: Guia) => `${g.lectura} min · ${mesCorto(g.publicado)}`;

// ─── Portadas: derivados en public/ ─────────────────────────────────────────
// Los genera `node scripts/portadas-recursos.mjs` desde los originales, que NO
// se suben al repo. Los originales miden unos 505 px y, quitado el filete, los
// más estrechos se quedan en 498: nunca se amplían, así que el mayor derivado es
// de 480 y nadie pinta una portada a más de 480 px CSS.

export const CARPETA_PORTADAS = 'recursos/portadas';
export const ANCHOS_PORTADA = [360, 480] as const;
/** El derivado mayor: el techo de ancho CSS de cualquier portada pintada. */
export const ANCHO_MAX_PORTADA = ANCHOS_PORTADA[ANCHOS_PORTADA.length - 1];
export type FormatoPortada = 'avif' | 'webp';
export const FORMATOS_PORTADA: readonly FormatoPortada[] = ['avif', 'webp'];
/** Techo de peso del derivado mayor (ANCHO_MAX_PORTADA). */
export const PRESUPUESTO_PORTADA_KB: Record<FormatoPortada, number> = { avif: 30, webp: 50 };

/** Medidas útiles del original: lo que queda después del recorte. */
export const anchoUtil = (p: PortadaRecursos) => p.ancho - p.recorte[1] - p.recorte[3];
export const altoUtil = (p: PortadaRecursos) => p.alto - p.recorte[0] - p.recorte[2];
export const altoPortada = (p: PortadaRecursos, ancho: number) => Math.round((ancho * altoUtil(p)) / anchoUtil(p));
export const nombrePortada = (p: PortadaRecursos, ancho: number, formato: FormatoPortada) => `${p.id}-${ancho}.${formato}`;
export const rutaPortada = (p: PortadaRecursos, ancho: number, formato: FormatoPortada) =>
  `/${CARPETA_PORTADAS}/${nombrePortada(p, ancho, formato)}`;

export function derivadosPortada(p: PortadaRecursos) {
  return ANCHOS_PORTADA.flatMap((ancho) =>
    FORMATOS_PORTADA.map((formato) => ({ ancho, alto: altoPortada(p, ancho), formato, fichero: nombrePortada(p, ancho, formato) })));
}

/** Todas las portadas registradas: las de las guías y las de las tarjetas sin guía. */
export function todasLasPortadas(): PortadaRecursos[] {
  return [
    ...GUIAS.map((g) => g.portada),
    ...TARJETAS_SIN_GUIA.flatMap((t) => (t.portada ? [t.portada] : [])),
  ];
}
