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
  destino: DestinoAyuda;
}

export const AYUDA_POR_PANTALLA: Record<string, AyudaPantalla> = {
  '/dashboard': {
    titulo: 'Inicio',
    resumen:
      'Lo que tienes hoy delante: las clases del día, quién ha reservado, qué falta por cobrar y a quién conviene escribir. Es la pantalla con la que se abre el estudio por la mañana.',
    ahorra: 'Mirar en cuatro sitios distintos para saber cómo va el día.',
    destino: { categoria: 'empezar', slug: 'primera-semana-de-clases' },
  },

  '/calendario': {
    titulo: 'Calendario',
    resumen:
      'Tu semana entera: cada clase con su instructora, su sala y las alumnas que han reservado. Creas una clase, la repites cada semana si quieres, y cualquier cambio les llega a ellas sin que avises una por una.',
    ahorra: 'El cuadrante en papel y el «¿quién viene hoy?» de cada mañana.',
    destino: { categoria: 'reservas', slug: 'crear-una-clase' },
  },

  '/citas': {
    titulo: 'Citas',
    resumen:
      'Las sesiones de una en una —la valoración inicial, fisio, un personal— con su propio hueco en la agenda, sin mezclarse con las clases de grupo.',
    ahorra: 'Llevar los uno a uno en otra agenda aparte y acabar pisando una clase.',
    destino: { categoria: 'reservas', slug: 'citas' },
  },

  '/clientas': {
    titulo: 'Clientas',
    resumen:
      'Todas tus alumnas en una lista: qué le queda a cada una, cuándo vino por última vez y quién lleva semanas sin aparecer. Abres una ficha y tienes su historial entero, sus bonos y tus notas.',
    ahorra: 'La libreta, y preguntar por WhatsApp «¿a esta le quedaban clases?».',
    destino: { categoria: 'clientes', slug: 'ficha-de-clienta' },
  },

  '/mensajeria': {
    titulo: 'Mensajería',
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
    resumen:
      'El dinero en un solo sitio: lo que está pendiente, lo que ya ha entrado y la factura de cada cobro. Si una tarjeta falla, aparece aquí con el motivo y el botón para volver a intentarlo.',
    ahorra: 'Perseguir pagos uno a uno y encontrarte el descuadre a fin de mes.',
    destino: { categoria: 'pagos', slug: 'la-pantalla-de-cobros' },
  },

  '/pos': {
    titulo: 'Caja',
    resumen:
      'El mostrador: cobras un bono, una clase suelta o un producto en el momento, con tarjeta o en efectivo, y queda registrado con su factura como cualquier otro cobro.',
    ahorra: 'Apuntar en una hoja lo que cobras a pie de mostrador para pasarlo luego.',
    destino: { categoria: 'pagos', slug: 'cobrar-en-la-caja' },
  },

  '/productos': {
    titulo: 'Paquetes',
    resumen:
      'Lo que vendes: cuotas mensuales, bonos de sesiones, clases sueltas y plazas fijas. Aquí pones el precio, cuánto dura, si se renueva solo y a qué clases da derecho.',
    ahorra: 'Explicar por WhatsApp qué incluye cada bono y llevar las caducidades a mano.',
    destino: { categoria: 'bonos', slug: 'tipos-de-bono' },
  },

  '/equipo': {
    titulo: 'Equipo',
    resumen:
      'Tus instructoras y quien esté en el mostrador: a quién das de alta, qué puede ver cada una, cuándo está disponible y cuánto cobra la hora. También las horas que ha dado cada una.',
    ahorra: 'Dar acceso a todo el mundo a todo, y cuadrar horas a mano para pagar.',
    destino: { categoria: 'instructores', slug: 'dar-de-alta-una-instructora' },
  },

  '/sustituciones': {
    titulo: 'Sustituciones',
    resumen:
      'Marcas que una instructora no puede dar su clase y Tentare avisa por orden a las que encajan —su disponibilidad, el tipo de clase, la hora a la que suele dar— hasta que una dice que sí.',
    ahorra: 'La cadena de WhatsApps a las once de la noche buscando quién cubre mañana.',
    destino: { categoria: 'instructores', slug: 'sustituciones' },
  },

  '/informes': {
    titulo: 'Informes',
    resumen:
      'Las cifras del estudio sin montar un Excel: cuánto entra, cómo se llena cada clase, quién repite y quién se está yendo. Sale todo de lo que ya pasa en Tentare, no hay que meter nada.',
    ahorra: 'Decidir a ojo qué franja abrir y qué clase quitar.',
    destino: { categoria: 'informes', slug: 'informes-disponibles' },
  },

  '/cierre': {
    titulo: 'Cierre de año',
    resumen:
      'Todo lo que facturaste en el año y el IVA que repercutiste, cuadrado y listo para tu gestoría. Sale de tus facturas ya selladas, así que no hay nada que rehacer.',
    ahorra: 'El Excel de enero y las llamadas de la gestoría pidiendo papeles.',
    destino: { categoria: 'pagos', slug: 'cierre-de-ano' },
  },

  '/libreta': {
    titulo: 'Libreta de clientas',
    resumen:
      'Tus clientas en una hoja para imprimir, siempre al día. La sacas en papel o la guardas en PDF y la tienes a mano aunque te quedes sin internet.',
    ahorra: 'Quedarte sin saber a quién llamar el día que se cae la wifi.',
    destino: { categoria: 'clientes', slug: 'la-libreta' },
  },

  '/migracion': {
    titulo: 'Traer mis datos',
    resumen:
      'Trae tu estudio desde el programa que usabas antes: arrastras lo que tengas, repasas el plan y confirmas. No se aplica nada hasta que lo apruebas, y se puede deshacer.',
    ahorra: 'Volver a teclear tus clientas y sus bonos una por una.',
    destino: { categoria: 'clientes', slug: 'importar-clientes' },
  },

  '/configuracion': {
    titulo: 'Configuración',
    resumen:
      'Los cimientos: tus datos fiscales, las salas, los tipos de clase, quién puede hacer qué y con qué se conecta Tentare. Se toca poco, pero de aquí salen las reglas del resto.',
    ahorra: 'Repetir la misma configuración cada vez que creas una clase.',
    destino: { categoria: 'configuracion', slug: 'datos-del-estudio' },
  },

  '/actualizaciones': {
    titulo: 'Actualizaciones',
    resumen:
      'Todo lo que ha cambiado en Tentare, versión a versión: lo que es nuevo, lo que hemos mejorado y lo que hemos corregido. Publicamos casi cada semana y aquí queda el registro completo, contado sin tecnicismos.',
    ahorra: 'Enterarte de una función nueva meses después de tenerla.',
    destino: { categoria: 'empezar', slug: 'primera-semana-de-clases' },
  },
  '/notificaciones': {
    titulo: 'Notificaciones',
    resumen:
      'El registro de todo lo que Tentare ha enviado en tu nombre: a quién, por qué canal y si llegó. Si algo no salió, aquí tienes el motivo y el botón para reintentarlo.',
    ahorra: 'Fiarte de que el recordatorio salió sin poder comprobarlo.',
    destino: { categoria: 'automatizaciones', slug: 'registro-de-envios' },
  },

  '/automatizaciones': {
    titulo: 'Automatizaciones',
    resumen:
      'Lo que Tentare hace solo: recordar la clase, avisar de un bono que se acaba, reintentar un cobro que falló. Tú decides qué se ejecuta sin preguntar y qué te pide el visto bueno antes.',
    ahorra: 'Acordarte tú de cada aviso, todos los días.',
    destino: { categoria: 'automatizaciones', slug: 'recordatorios-automaticos' },
  },

  '/network/buscar': {
    titulo: 'Tentare Network',
    resumen:
      'El listado de instructoras de Pilates y Yoga que buscan estudio. Ves su experiencia, sus formaciones y cuándo puede dar clase cada una, y le escribes desde aquí.',
    ahorra: 'Publicar una oferta y quedarte esperando a ver quién aparece.',
    destino: { categoria: 'instructores', slug: 'tentare-network' },
  },

  '/suscripcion': {
    titulo: 'Suscripción',
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
};

/** La ayuda de una ruta EXACTA. `undefined` si esa pantalla no tiene ficha. */
export function ayudaDePantalla(ruta: string | null | undefined): AyudaPantalla | undefined {
  if (!ruta) return undefined;
  // Sin la barra final: Next entrega '/equipo' y '/equipo/' según de dónde
  // venga la navegación, y no son dos pantallas.
  const limpia = ruta.length > 1 && ruta.endsWith('/') ? ruta.slice(0, -1) : ruta;
  return AYUDA_POR_PANTALLA[limpia];
}

export function urlDeAyuda(destino: DestinoAyuda): string {
  return destino.slug ? `/ayuda/${destino.categoria}/${destino.slug}` : `/ayuda/${destino.categoria}`;
}
