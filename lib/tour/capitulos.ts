// ─────────────────────────────────────────────────────────────────────────────
// La visita guiada: 10 capítulos, el panel entero, en el orden en que una
// propietaria nueva los necesita.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Una propietaria nueva creó 4 tarifas y una serie de clases el primer día y se
// atascó en lo que lo une todo: asignar la tarifa a una clienta y decir qué
// clases cubre. Escribió «no me está resultando fácil». El currículo de
// «Primeros pasos» (lib/guia/curriculo.ts) lo explica por escrito; esto lo
// explica DENTRO de las pantallas, señalando cada cosa donde está.
//
// ── Reglas al escribir aquí ──────────────────────────────────────────────────
// 1. Solo lo que EXISTE y no está congelado (lib/frozen-features.ts). Nada de
//    Kiosko, Oferta digital, Chat de equipo ni Tentare Network: lo vigila
//    `capitulos.test.ts`.
// 2. Los nombres de las pantallas son los del menú de verdad (lib/nav-config.ts)
//    y los de las secciones de Configuración (lib/configuracion/secciones.ts).
//    Un nombre inventado manda a buscar algo que no está.
// 3. Cada paso dice el QUÉ y, sobre todo, el PORQUÉ. «Ve a Calendario» no
//    convence a nadie; «sin clases, tu página de reservas no tiene nada que
//    enseñar» sí.
// 4. Un paso «hacer» se da por cumplido cuando cambian los DATOS REALES
//    (lib/tour/hecho.ts), no cuando se pulsa un botón. Ningún paso crea datos
//    por ti: nada de clientas de mentira.
// 5. Tuteo, cálido, sin jerga ni relleno. Es la primera hora de alguien con tu
//    producto.
//
// Puro y sin React: se prueba con `node --test`.
// ─────────────────────────────────────────────────────────────────────────────

/** `mira`: se cierra con «Entendido». `hacer`: se cierra solo al cambiar los datos. */
export type TipoPaso = 'mira' | 'hacer';

/** Qué dato real cierra un paso «hacer». Cada clave la calcula `lib/tour/hecho.ts`. */
export type ClaveHecho =
  | 'salas' | 'tiposClase' | 'sesiones' | 'socios' | 'tarifaActiva'
  | 'planAsignado' | 'datosFiscales' | 'instructores' | 'logo';

export interface PasoVisita {
  /** `c5.4`: capítulo y orden. Es lo que se guarda en el progreso. */
  id: string;
  /**
   * La ruta donde está el elemento, sin query. `/clientas/*` = la ficha de
   * cualquier clienta (el «Llévame» abre la primera).
   */
  ruta: string;
  /** Adónde lleva «Llévame», con su `?tab=` o `&abrir=`. Por defecto, `ruta`. */
  href?: string;
  /** El valor de `data-tour` de la pantalla. */
  selector: string;
  tipo: TipoPaso;
  /** Solo en `hacer`. */
  hecho?: ClaveHecho;
  /** El paso solo tiene sentido si ya existe esto; si no, se ofrece el paso previo. */
  requiere?: 'socios';
  /** Con pantalla estrecha el elemento no existe (el buscador de arriba): se omite. */
  soloEscritorio?: true;
  titulo: string;
  texto: string;
}

export interface CapituloVisita {
  id: string;
  titulo: string;
  /** Lo que sale en la pantalla de capítulo completado, a modo de repaso. */
  aprendido: string[];
  minutos: number;
  pasos: PasoVisita[];
}

export const CAPITULOS: readonly CapituloVisita[] = [
  {
    id: 'c1',
    titulo: 'El mapa',
    minutos: 3,
    aprendido: ['dónde está cada cosa en el menú', 'qué ves cada mañana en tu Resumen', 'cómo encontrar cualquier cosa con el buscador'],
    pasos: [
      {
        id: 'c1.1', ruta: '/dashboard', selector: 'menu-principal', tipo: 'mira',
        titulo: 'Tu menú',
        texto: 'Arriba, lo de hoy. «Operación» es lo de cada día: calendario, citas, clientas. «Equipo», «Negocio» y «Estudio» son lo que tocas de vez en cuando. En el móvil, lo que no cabe está en «Más».',
      },
      {
        id: 'c1.2', ruta: '/dashboard', selector: 'resumen-vista', tipo: 'mira',
        titulo: 'Tu Resumen',
        texto: 'Las clases de hoy y lo que espera tu visto bueno. Es lo primero que mirarás cada mañana: si aquí está todo en orden, el estudio también.',
      },
      {
        id: 'c1.3', ruta: '/dashboard', selector: 'buscador', tipo: 'mira', soloEscritorio: true,
        titulo: 'El buscador',
        texto: 'Pulsa ⌘K (o Ctrl+K) y escribe dos palabras: «IVA», «bono», el nombre de una clienta. Te lleva ahí. Cuando no sepas dónde está algo, empieza por aquí.',
      },
    ],
  },
  {
    id: 'c2',
    titulo: 'Tu estudio y tus clases',
    minutos: 5,
    aprendido: ['dónde se decide cómo funciona tu estudio', 'qué es una sala y por qué su aforo importa', 'qué es un tipo de clase'],
    pasos: [
      {
        id: 'c2.1', ruta: '/configuracion', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Configuración, por preguntas',
        texto: 'Tu estudio, tus clases, cómo reservan tus alumnas, cómo cobras, tu marca. Aquí decides una vez y se aplica en todo lo demás. Las tarifas no están aquí: viven en «Paquetes».',
      },
      {
        id: 'c2.2', ruta: '/configuracion', href: '/configuracion?tab=estudio&abrir=salas', selector: 'configuracion-vista', tipo: 'hacer', hecho: 'salas',
        titulo: 'Tus salas',
        texto: 'Crea una sala por cada espacio donde das clase. Su aforo es el tope de plazas de cada clase que se dé en ella, así que ponle la cifra real.',
      },
      {
        id: 'c2.3', ruta: '/configuracion', href: '/configuracion?tab=estudio', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Tu horario de apertura',
        texto: 'En «Mi estudio», la fila «Horario». No crea clases: le dice al calendario qué días cierras, para que un lunes sin clases se lea «cerrado» y no «libre».',
      },
      {
        id: 'c2.4', ruta: '/configuracion', href: '/configuracion?tab=clases&abrir=tipos-de-clase', selector: 'configuracion-vista', tipo: 'hacer', hecho: 'tiposClase',
        titulo: 'Tus tipos de clase',
        texto: 'Reformer, Suelo, Embarazadas… Cada tipo lleva su duración y sus plazas. Son el catálogo del que sale tu horario: sin tipos de clase no se puede programar nada.',
      },
    ],
  },
  {
    id: 'c3',
    titulo: 'Tu horario',
    minutos: 6,
    aprendido: ['cómo programar una clase o una serie', 'qué se puede hacer desde la ficha de una clase', 'cómo mover una clase arrastrándola'],
    pasos: [
      {
        id: 'c3.1', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'El calendario',
        texto: 'Cada bloque es una clase y su color es la sala. Desde aquí lo organizas todo: qué se da, cuándo, con quién y cuánta gente viene.',
      },
      {
        id: 'c3.2', ruta: '/calendario', selector: 'calendario-nueva-clase', tipo: 'hacer', hecho: 'sesiones',
        titulo: 'Programa tus clases',
        texto: 'Pulsa «Nueva clase». Si se repite cada semana, márcalo y se crean todas de golpe. Una alumna solo puede reservar lo que está en el calendario.',
      },
      {
        id: 'c3.3', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'Abre una clase',
        texto: 'Al pulsar una clase ves quién viene, apuntas a alguien, pasas lista, cambias de instructora o la cancelas. Es la ficha de la clase.',
      },
      {
        id: 'c3.4', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'Muévela arrastrando',
        texto: 'En el ordenador o la tablet, arrastra una clase a otra hora o a otro día. En el móvil se cambia abriéndola. Si tienes los avisos activados, a quien ya estaba apuntada se le avisa del cambio.',
      },
      {
        id: 'c3.5', ruta: '/citas', selector: 'citas-vista', tipo: 'mira',
        titulo: 'Citas individuales',
        texto: 'Sesiones de una en una con una instructora: una clase privada, una valoración. Los servicios que ofreces se definen en Configuración → Mis clases y citas.',
      },
    ],
  },
  {
    id: 'c4',
    titulo: 'Tus clientas',
    minutos: 5,
    aprendido: ['qué significa cada estado de una clienta', 'cómo dar de alta una clienta o traer las de otro programa', 'qué hay en su ficha'],
    pasos: [
      {
        id: 'c4.1', ruta: '/clientas', selector: 'clientas-lista', tipo: 'mira',
        titulo: 'Todas tus clientas',
        texto: 'Cada una con su estado: «Activa» es la que tiene un plan en marcha. Aquí buscas, filtras y les escribes. Quien solo ha preguntado no es una ficha: vive en tus consultas.',
      },
      {
        id: 'c4.2', ruta: '/clientas', href: '/clientas?nuevo=1', selector: 'clientas-nueva', tipo: 'hacer', hecho: 'socios',
        titulo: 'Añade una clienta de verdad',
        texto: 'Nombre y email bastan. Una clienta real, no una de prueba: así ves tu estudio como lo verás en serio. ¿Vienes de otro programa? «Traer mis datos», en el menú «Estudio», sube todas de una vez.',
      },
      {
        id: 'c4.3', ruta: '/clientas/*', selector: 'ficha-clienta', tipo: 'mira', requiere: 'socios',
        titulo: 'Su ficha',
        texto: 'Su plan, su asistencia, sus cobros y sus notas, todo en un solo sitio. Cuando una alumna te escriba con una duda, esta es la pantalla que abres.',
      },
    ],
  },
  {
    id: 'c5',
    titulo: 'Tarifas: qué vendes, a quién y para qué clases',
    minutos: 7,
    aprendido: ['por qué una tarifa en borrador no existe para tus clientas', 'qué clases cubre cada tarifa', 'cómo asignarle una tarifa a una clienta'],
    pasos: [
      {
        id: 'c5.1', ruta: '/productos', selector: 'paquetes-vista', tipo: 'mira',
        titulo: 'Aquí viven tus tarifas',
        texto: 'En «Paquetes» está todo lo que vendes. Una suscripción se cobra sola cada mes; un bono es un puñado de sesiones que se gastan; una clase suelta se compra de una en una.',
      },
      {
        id: 'c5.2', ruta: '/productos', selector: 'paquetes-vista', tipo: 'hacer', hecho: 'tarifaActiva',
        titulo: 'Una tarifa en borrador no existe para tus clientas',
        texto: 'Ponle precio y actívala. Hasta entonces nadie puede comprarla ni tú asignársela. Si el asistente de alta te dejó tarifas a 0 €, son borradores: ábrelas y termínalas.',
      },
      {
        id: 'c5.3', ruta: '/productos', selector: 'paquetes-vista', tipo: 'mira',
        titulo: '¿Qué clases cubre cada tarifa?',
        texto: 'Abre una tarifa y mira «Clases incluidas»: todas, o solo algunas. Así un bono de Reformer no vale para Suelo. Si no marcas nada, vale para todas. Es la pieza que une tus tarifas con tus clases.',
      },
      {
        id: 'c5.4', ruta: '/clientas/*', selector: 'ficha-plan', tipo: 'hacer', hecho: 'planAsignado', requiere: 'socios',
        titulo: 'Asígnale una tarifa a una clienta',
        texto: 'En su ficha, «Asignar plan» y eliges la tarifa. Desde ese momento tiene plan y puede reservar lo que esa tarifa cubre.',
      },
      {
        id: 'c5.5', ruta: '/clientas/*', selector: 'ficha-plan', tipo: 'mira', requiere: 'socios',
        titulo: 'Su plan, a la vista',
        texto: 'Lo que tiene contratado y en qué estado está. Desde aquí lo cambias, lo pausas o lo cancelas, sin tocar nada más.',
      },
      {
        id: 'c5.6', ruta: '/configuracion', href: '/configuracion?tab=reservas', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Lo que lo une todo',
        texto: 'En «Cómo reservan mis alumnas», la fila «Reservar» dice si hace falta plan para reservar. Si lo exiges, una clienta solo reserva las clases que cubre su tarifa. Si alguna no puede reservar, mira primero su plan y sus «Clases incluidas».',
      },
    ],
  },
  {
    id: 'c6',
    titulo: 'Reservas y cobros',
    minutos: 8,
    aprendido: ['dónde está tu enlace de reservas', 'qué reglas puedes poner a las reservas', 'cómo cobrar en el mostrador y con tarjeta'],
    pasos: [
      {
        id: 'c6.1', ruta: '/configuracion', href: '/configuracion?tab=web', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Tu página de reservas',
        texto: 'En «Mi app y mi web» tienes tu enlace y su QR. Ponlos en tu Instagram, en WhatsApp o en la puerta del estudio: es por donde reservarán tus alumnas.',
      },
      {
        id: 'c6.2', ruta: '/configuracion', href: '/configuracion?tab=reservas', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Las reglas del juego',
        texto: 'Con cuánta antelación se reserva, hasta cuándo se cancela sin perder la sesión y qué pasa si la clase está llena. Cada tipo de clase puede tener las suyas.',
      },
      {
        id: 'c6.3', ruta: '/cobros', selector: 'cobros-vista', tipo: 'mira',
        titulo: 'Cobros',
        texto: 'Lo que está pendiente de cobrar y lo que ya se cobró. Con Stripe conectado, las cuotas se cobran solas; lo que no se pueda cobrar te lo marca aquí.',
      },
      {
        id: 'c6.4', ruta: '/configuracion', href: '/configuracion?tab=cobros#integracion-stripe', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Stripe, cuando quieras',
        texto: 'Sirve para cobrar con tarjeta por internet. No lo necesitas para recibir reservas: puedes cobrar en el mostrador y apuntarlo. Conéctalo cuando quieras que las cuotas se cobren solas.',
      },
      {
        id: 'c6.5', ruta: '/configuracion', href: '/configuracion?tab=cobros#datos-fiscales', selector: 'configuracion-vista', tipo: 'hacer', hecho: 'datosFiscales',
        titulo: 'Tus datos fiscales',
        texto: 'En «Cobros y facturas», «Datos fiscales e IVA»: razón social y NIF. Sin ellos no sale ninguna factura. Si ahora no los tienes a mano, puedes aplazarlo y te lo recordamos al final.',
      },
      {
        id: 'c6.6', ruta: '/pos', selector: 'pos-vista', tipo: 'mira',
        titulo: 'La Caja',
        texto: 'Para vender en el mostrador un bono, un producto o una clase suelta. La venta queda registrada en tus cobros.',
      },
    ],
  },
  {
    id: 'c7',
    titulo: 'Tu equipo',
    minutos: 4,
    aprendido: ['quién ve qué en el panel', 'por qué toda clase necesita una instructora', 'cómo funcionan las sustituciones'],
    pasos: [
      {
        id: 'c7.1', ruta: '/equipo', selector: 'equipo-vista', tipo: 'mira',
        titulo: 'Tu equipo',
        texto: 'Propietaria, responsable de sede, recepción e instructoras, cada una con lo que le toca ver. Las instructoras no entran a este panel: trabajan desde la app de tu estudio.',
      },
      {
        id: 'c7.2', ruta: '/equipo', selector: 'equipo-vista', tipo: 'hacer', hecho: 'instructores',
        titulo: 'Date de alta si das clase tú',
        texto: 'Toda clase necesita a alguien asignado. Si das clase tú, añádete como instructora; si tienes equipo, invítalas con su email.',
      },
      {
        id: 'c7.3', ruta: '/equipo', selector: 'equipo-vista', tipo: 'mira',
        titulo: 'Su disponibilidad',
        texto: 'Cada instructora marca cuándo puede trabajar. Así Tentare sabe a quién proponer cuando hay una baja y no llama a quien no puede.',
      },
      {
        id: 'c7.4', ruta: '/sustituciones', selector: 'sustituciones-vista', tipo: 'mira',
        titulo: 'Sustituciones',
        texto: 'Cuando una instructora no puede venir, Tentare propone quién la cubre y por qué. Tú das el visto bueno, o lo dejas en automático si prefieres no enterarte.',
      },
    ],
  },
  {
    id: 'c8',
    titulo: 'Que el estudio trabaje solo',
    minutos: 6,
    aprendido: ['qué se hace solo y qué decides tú', 'dónde hablas con tus alumnas', 'dónde se preparan campañas'],
    pasos: [
      {
        id: 'c8.1', ruta: '/automatizaciones', selector: 'automatizaciones-vista', tipo: 'mira',
        titulo: 'Automatizaciones',
        texto: 'Recuperar a quien deja de venir, acompañar a las nuevas… funcionando solas cuando las activas. Los recordatorios de clase ya salen solos, no hay que encenderlos.',
      },
      {
        id: 'c8.2', ruta: '/centro-de-control', selector: 'centro-de-control-vista', tipo: 'mira',
        titulo: 'Centro de Control',
        texto: 'Cada día, como mucho una cosa que merece tu atención, con el porqué. Si no hay nada, no te molesta. El resto del detalle lo tienes debajo, por si quieres mirarlo.',
      },
      {
        id: 'c8.3', ruta: '/mensajeria', selector: 'mensajeria-vista', tipo: 'mira',
        titulo: 'Mensajería',
        texto: 'Hablas con tus alumnas y publicas en el tablón de tu comunidad. Lo que escribas aquí les llega a su app.',
      },
      {
        id: 'c8.4', ruta: '/marketing', selector: 'marketing-vista', tipo: 'mira',
        titulo: 'Marketing',
        texto: 'Campañas y contenido para tus redes. No corre prisa: empieza por una cuando el estudio ya ruede.',
      },
    ],
  },
  {
    id: 'c9',
    titulo: 'Tu marca y tu app',
    minutos: 5,
    aprendido: ['cómo ponerle tu logo y tu color a todo', 'cómo se ve la app de tus alumnas', 'qué correos salen solos y cómo apagarlos'],
    pasos: [
      {
        id: 'c9.1', ruta: '/configuracion', href: '/configuracion?tab=marca', selector: 'configuracion-vista', tipo: 'hacer', hecho: 'logo',
        titulo: 'Tu logo y tu color',
        texto: 'Es lo primero que ve una alumna: su app y tu página de reservas llevan tu marca, no la nuestra. Sube tu logo en «Marca».',
      },
      {
        id: 'c9.2', ruta: '/configuracion', href: '/configuracion?tab=marca', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'La app de tus alumnas',
        texto: 'En «Marca», «Apariencia de tu app»: el estilo, la tipografía y la portada, que ves en un móvil antes de publicar. Tus alumnas la instalan desde tu enlace.',
      },
      {
        id: 'c9.3', ruta: '/configuracion', href: '/configuracion?tab=comunicacion', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Correos automáticos',
        texto: 'En «Cómo me comunico»: bienvenida, reserva, recordatorio, cancelación… Apaga los que no quieras o cambia lo que dicen.',
      },
      {
        id: 'c9.4', ruta: '/configuracion', href: '/configuracion?tab=motivacion', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Créditos, logros y retos',
        texto: 'En «Motivación»: premian la constancia de tus alumnas con créditos, logros y retos. Es opcional; déjalo para cuando el estudio ya ruede.',
      },
    ],
  },
  {
    id: 'c10',
    titulo: 'Tus números y tu cuenta',
    minutos: 4,
    aprendido: ['dónde ver cómo va el negocio', 'dónde está el cierre de año para tu gestoría', 'cómo ver tu prueba y tu plan'],
    pasos: [
      {
        id: 'c10.1', ruta: '/informes', selector: 'informes-vista', tipo: 'mira',
        titulo: 'Informes',
        texto: 'Ingresos, ocupación y qué clases dan dinero de verdad. Para decidir con datos y no a ojo.',
      },
      {
        id: 'c10.2', ruta: '/cierre', selector: 'cierre-vista', tipo: 'mira',
        titulo: 'Cierre de año',
        texto: 'Lo facturado y el IVA del año, listo para tu gestoría. Sin hojas de cálculo.',
      },
      {
        id: 'c10.3', ruta: '/dashboard', selector: 'pildora-prueba', tipo: 'mira',
        titulo: 'Tu prueba de 7 días',
        texto: 'Esta píldora de arriba cuenta los días que te quedan. Al pulsarla ves tu plan y desde ahí pasas a pago cuando quieras: sin prisas y sin sorpresas.',
      },
      {
        id: 'c10.4', ruta: '/primeros-pasos', selector: 'guia-vista', tipo: 'mira',
        titulo: 'Dónde seguir',
        texto: 'Todo lo que has visto está explicado por escrito en «Primeros pasos», por si quieres repasarlo con calma. Y siempre puedes escribirnos.',
      },
    ],
  },
];

export const TODOS_LOS_PASOS: readonly PasoVisita[] = CAPITULOS.flatMap(c => c.pasos);

export function capituloDe(pasoId: string): CapituloVisita | undefined {
  return CAPITULOS.find(c => pasoId.startsWith(`${c.id}.`));
}

export function pasoPorId(id: string): PasoVisita | undefined {
  return TODOS_LOS_PASOS.find(p => p.id === id);
}

/** ¿Esta ruta del navegador es la del paso? `/clientas/*` casa con cualquier ficha. */
export function rutaCoincide(rutaPaso: string, pathname: string): boolean {
  if (rutaPaso.endsWith('/*')) {
    const base = rutaPaso.slice(0, -2);
    return pathname.startsWith(`${base}/`) && pathname.length > base.length + 1;
  }
  return pathname === rutaPaso;
}

/** La ruta sin `/*`, para preguntarle a los permisos si esta persona ve esa pantalla. */
export function rutaBase(rutaPaso: string): string {
  return rutaPaso.endsWith('/*') ? rutaPaso.slice(0, -2) : rutaPaso;
}

export const MINUTOS_TOTALES = CAPITULOS.reduce((n, c) => n + c.minutos, 0);
