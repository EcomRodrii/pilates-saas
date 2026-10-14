import type { GrupoAyuda } from './registro.ts';

// Qué es cada pantalla del panel, en dos frases, para el icono (i) que va
// junto al título.
//
// El centro de ayuda (`registro.ts`) explica CÓMO se hace cada cosa, con sus
// pasos y sus capturas. Esto es lo de antes: para qué sirve esta pantalla y
// qué te quita de encima. Nadie abre una guía para averiguar si la pantalla
// que tiene delante es la que buscaba.
//
// Se escribe hablando de tú, con las palabras del mostrador. Nada de
// "gestiona", "optimiza" ni "centraliza": si una frase no la diría alguien
// enseñándole el programa a una compañera, está mal escrita.
//
// La clave es la RUTA EXACTA. Las subpantallas de un flujo (los importadores,
// las liquidaciones) no llevan icono a propósito: ya se llega a ellas desde
// una pantalla que sí lo explica, y repetirlo ahí sería ruido.
//
// Las vistas de Configuración no tienen ruta propia: su clave es su URL
// canónica, la que construye `lib/configuracion/destino.ts` (`hrefDeLugar`):
// `/configuracion?tab=reservas`, `/configuracion?tab=clases&abrir=tipos-de-clase`.
// El ⓘ las busca por `pathname` y no las ve; el «?» del tutorial, sí.
//
// Y es también el ÚNICO catálogo de los tutoriales de pantalla (P1.1, decisión
// del fundador del 12-oct-2026: «un único catálogo por pantalla, con la ruta como
// clave»). Una ficha con `tutorial` tiene sus pasos en `tutoriales-pasos.ts`, que
// solo carga el tutorial (`dynamic()`): sus textos no viajan en el chunk de cada
// pantalla. tsc exige que estén los pasos de cada ficha con tutorial, y nada más.

/** Adónde lleva "Ver la guía completa". Sin `slug`, a la categoría entera. */
export interface DestinoAyuda {
  categoria: GrupoAyuda;
  slug?: string;
}

export interface AyudaPantalla {
  /** Título del recuadro. El mismo nombre que se ve en el menú. */
  titulo: string;
  /** Qué es y cómo funciona. Dos frases como mucho. */
  resumen: string;
  /** Qué te quita de encima. Una sola línea, en concreto y sin adornos. */
  ahorra: string;
  /**
   * Lo que hace el módulo, en una frase (≤ 140): la de «Tu Tentare» y
   * «Explorar todas las funciones». Solo en las pantallas del menú.
   */
  valor?: string;
  destino: DestinoAyuda;
  /**
   * Esta pantalla tiene tutorial de 3–4 pasos (`components/tutorial/`). Subir la
   * `version` lo vuelve a abrir solo a quien ya lo vio: para cuando su contenido
   * cambie de verdad, no por una errata.
   */
  tutorial?: { version: number };
}

export const AYUDA_POR_PANTALLA = {
  '/dashboard': {
    titulo: 'Resumen',
    valor: 'Tu día de un vistazo: las clases de hoy, quién viene, qué falta por cobrar y a quién conviene escribir.',
    resumen:
      'Lo que tienes hoy delante: las clases del día, quién ha reservado, qué falta por cobrar y a quién conviene escribir. Es la pantalla con la que se abre el estudio por la mañana.',
    ahorra: 'Mirar en cuatro sitios distintos para saber cómo va el día.',
    destino: { categoria: 'empezar', slug: 'primera-semana-de-clases' },
  },

  '/calendario': {
    titulo: 'Calendario',
    valor: 'Tu semana entera: cada clase con su instructora, su sala y las alumnas que han reservado.',
    resumen:
      'Tu semana entera: cada clase con su instructora, su sala y las alumnas que han reservado. Creas una clase, la repites cada semana si quieres, y cualquier cambio les llega a ellas sin que avises una por una.',
    ahorra: 'El cuadrante en papel y el «¿quién viene hoy?» de cada mañana.',
    destino: { categoria: 'reservas', slug: 'crear-una-clase' },
    tutorial: { version: 1 },
  },

  '/citas': {
    titulo: 'Citas',
    valor: 'Las sesiones de una en una —valoración, privada, fisio— con su hueco en la agenda, aparte de las clases de grupo.',
    resumen:
      'Las sesiones de una en una —la valoración inicial, fisio, un personal— con su propio hueco en la agenda, sin mezclarse con las clases de grupo.',
    ahorra: 'Llevar los uno a uno en otra agenda aparte y acabar pisando una clase.',
    destino: { categoria: 'reservas', slug: 'citas' },
  },

  '/clientas': {
    titulo: 'Clientas',
    valor: 'Cada alumna con lo que le queda, cuándo vino por última vez y quién lleva semanas sin venir. Su historial, en su ficha.',
    resumen:
      'Todas tus alumnas en una lista: qué le queda a cada una, cuándo vino por última vez y quién lleva semanas sin aparecer. Abres una ficha y tienes su historial entero, sus bonos y tus notas.',
    ahorra: 'La libreta, y preguntar por WhatsApp «¿a esta le quedaban clases?».',
    destino: { categoria: 'clientes', slug: 'ficha-de-clienta' },
    tutorial: { version: 1 },
  },

  '/mensajeria': {
    titulo: 'Mensajería',
    valor: 'Lo que te escriben tus alumnas y lo que les mandas tú, en un solo sitio y sin dar tu WhatsApp personal.',
    resumen:
      'Las cuatro formas de hablar con tus alumnas en un sitio: los avisos que te llegan a ti, el tablón, lo que te escriben ellas y los mensajes que mandas tú a un grupo.',
    ahorra: 'Tener las conversaciones repartidas entre tu WhatsApp personal y el correo.',
    destino: { categoria: 'automatizaciones', slug: 'mensajeria' },
  },

  '/comunidad': {
    titulo: 'Comunidad',
    resumen:
      'El tablón de tu estudio: publicas algo aquí y tus alumnas lo ven en su portal. Un cambio de horario, el cierre de agosto, la foto de la clase del sábado.',
    ahorra: 'Montar un grupo de WhatsApp con ochenta personas para contar una cosa.',
    destino: { categoria: 'app', slug: 'comunidad' },
  },

  '/cobros': {
    titulo: 'Cobros',
    valor: 'Quién te debe y qué ha entrado. Con tarjeta guardada se cobra sola; las domiciliaciones van en tu remesa al banco.',
    resumen:
      'El dinero en un solo sitio: quién te debe, lo que ya ha entrado y, según cómo factures, tus facturas o lo que necesita tu gestoría. Si una tarjeta falla, aparece aquí con el motivo y cómo volver a cobrarlo.',
    ahorra: 'Perseguir pagos uno a uno y encontrarte el descuadre a fin de mes.',
    destino: { categoria: 'pagos', slug: 'la-pantalla-de-cobros' },
    tutorial: { version: 1 },
  },

  '/pos': {
    titulo: 'Caja',
    valor: 'Cobras en el mostrador un bono, una clase suelta o un producto, en efectivo o con tarjeta, y queda apuntado con lo demás.',
    resumen:
      'El mostrador: cobras un bono, una clase suelta o un producto en el momento, con tarjeta o en efectivo, y queda registrado como cualquier otro cobro, con su factura si Tentare emite tus facturas.',
    ahorra: 'Apuntar en una hoja lo que cobras a pie de mostrador para pasarlo luego.',
    destino: { categoria: 'pagos', slug: 'cobrar-en-la-caja' },
  },

  '/productos': {
    titulo: 'Paquetes',
    valor: 'Lo que vendes: cuotas, bonos y clases sueltas, con su precio, cuánto duran y a qué clases dan derecho.',
    resumen:
      'Lo que vendes: cuotas mensuales, bonos de sesiones y clases sueltas. Aquí pones el precio, cuánto dura, si se renueva solo y a qué clases da derecho.',
    ahorra: 'Explicar por WhatsApp qué incluye cada bono y llevar las caducidades a mano.',
    destino: { categoria: 'bonos', slug: 'tipos-de-bono' },
    tutorial: { version: 1 },
  },

  '/equipo': {
    titulo: 'Equipo',
    valor: 'Tus instructoras y tu recepción: qué ve cada una, cuándo puede, cuánto cobra la hora y las horas que ha fichado.',
    resumen:
      'Tus instructoras y quien esté en el mostrador: a quién das de alta, qué puede ver cada una, cuándo está disponible y cuánto cobra la hora. En Tiempo trabajado, las jornadas que fichan y las clases que dio cada una, con su hora real.',
    ahorra: 'Dar acceso a todo el mundo a todo, y cuadrar horas a mano para pagar.',
    destino: { categoria: 'instructores', slug: 'dar-de-alta-una-instructora' },
  },

  '/sustituciones': {
    titulo: 'Sustituciones',
    valor: 'Si una instructora no puede dar su clase, Tentare busca quién la cubre y se lo pide por orden; de serie, con tu visto bueno.',
    resumen:
      'Una instructora avisa desde la app (o lo marcas tú) de que no puede dar su clase y Tentare busca por orden a las que encajan hasta que una dice que sí. Si no queda nadie, te lo dice para que decidas tú.',
    ahorra: 'La cadena de WhatsApps a las once de la noche buscando quién cubre mañana.',
    destino: { categoria: 'instructores', slug: 'sustituciones' },
  },

  // Módulo del panel nuevo (14-oct-2026): sin `valor` mientras no esté en el
  // menú de todos (su frase de Módulos vive en lib/nav-panel-nuevo.ts). La guía
  // es la de los cierres: «Cerrar ese día» es un cierre de un día.
  '/festivos': {
    titulo: 'Festivos',
    resumen:
      'Los festivos oficiales de tu comunidad ya están, sacados del boletín por la dirección de tu estudio; las fiestas locales las buscas con IA y eliges cuáles añadir. Para cada festivo con clases decides si abres o cierras.',
    ahorra: 'Buscar cada año el calendario laboral y descubrir el día antes que tenías clases un festivo.',
    destino: { categoria: 'configuracion', slug: 'cierres-del-centro' },
  },

  '/informes': {
    titulo: 'Informes',
    valor: 'Cuánto has cobrado, cómo se llena cada clase y quién viene, frente al periodo anterior. Sin montar un Excel.',
    resumen:
      'Las cifras del estudio sin montar un Excel: cuánto has cobrado, cómo se llena cada clase y quién viene, frente al mismo tramo del periodo anterior. Sale todo de lo que ya pasa en Tentare, no hay que meter nada.',
    ahorra: 'Decidir a ojo qué franja abrir y qué clase quitar.',
    destino: { categoria: 'informes', slug: 'informes-disponibles' },
  },

  '/cierre': {
    titulo: 'Cierre de año',
    valor: 'Lo que facturaste en el año y el IVA repercutido, cuadrado y listo para tu gestoría. No presenta impuestos: te deja las cifras listas.',
    resumen:
      'Todo lo que facturaste en el año y el IVA que repercutiste, cuadrado y listo para tu gestoría. Sale de tus facturas ya selladas, así que no hay nada que rehacer.',
    ahorra: 'El Excel de enero y las llamadas de la gestoría pidiendo papeles.',
    destino: { categoria: 'pagos', slug: 'cierre-de-ano' },
  },

  '/libreta': {
    titulo: 'Libreta de clientas',
    valor: 'Una hoja para imprimir o guardar en PDF con cada clienta activa, su plan, lo que le queda y su clase fija. Por si cae internet.',
    resumen:
      'Tus clientas en una hoja para imprimir, siempre al día. La sacas en papel o la guardas en PDF y la tienes a mano aunque te quedes sin internet.',
    ahorra: 'Quedarte sin saber a quién llamar el día que se cae la wifi.',
    destino: { categoria: 'clientes', slug: 'la-libreta' },
  },

  '/migracion': {
    titulo: 'Traer mis datos',
    valor: 'Trae tus clientas y sus bonos del programa que usabas (Bsport, Momence u otro).',
    resumen:
      'Trae tu estudio desde el programa que usabas antes: arrastras lo que tengas, repasas el plan y confirmas. No se aplica nada hasta que lo apruebas, y se puede deshacer.',
    ahorra: 'Volver a teclear tus clientas y sus bonos una por una.',
    destino: { categoria: 'clientes', slug: 'importar-clientes' },
  },

  // Vistas de Configuración con tutorial: su clave es su URL canónica
  // (`hrefDeLugar`). El ⓘ no las ve (busca por pathname); el «?», sí.
  '/configuracion?tab=clases&abrir=tipos-de-clase': {
    titulo: 'Tipos de clase',
    resumen:
      'Lo que ofreces: Reformer, Suelo, Embarazadas… con su duración y sus plazas. De aquí sale tu horario, y cada tipo puede tener sus propias reglas de reserva.',
    ahorra: 'Repetir la duración y las plazas cada vez que programas una clase.',
    destino: { categoria: 'reservas', slug: 'reglas-de-reserva-por-clase' },
    tutorial: { version: 1 },
  },

  '/configuracion?tab=reservas': {
    titulo: 'Cómo reservan mis alumnas',
    resumen:
      'Las reglas de tu estudio para reservar, cancelar y la lista de espera. Valen para todas las clases, salvo las que cambie un tipo de clase.',
    ahorra: 'Explicar a cada alumna, una por una, hasta cuándo puede cancelar.',
    destino: { categoria: 'reservas', slug: 'reglas-de-reserva-por-clase' },
    tutorial: { version: 1 },
  },

  '/configuracion': {
    titulo: 'Configuración',
    valor: 'Las reglas de tu estudio: salas, tipos de clase, cómo reservan y cancelan tus alumnas, cómo cobras y qué ven en su app.',
    resumen:
      'Cómo funciona tu estudio, por preguntas: tus datos y salas, tus clases, cómo reservan tus alumnas, cómo cobras y qué ven en su app. Se toca poco, pero de aquí salen las reglas del resto.',
    ahorra: 'Repetir la misma configuración cada vez que creas una clase.',
    destino: { categoria: 'configuracion', slug: 'datos-del-estudio' },
  },

  '/actualizaciones': {
    titulo: 'Actualizaciones',
    valor: 'Lo nuevo, lo mejorado y lo corregido en Tentare, versión a versión y sin tecnicismos.',
    resumen:
      'Todo lo que ha cambiado en Tentare, versión a versión: lo que es nuevo, lo que hemos mejorado y lo que hemos corregido. Publicamos casi cada semana y aquí queda el registro completo, contado sin tecnicismos.',
    ahorra: 'Enterarte de una función nueva meses después de tenerla.',
    destino: { categoria: 'empezar', slug: 'primera-semana-de-clases' },
  },
  '/notificaciones': {
    titulo: 'Notificaciones',
    resumen:
      'El registro de los avisos que Tentare ha enviado en tu nombre: a qué perfil, por qué canal y si llegó. Si algo no salió, aquí tienes el motivo y el botón para reintentarlo.',
    ahorra: 'Fiarte de que el recordatorio salió sin poder comprobarlo.',
    destino: { categoria: 'automatizaciones', slug: 'registro-de-envios' },
  },

  '/automatizaciones': {
    titulo: 'Automatizaciones',
    valor: 'Lo que sale solo, como el recordatorio de clase, y reglas que enciendes tú, como escribir a quien lleva días sin venir.',
    resumen:
      'Lo que Tentare ya hace de serie —recordar la clase, avisar de un bono que se acaba, reintentar un cobro que falló— y las reglas que enciendes tú. Lo que mueve dinero te pide siempre el visto bueno.',
    ahorra: 'Acordarte tú de cada aviso, todos los días.',
    destino: { categoria: 'automatizaciones', slug: 'recordatorios-automaticos' },
  },

  '/suscripcion': {
    titulo: 'Suscripción',
    valor: 'Lo que pagas tú a Tentare: tu plan, tus facturas y tu tarjeta. Lo que cobras a tus alumnas va en Cobros.',
    resumen:
      'Lo que le pagas tú a Tentare: tu plan, tus facturas y la tarjeta con la que se cobra. Nada que ver con lo que cobras a tus alumnas, que va por Cobros.',
    ahorra: 'Confundir tu cuota con el dinero de tu estudio.',
    destino: { categoria: 'pagos', slug: 'prueba-de-7-dias' },
  },

  '/mi-perfil': {
    titulo: 'Mi perfil',
    resumen:
      'Tu nombre, tu foto y cómo entras a tu cuenta. Si das clase, también tu disponibilidad, tus ausencias y los estudios en los que trabajas.',
    ahorra: 'Pedirle a otra persona que te cambie tus propios datos.',
    destino: { categoria: 'instructores', slug: 'disponibilidad-y-tarifas' },
  },
} satisfies Record<string, AyudaPantalla>;

type Catalogo = typeof AYUDA_POR_PANTALLA;

/** Las pantallas con tutorial: las claves del catálogo cuya ficha lleva `tutorial`. */
export type RutaConTutorial = { [K in keyof Catalogo]: Catalogo[K] extends { tutorial: unknown } ? K : never }[keyof Catalogo];

const CATALOGO: Record<string, AyudaPantalla> = AYUDA_POR_PANTALLA;

/** Sin la barra final: Next entrega '/equipo' y '/equipo/' según de dónde venga la navegación, y no son dos pantallas. */
function sinBarraFinal(ruta: string): string {
  return ruta.length > 1 && ruta.endsWith('/') ? ruta.slice(0, -1) : ruta;
}

/**
 * La frase de un módulo del menú que no tiene ficha: añadirle una pondría su
 * ⓘ en la pantalla (PageHeader lo busca por la ruta), y eso es otro cambio.
 */
const VALOR_SIN_FICHA: Record<string, string> = {
  '/centro-de-control': 'Cuando algo de tu estudio merece tu atención, te lo dice en una frase y con tus datos detrás. Si no hay nada, no te molesta.',
};

/** La frase de valor de un módulo del menú (ficha o, si no la tiene, `VALOR_SIN_FICHA`). */
export function valorDeModulo(ruta: string): string | undefined {
  return CATALOGO[sinBarraFinal(ruta)]?.valor ?? VALOR_SIN_FICHA[ruta];
}

/** La ayuda de una ruta EXACTA. `undefined` si esa pantalla no tiene ficha. */
export function ayudaDePantalla(ruta: string | null | undefined): AyudaPantalla | undefined {
  if (!ruta) return undefined;
  return CATALOGO[sinBarraFinal(ruta)];
}

/** La versión del tutorial de esa pantalla (ruta o URL canónica de Configuración). `null` = no tiene. */
export function tutorialDePantalla(ruta: string | null | undefined): { ruta: RutaConTutorial; version: number } | null {
  if (!ruta) return null;
  const clave = sinBarraFinal(ruta);
  const t = CATALOGO[clave]?.tutorial;
  return t ? { ruta: clave as RutaConTutorial, version: t.version } : null;
}

export function urlDeAyuda(destino: DestinoAyuda): string {
  return destino.slug ? `/ayuda/${destino.categoria}/${destino.slug}` : `/ayuda/${destino.categoria}`;
}
