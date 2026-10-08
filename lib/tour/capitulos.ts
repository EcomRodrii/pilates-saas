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
  /**
   * Lo que se señala. Un valor de `data-tour` de la pantalla, o `#id` si es un
   * elemento con id propio (las filas de Configuración: `#salas`, `#horario`…).
   */
  selector: string;
  tipo: TipoPaso;
  /** Solo en `hacer`. */
  hecho?: ClaveHecho;
  /** El paso solo tiene sentido si ya existe esto; si no, se ofrece el paso previo. */
  requiere?: 'socios';
  /**
   * El paso solo existe mientras haya prueba gratuita en marcha (la píldora de los días que quedan no
   * se pinta en un estudio que ya paga). Sin esto, a quien ya paga se le señalaría algo que no está.
   */
  soloEnPrueba?: true;
  /** Con pantalla estrecha el elemento no existe (el buscador de arriba): se omite. */
  soloEscritorio?: true;
  titulo: string;
  /** Por qué importa y qué es: una o dos frases. */
  texto: string;
  /** Lo que hay que HACER o MIRAR ahora, en una línea. Es lo que mueve a la persona. */
  accion: string;
  /**
   * Solo en los «hacer»: qué se le dice a quien YA lo tiene hecho al llegar. Pedirle «añade tu primera
   * sala» a quien tiene cuatro es absurdo; se le explica dónde está y se le deja leer a su ritmo.
   */
  accionSiYaLoTienes?: string;
}

export interface CapituloVisita {
  id: string;
  titulo: string;
  /** Para qué sirve el capítulo, en una frase: lo que se lee al abrirlo. */
  paraQue: string;
  /** Lo que sale en la pantalla de capítulo completado, a modo de repaso. */
  aprendido: string[];
  minutos: number;
  pasos: PasoVisita[];
}

export const CAPITULOS: readonly CapituloVisita[] = [
  {
    id: 'c1',
    titulo: 'El mapa',
    paraQue: 'Para que no te pierdas: dónde está cada cosa y cómo encontrar lo que busques.',
    minutos: 3,
    aprendido: ['dónde está cada cosa en el menú', 'qué ves cada mañana en tu Resumen', 'cómo encontrar cualquier cosa con el buscador'],
    pasos: [
      {
        id: 'c1.1', ruta: '/dashboard', selector: 'menu-principal', tipo: 'mira',
        titulo: 'Tu menú',
        texto: 'Todo el panel cuelga de aquí. «Operación» es lo de cada día: calendario, citas, clientas. «Equipo», «Negocio» y «Estudio» son lo que tocas de vez en cuando.',
        accion: 'Mira el menú de la izquierda. En el móvil, la barra de abajo; lo que no cabe está en «Más».',
      },
      {
        id: 'c1.2', ruta: '/dashboard', selector: 'resumen-vista', tipo: 'mira',
        titulo: 'Tu Resumen',
        texto: 'Las clases de hoy y todo lo que espera tu visto bueno. Es lo primero que mirarás cada mañana: si aquí está todo en orden, el estudio también.',
        accion: 'Mira las clases de hoy y las tarjetas de debajo.',
      },
      {
        id: 'c1.3', ruta: '/dashboard', selector: 'buscador', tipo: 'mira', soloEscritorio: true,
        titulo: 'El buscador',
        texto: 'Cuando no sepas dónde está algo, empieza por aquí. Escribe dos palabras —«IVA», «bono», el nombre de una clienta— y te lleva directa.',
        accion: 'Mira la barra de arriba: ahí escribes lo que buscas. El atajo es ⌘K (Ctrl+K en Windows).',
      },
    ],
  },
  {
    id: 'c2',
    titulo: 'Tu estudio y tus clases',
    paraQue: 'Para dejar listo el sitio donde darás clase: tus salas y los tipos de clase que ofreces.',
    minutos: 5,
    aprendido: ['dónde se decide cómo funciona tu estudio', 'qué es una sala y por qué su aforo importa', 'qué es un tipo de clase'],
    pasos: [
      {
        id: 'c2.1', ruta: '/configuracion', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Configuración, por preguntas',
        texto: 'Aquí decides cómo funciona tu estudio, una vez, y se aplica en todo lo demás. Cada sección responde a una pregunta: «Mi estudio», «Cómo reservan mis alumnas», «Cobros y facturas»…',
        accion: 'Mira las secciones de la izquierda. Las tarifas no están aquí: viven en «Paquetes».',
      },
      {
        id: 'c2.2', ruta: '/configuracion', href: '/configuracion?tab=estudio', selector: '#fila-herramienta-salas', tipo: 'hacer', hecho: 'salas',
        titulo: 'Tus salas',
        texto: 'Una sala es un espacio donde das clase. Su aforo es el tope de plazas de cada clase que se dé en ella, así que ponle la cifra real: es lo que impide que se reserve de más.',
        accion: 'Pulsa «Salas» y añade tu primera sala, con su aforo.',
        accionSiYaLoTienes: 'Ya tienes salas. Para cambiarlas o añadir otra, esta es la fila «Salas».',
      },
      {
        id: 'c2.3', ruta: '/configuracion', href: '/configuracion?tab=estudio', selector: '#horario', tipo: 'mira',
        titulo: 'Tu horario de apertura',
        texto: 'No crea clases: le dice al calendario qué días abres y cuáles cierras, para que un lunes sin clases se lea «cerrado» y no «libre».',
        accion: 'Mira la fila «Horario»: ahí marcas los días que cierras.',
      },
      {
        id: 'c2.4', ruta: '/configuracion', href: '/configuracion?tab=clases', selector: '#fila-herramienta-tipos-de-clase', tipo: 'hacer', hecho: 'tiposClase',
        titulo: 'Tus tipos de clase',
        texto: 'Reformer, Suelo, Embarazadas… Cada tipo lleva su duración y sus plazas. Son el catálogo del que sale tu horario: sin tipos de clase no se puede programar nada.',
        accion: 'Pulsa «Tipos de clase» y crea el primero: nombre, duración y plazas.',
        accionSiYaLoTienes: 'Ya tienes tipos de clase. Para cambiarlos o crear otro, esta es la fila «Tipos de clase».',
      },
    ],
  },
  {
    id: 'c3',
    titulo: 'Tu horario',
    paraQue: 'Para que tus alumnas tengan clases a las que apuntarse: sin clases, tu página de reservas no tiene nada que enseñar.',
    minutos: 6,
    aprendido: ['cómo programar una clase o una serie', 'qué se puede hacer desde la ficha de una clase', 'cómo mover una clase arrastrándola'],
    pasos: [
      {
        id: 'c3.1', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'El calendario',
        texto: 'Cada bloque es una clase y su color es la sala. Desde aquí lo organizas todo: qué se da, cuándo, con quién y cuánta gente viene.',
        accion: 'Míralo: si es tu primer día estará vacío. Ahora lo llenamos.',
      },
      {
        id: 'c3.2', ruta: '/calendario', selector: 'calendario-nueva-clase', tipo: 'hacer', hecho: 'sesiones',
        titulo: 'Programa tus clases',
        texto: 'Una alumna solo puede reservar lo que está en el calendario. Si la clase se repite cada semana, márcalo y se crean todas de golpe, sin repetir el trabajo.',
        accion: 'Pulsa «Crear clase» → «Clase» y elige tipo, sala, día y hora.',
        accionSiYaLoTienes: 'Ya tienes clases programadas. Para crear más, usa «Crear clase».',
      },
      {
        id: 'c3.3', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'Abre una clase',
        texto: 'Al pulsar una clase ves quién viene, apuntas a alguien, pasas lista, cambias de instructora o la cancelas. Es la ficha de la clase.',
        accion: 'Mira una clase en el calendario: al pulsarla se abre su ficha.',
      },
      {
        id: 'c3.4', ruta: '/calendario', selector: 'calendario-vista', tipo: 'mira',
        titulo: 'Muévela arrastrando',
        texto: 'En el ordenador o la tablet puedes cambiar una clase de hora o de día arrastrándola. En el móvil se cambia abriéndola. Si tienes los avisos activados, a quien ya estaba apuntada se le avisa.',
        accion: 'Mira una clase: se coge con el ratón y se suelta en otra hora. No hace falta que lo hagas ahora.',
      },
      {
        id: 'c3.5', ruta: '/citas', selector: 'citas-vista', tipo: 'mira',
        titulo: 'Citas individuales',
        texto: 'Sesiones de una en una con una instructora: una clase privada, una valoración. Los servicios que ofreces se definen en Configuración → Mis clases y citas.',
        accion: 'Mira cómo se ve la agenda de citas.',
      },
    ],
  },
  {
    id: 'c4',
    titulo: 'Tus clientas',
    paraQue: 'Para tener a quién venderle una tarifa: sin clientas no hay nada que asignar.',
    minutos: 5,
    aprendido: ['qué significa cada estado de una clienta', 'cómo dar de alta una clienta o traer las de otro programa', 'qué hay en su ficha'],
    pasos: [
      {
        id: 'c4.1', ruta: '/clientas', selector: 'clientas-lista', tipo: 'mira',
        titulo: 'Todas tus clientas',
        texto: 'Cada una con su estado: «Activa» es la que tiene un plan en marcha. Aquí buscas, filtras y les escribes. Quien solo ha preguntado no es una ficha: vive en tus consultas.',
        accion: 'Mira la lista y los filtros de arriba.',
      },
      {
        id: 'c4.2', ruta: '/clientas', selector: 'clientas-nueva', tipo: 'hacer', hecho: 'socios',
        titulo: 'Añade una clienta de verdad',
        texto: 'Nombre y email bastan. Mejor una clienta real que una de prueba: así ves tu estudio como lo verás en serio. ¿Vienes de otro programa? «Traer mis datos», en el menú «Estudio», sube todas de una vez.',
        accion: 'Pulsa «Nueva clienta» y rellena su nombre y su email.',
        accionSiYaLoTienes: 'Ya tienes clientas. Para añadir otra, usa «Nueva clienta».',
      },
      {
        id: 'c4.3', ruta: '/clientas/*', selector: 'ficha-clienta', tipo: 'mira', requiere: 'socios',
        titulo: 'Su ficha',
        texto: 'Su plan, su asistencia, sus cobros y sus notas, todo en un solo sitio. Cuando una alumna te escriba con una duda, esta es la pantalla que abres.',
        accion: 'Fíjate en la tarjeta «Plan»: es la que usarás en el capítulo siguiente.',
      },
    ],
  },
  {
    id: 'c5',
    titulo: 'Tarifas: qué vendes, a quién y para qué clases',
    paraQue: 'Para vender: qué tarifas ofreces, qué clases cubre cada una y cómo se la das a una clienta. Es lo que más cuesta al principio, y lo vemos paso a paso.',
    minutos: 7,
    aprendido: ['por qué una tarifa en borrador no existe para tus clientas', 'qué clases cubre cada tarifa', 'cómo asignarle una tarifa a una clienta'],
    pasos: [
      {
        id: 'c5.1', ruta: '/productos', selector: 'paquetes-vista', tipo: 'mira',
        titulo: 'Aquí viven tus tarifas',
        texto: 'En «Paquetes» está todo lo que vendes. Una suscripción se cobra sola cada mes; un bono es un puñado de sesiones que se gastan; una clase suelta se compra de una en una.',
        accion: 'Mira las pestañas: «Suscripciones», «Bonos» y «Bajo demanda».',
      },
      {
        id: 'c5.2', ruta: '/productos', selector: 'paquetes-vista', tipo: 'hacer', hecho: 'tarifaActiva',
        titulo: 'Una tarifa en borrador no existe para tus clientas',
        texto: 'Hasta que no tenga precio y esté activa, nadie puede comprarla ni tú asignársela. Si el asistente de alta te dejó tarifas a 0 €, son borradores: ábrelas y termínalas.',
        accion: 'Abre una tarifa (o pulsa «Crear»), ponle precio y márcala como activa.',
        accionSiYaLoTienes: 'Ya tienes tarifas activas. Para crear otra, usa «Crear».',
      },
      {
        id: 'c5.3', ruta: '/productos', selector: 'paquetes-vista', tipo: 'mira',
        titulo: '¿Qué clases cubre cada tarifa?',
        texto: 'Cada tarifa dice qué clases se pueden reservar con ella: todas, o solo algunas. Así un bono de Reformer no vale para Suelo. Si no marcas nada, vale para todas.',
        accion: 'Al abrir una tarifa verás «Clases incluidas»: ahí eliges cuáles cubre.',
      },
      {
        id: 'c5.4', ruta: '/clientas/*', selector: 'ficha-plan', tipo: 'hacer', hecho: 'planAsignado', requiere: 'socios',
        titulo: 'Asígnale una tarifa a una clienta',
        texto: 'Es lo que une todo: la clienta, la tarifa y las clases. Desde que tiene plan puede reservar lo que esa tarifa cubre.',
        accion: 'En la tarjeta «Plan», pulsa «Asignar plan» y elige la tarifa.',
        accionSiYaLoTienes: 'Ya has asignado alguna tarifa. Para asignar otra, usa «Asignar plan» en la tarjeta «Plan».',
      },
      {
        id: 'c5.5', ruta: '/clientas/*', selector: 'ficha-plan', tipo: 'mira', requiere: 'socios',
        titulo: 'Su plan, a la vista',
        texto: 'Lo que tiene contratado y en qué estado está. Desde aquí lo cambias, lo pausas o lo cancelas, sin tocar nada más.',
        accion: 'Mira la tarjeta «Plan»: ahora lleva la tarifa que acabas de asignar.',
      },
      {
        id: 'c5.6', ruta: '/configuracion', href: '/configuracion?tab=reservas', selector: '#reservar', tipo: 'mira',
        titulo: 'Lo que lo une todo',
        texto: 'Aquí decides quién puede reservar. Si exiges plan, una clienta solo reserva las clases que cubre su tarifa. Si alguna no puede reservar, mira primero su plan y sus «Clases incluidas».',
        accion: 'Mira la fila «Reservar»: ahí decides quién puede reservar.',
      },
    ],
  },
  {
    id: 'c6',
    titulo: 'Reservas y cobros',
    paraQue: 'Para que tus alumnas reserven y tú cobres sin líos: tu enlace, tus reglas y tu forma de cobrar.',
    minutos: 8,
    aprendido: ['dónde está tu enlace de reservas', 'qué reglas puedes poner a las reservas', 'cómo cobrar en el mostrador y con tarjeta'],
    pasos: [
      {
        id: 'c6.1', ruta: '/configuracion', href: '/configuracion?tab=web', selector: '#direccion-y-enlaces', tipo: 'mira',
        titulo: 'Tu página de reservas',
        texto: 'Es por donde reservarán tus alumnas. Tienes un enlace y un QR: ponlos en tu Instagram, en WhatsApp o en la puerta del estudio.',
        accion: 'Mira la fila «Dirección y enlaces»: ahí está tu enlace de reservas.',
      },
      {
        id: 'c6.2', ruta: '/configuracion', href: '/configuracion?tab=reservas', selector: '#cancelar-y-recuperar', tipo: 'mira',
        titulo: 'Las reglas del juego',
        texto: 'Con cuánta antelación se reserva, hasta cuándo se cancela sin perder la sesión y qué pasa si la clase está llena. Cada tipo de clase puede tener las suyas.',
        accion: 'Mira la fila «Cancelar y recuperar»: ahí fijas hasta cuándo se puede cancelar.',
      },
      {
        id: 'c6.3', ruta: '/cobros', selector: 'cobros-vista', tipo: 'mira',
        titulo: 'Cobros',
        texto: 'Lo que está pendiente de cobrar y lo que ya se cobró. Con Stripe conectado las cuotas se cobran solas; lo que no se pueda cobrar te lo marca aquí.',
        accion: 'Mira lo pendiente y lo ya cobrado.',
      },
      {
        id: 'c6.4', ruta: '/configuracion', href: '/configuracion?tab=cobros', selector: '#integracion-stripe', tipo: 'mira',
        titulo: 'Stripe, cuando quieras',
        texto: 'Sirve para cobrar con tarjeta por internet. No lo necesitas para recibir reservas: puedes cobrar en el mostrador y apuntarlo. Conéctalo cuando quieras que las cuotas se cobren solas.',
        accion: 'Mira la fila «Cobro con tarjeta (Stripe)». No hace falta que la conectes ahora.',
      },
      {
        id: 'c6.5', ruta: '/configuracion', href: '/configuracion?tab=cobros', selector: '#datos-fiscales', tipo: 'hacer', hecho: 'datosFiscales',
        titulo: 'Tus datos fiscales',
        texto: 'Sin razón social y NIF no sale ninguna factura. Si ahora no los tienes a mano, puedes aplazarlo y te lo recordamos al final.',
        accion: 'Pulsa «Datos fiscales e IVA» y rellena razón social y NIF.',
        accionSiYaLoTienes: 'Ya tienes tus datos fiscales. Para cambiarlos, esta es la fila «Datos fiscales e IVA».',
      },
      {
        id: 'c6.6', ruta: '/pos', selector: 'pos-vista', tipo: 'mira',
        titulo: 'La Caja',
        texto: 'Para vender en el mostrador un bono, un producto o una clase suelta. La venta queda registrada en tus cobros.',
        accion: 'Mira cómo se arma una venta.',
      },
    ],
  },
  {
    id: 'c7',
    titulo: 'Tu equipo',
    paraQue: 'Para que cada clase tenga a alguien que la dé, y saber qué pasa cuando alguien falta.',
    minutos: 4,
    aprendido: ['quién ve qué en el panel', 'por qué toda clase necesita una instructora', 'cómo funcionan las sustituciones'],
    pasos: [
      {
        id: 'c7.1', ruta: '/equipo', selector: 'equipo-vista', tipo: 'mira',
        titulo: 'Tu equipo',
        texto: 'Propietaria, responsable de sede, recepción e instructoras, cada una con lo que le toca ver. Las instructoras no entran a este panel: trabajan desde la app de tu estudio.',
        accion: 'Mira a quién tienes ahora en el equipo.',
      },
      {
        id: 'c7.2', ruta: '/equipo', selector: 'equipo-nuevo', tipo: 'hacer', hecho: 'instructores',
        titulo: 'Date de alta si das clase tú',
        texto: 'Toda clase necesita a alguien asignado. Si das clase tú, añádete como instructora; si tienes equipo, invítalas con su email.',
        accion: 'Pulsa «Nuevo miembro» y añade a tu primera instructora (tú, si das clase).',
        accionSiYaLoTienes: 'Ya tienes equipo. Para añadir a alguien, usa «Nuevo miembro».',
      },
      {
        id: 'c7.3', ruta: '/equipo', selector: 'equipo-vista', tipo: 'mira',
        titulo: 'Su disponibilidad',
        texto: 'Cada instructora marca cuándo puede trabajar. Así Tentare sabe a quién proponer cuando hay una baja y no llama a quien no puede.',
        accion: 'Mira cómo aparece cada instructora en el equipo.',
      },
      {
        id: 'c7.4', ruta: '/sustituciones', selector: 'sustituciones-vista', tipo: 'mira',
        titulo: 'Sustituciones',
        texto: 'Cuando una instructora no puede venir, Tentare propone quién la cubre y por qué. Tú das el visto bueno, o lo dejas en automático si prefieres no enterarte.',
        accion: 'Mira cómo se ve una sustitución cuando la hay.',
      },
    ],
  },
  {
    id: 'c8',
    titulo: 'Que el estudio trabaje solo',
    paraQue: 'Para que Tentare se ocupe de lo repetitivo y tú, de lo importante.',
    minutos: 6,
    aprendido: ['qué se hace solo y qué decides tú', 'dónde hablas con tus alumnas', 'dónde se preparan campañas'],
    pasos: [
      {
        id: 'c8.1', ruta: '/automatizaciones', selector: 'automatizaciones-vista', tipo: 'mira',
        titulo: 'Automatizaciones',
        texto: 'Recuperar a quien deja de venir, acompañar a las nuevas… funcionando solas cuando las activas. Los recordatorios de clase ya salen solos, no hay que encenderlos.',
        accion: 'Mira la lista y sus interruptores.',
      },
      {
        id: 'c8.2', ruta: '/centro-de-control', selector: 'centro-de-control-vista', tipo: 'mira',
        titulo: 'Centro de Control',
        texto: 'Cada día, como mucho una cosa que merece tu atención, con el porqué. Si no hay nada, no te molesta. El resto del detalle lo tienes debajo, por si quieres mirarlo.',
        accion: 'Mira el mensaje del día.',
      },
      {
        id: 'c8.3', ruta: '/mensajeria', selector: 'mensajeria-vista', tipo: 'mira',
        titulo: 'Mensajería',
        texto: 'Hablas con tus alumnas y publicas en el tablón de tu comunidad. Lo que escribas aquí les llega a su app.',
        accion: 'Mira las conversaciones y el tablón.',
      },
      {
        id: 'c8.4', ruta: '/marketing', selector: 'marketing-vista', tipo: 'mira',
        titulo: 'Marketing',
        texto: 'Campañas y contenido para tus redes. No corre prisa: empieza por una cuando el estudio ya ruede.',
        accion: 'Mira las campañas y el contenido.',
      },
    ],
  },
  {
    id: 'c9',
    titulo: 'Tu marca y tu app',
    paraQue: 'Para que todo lo que ven tus alumnas lleve tu marca, no la nuestra.',
    minutos: 5,
    aprendido: ['cómo ponerle tu logo y tu color a todo', 'cómo se ve la app de tus alumnas', 'qué correos salen solos y cómo apagarlos'],
    pasos: [
      {
        id: 'c9.1', ruta: '/configuracion', href: '/configuracion?tab=marca', selector: '#logo-y-favicon', tipo: 'hacer', hecho: 'logo',
        titulo: 'Tu logo y tu color',
        texto: 'Es lo primero que ve una alumna: su app y tu página de reservas llevan tu marca. Se aplica al momento.',
        accion: 'Pulsa «Logo y favicon» y sube tu logo.',
        accionSiYaLoTienes: 'Ya tienes tu logo. Para cambiarlo, esta es la fila «Logo y favicon».',
      },
      {
        id: 'c9.2', ruta: '/configuracion', href: '/configuracion?tab=marca', selector: '#color-de-marca', tipo: 'mira',
        titulo: 'La app de tus alumnas',
        texto: 'El estilo, la tipografía y la portada de la app que instalan tus alumnas desde tu enlace. Lo ves en un móvil antes de publicar.',
        accion: 'Mira la fila «Apariencia de tu app»: ahí eliges estilo, color y portada.',
      },
      {
        id: 'c9.3', ruta: '/configuracion', href: '/configuracion?tab=comunicacion', selector: '#fila-herramienta-correos-automaticos', tipo: 'mira',
        titulo: 'Correos automáticos',
        texto: 'Bienvenida, reserva, recordatorio, cancelación… salen solos. Apaga los que no quieras o cambia lo que dicen.',
        accion: 'Mira la fila «Correos automáticos»: ahí apagas los que no quieras.',
      },
      {
        id: 'c9.4', ruta: '/configuracion', href: '/configuracion?tab=motivacion', selector: 'configuracion-vista', tipo: 'mira',
        titulo: 'Créditos, logros y retos',
        texto: 'Premian la constancia de tus alumnas con créditos, logros y retos. Es opcional: déjalo para cuando el estudio ya ruede.',
        accion: 'Mira las filas: créditos, logros, niveles y retos.',
      },
    ],
  },
  {
    id: 'c10',
    titulo: 'Tus números y tu cuenta',
    paraQue: 'Para saber cómo va el negocio y cómo va tu prueba.',
    minutos: 4,
    aprendido: ['dónde ver cómo va el negocio', 'dónde está el cierre de año para tu gestoría', 'cómo ver tu prueba y tu plan'],
    pasos: [
      {
        id: 'c10.1', ruta: '/informes', selector: 'informes-vista', tipo: 'mira',
        titulo: 'Informes',
        texto: 'Ingresos, ocupación y qué clases dan dinero de verdad. Para decidir con datos y no a ojo.',
        accion: 'Mira los gráficos y las cifras de arriba.',
      },
      {
        id: 'c10.2', ruta: '/cierre', selector: 'cierre-vista', tipo: 'mira',
        titulo: 'Cierre de año',
        texto: 'Lo facturado y el IVA del año, listo para tu gestoría. Sin hojas de cálculo.',
        accion: 'Mira el resumen del año.',
      },
      {
        id: 'c10.3', ruta: '/dashboard', selector: 'pildora-prueba', tipo: 'mira', soloEnPrueba: true,
        titulo: 'Tu prueba de 7 días',
        texto: 'Esta píldora de arriba cuenta los días que te quedan. Al pulsarla ves tu plan y desde ahí pasas a pago cuando quieras: sin prisas y sin sorpresas.',
        accion: 'Mira la píldora de arriba: al pulsarla ves tu plan.',
      },
      {
        id: 'c10.4', ruta: '/primeros-pasos', selector: 'guia-vista', tipo: 'mira',
        titulo: 'Dónde seguir',
        texto: 'Todo lo que has visto está explicado por escrito en «Primeros pasos», por si quieres repasarlo con calma. Y siempre puedes escribirnos.',
        accion: 'Mira los capítulos: son tu guía de consulta.',
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

/**
 * La pestaña de Configuración (`?tab=`) donde está el paso, si la hay. Estar en
 * `/configuracion` NO es estar en el sitio: cada pestaña es otra pantalla.
 */
export function tabDe(paso: Pick<PasoVisita, 'href'>): string | null {
  const q = paso.href?.split('?')[1]?.split('#')[0];
  return q ? new URLSearchParams(q).get('tab') : null;
}

/** ¿Estoy en el sitio del paso? Ruta Y, si el paso vive en una pestaña, esa pestaña. */
export function lugarCoincide(paso: Pick<PasoVisita, 'ruta' | 'href'>, pathname: string, tabActual: string | null): boolean {
  if (!rutaCoincide(paso.ruta, pathname)) return false;
  const tab = tabDe(paso);
  return tab === null || tab === tabActual;
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

/** El selector a CSS: `#salas` tal cual, y un `data-tour` como atributo. */
export function selectorCss(selector: string): string {
  return selector.startsWith('#') ? selector : `[data-tour="${selector}"]`;
}
