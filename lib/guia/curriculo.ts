// ─────────────────────────────────────────────────────────────────────────────
// El currículo de «Primeros pasos»: qué se le enseña a una propietaria nueva.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// Lo que había respondía a «¿qué te falta configurar?» y lo respondía bien: 17
// pasos, cada uno con su `done` derivado de datos reales. Lo que no respondía
// —ni intentaba— es «¿qué es esto y por qué me importa?». Una propietaria que
// nunca ha usado Tentare entraba directamente a una lista de tareas de un
// producto que todavía no conocía.
//
// Esto es la capa que faltaba. NO duplica el progreso: cada capítulo declara de
// qué pasos de `lib/onboarding.ts` depende (`pasos`), y el estado sale de allí.
// Si algún día se añade un paso, aquí solo hay que decir en qué capítulo vive.
//
// ── Reglas al escribir contenido ─────────────────────────────────────────────
// 1. Solo lo que EXISTE. Nada de «próximamente». Si una función está congelada
//    (`lib/frozen-features.ts`), tras un feature flag o en mantenimiento, no se
//    cuenta — enseñar una puerta cerrada es peor que no mencionarla.
// 2. Cada capítulo dice el QUÉ, el CÓMO y el PORQUÉ. El porqué es el que
//    convence: «sin clases en el calendario tu página no tiene nada que
//    enseñar» mueve más que «ve a Calendario».
// 3. El orden no es el del menú: es el orden en que se desbloquean las cosas.
// 4. Los enlaces son reales y están comprobados por `curriculo.test.ts`.
//
// ── El orden lo decidió el dato, no el gusto ─────────────────────────────────
// Medido en producción el 12-sep-2026 sobre los 13 estudios: 13 tienen salas,
// 12 un tipo de clase, 10 una instructora, y solo **6 tienen una sola clase
// programada**. Ahí se cae la mitad, y por eso «Pon tu horario en pie» es el
// capítulo más desarrollado de los quince.
//
// Y el NIF, que la lista anterior pedía como PRIMER paso, lo tienen 4 de 13 —
// menos que los estudios que ya han recibido una reserva (5). Tiene sentido:
// para abrir reservas no hace falta NIF, hace falta para FACTURAR. Empezar por
// lo fiscal es empezar por donde no sigue casi nadie, así que se ha movido a su
// propio capítulo.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuánto urge.
 *
 * `esencial` NO es «lo importante»: es lo que hace falta para que alguien pueda
 * reservar. Ni Stripe ni el NIF están ahí — se comprobó contra el camino real
 * (`crearReservaPublica` → RPC `reservar_plaza`) que no hacen falta, y un
 * candado falso le dice a un estudio que cobra en mostrador que le falta algo
 * que no le falta.
 */
export type NivelGuia = 'esencial' | 'recomendado' | 'avanzado';

export const ETIQUETA_NIVEL: Record<NivelGuia, string> = {
  esencial: 'Para empezar',
  recomendado: 'Cuando ya rueda',
  avanzado: 'Para exprimirlo',
};

export const EXPLICACION_NIVEL: Record<NivelGuia, string> = {
  esencial: 'Lo mínimo para que una alumna pueda reservar. Nada más.',
  recomendado: 'Cobrar, facturar y que tus alumnas tengan su app. No corre prisa el primer día.',
  avanzado: 'Lo que descubres cuando el estudio ya funciona y quieres que funcione mejor.',
};

export interface AccionGuia {
  label: string;
  /** A dónde lleva. Ausente si la acción no navega (ver `tour`). */
  href?: string;
  /** Abre en pestaña nueva: hoy solo la página pública del propio estudio. */
  externo?: boolean;
  /**
   * Arranca el tour guiado en vez de navegar. Es una acción, no un destino, y
   * disfrazarla de `?tour=1` obligaba a la portada a leer la query para algo
   * que ya sabe hacer — y a que el guarda de enlaces tuviera que perdonar una
   * URL que no lleva a ninguna parte.
   */
  tour?: true;
}

export interface ApartadoGuia {
  titulo: string;
  /** El cuerpo. Una o dos frases; si necesita más, probablemente sean dos apartados. */
  texto: string;
}

export interface CapituloGuia {
  id: string;
  /** '01'…'15'. Va en pantalla: da sensación de recorrido con final. */
  numero: string;
  titulo: string;
  /** Una línea para la portada. Lo que sabrá hacer, no lo que va a leer. */
  resumen: string;
  nivel: NivelGuia;
  minutos: number;
  /** Bullets de «qué vas a aprender», antes de decidir si entra. */
  queAprendes: string[];
  /** El porqué, en una frase. Es lo que convence de hacerlo AHORA. */
  porQue: string;
  apartados: ApartadoGuia[];
  acciones: AccionGuia[];
  consejo?: string;
  /**
   * Ids de pasos de `lib/onboarding.ts` que este capítulo enseña. De aquí sale
   * el estado del capítulo — nunca de un flag ni de «he leído esto».
   * Vacío = capítulo puramente explicativo, sin nada que completar.
   */
  pasos: string[];
}

export const CAPITULOS: CapituloGuia[] = [
  // ── 01 ─────────────────────────────────────────────────────────────────────
  {
    id: 'conoce-tentare',
    numero: '01',
    titulo: 'Conoce Tentare',
    resumen: 'El mapa antes que el camino: cómo está organizado y dónde está cada cosa.',
    nivel: 'esencial',
    minutos: 4,
    queAprendes: [
      'Qué hace Tentare por ti y qué sigue siendo cosa tuya',
      'Las seis zonas del panel y qué vive en cada una',
      'Por dónde empezar y qué puedes dejar para más adelante',
    ],
    porQue: 'Cinco minutos aquí te ahorran buscar a ciegas durante semanas.',
    apartados: [
      {
        titulo: 'Qué es Tentare',
        texto: 'Es el sitio donde vive tu estudio: tu horario, tus alumnas, sus bonos, sus reservas y su dinero. Tú decides las reglas una vez; a partir de ahí tus alumnas reservan solas desde su móvil y tú dejas de llevar la cuenta en una libreta o en un grupo de WhatsApp.',
      },
      {
        titulo: 'Las seis zonas del panel',
        texto: 'Arriba del todo, Centro de Control y tu Inicio: lo que hay que mirar hoy. Clases reúne tu calendario y las citas. Clientas, tus alumnas y la mensajería. Ventas, lo que cobras. Estudio, tu equipo, los informes y la configuración. Y el buscador (⌘K) llega a cualquier sitio escribiendo dos palabras.',
      },
      {
        titulo: 'Empieza por lo que desbloquea el resto',
        texto: 'El orden de esta guía no es caprichoso: sin salas no puedes decir cuánta gente cabe, sin tipos de clase no puedes programar, y sin clases programadas tu página de reservas no tiene nada que enseñar. Los cinco primeros capítulos son ese camino. El resto puede esperar a la semana que viene.',
      },
      {
        titulo: 'No necesitas configurarlo todo para empezar',
        texto: 'Para que una alumna reserve no hace falta ni Stripe ni tu NIF. Puedes abrir hoy cobrando en el mostrador y dejar lo de cobrar por internet para cuando te apetezca.',
      },
    ],
    acciones: [{ label: 'Ver un tour del panel', tour: true }],
    consejo: 'Si vienes de otro software, no empieces metiendo datos a mano: en «Traer mis datos» se suben tus alumnas, bonos, horario y reservas de una vez, y se puede deshacer.',
    pasos: [],
  },

  // ── 02 ─────────────────────────────────────────────────────────────────────
  {
    id: 'tu-estudio',
    numero: '02',
    titulo: 'Tu estudio y tus espacios',
    resumen: 'El nombre que ven tus alumnas, tus horarios de apertura y las salas donde entrenan.',
    nivel: 'esencial',
    minutos: 6,
    queAprendes: [
      'Qué textos tuyos ven las alumnas y dónde aparece cada uno',
      'Por qué el horario del estudio no es lo mismo que tus clases',
      'Cómo la capacidad de una sala limita cada clase',
      'Qué hacer cuando se te avería una máquina',
    ],
    porQue: 'La capacidad de la sala es el techo de todas tus clases: si está mal, cada clase que programes nacerá mal.',
    apartados: [
      {
        titulo: 'Lo que leen tus alumnas',
        texto: 'En Configuración → Estudio → General escribes tu nombre, tu logo, tu teléfono y tu dirección, pero también los textos que aparecen en su app: cómo te presentas, tu lema, la frase de bienvenida y las normas del centro. No son adornos: son lo primero que lee alguien que todavía no te conoce.',
      },
      {
        titulo: 'Tu horario de apertura',
        texto: 'En la pestaña Horario dices a qué hora abres y cierras cada día de la semana. Esto no crea clases: le dice al calendario qué días estás cerrada, para que un lunes sin clases se vea como «cerrado» y no como «libre».',
      },
      {
        titulo: 'Tus salas',
        texto: 'Cada sala tiene un nombre, un color y una capacidad. La capacidad es la que manda: si tu sala Reformer tiene 8 plazas, ninguna clase ahí podrá aceptar a la novena. El color no es decorativo — el calendario pinta las clases por sala, y con dos salas del mismo color deja de leerse de un vistazo.',
      },
      {
        titulo: 'Cuando se avería una máquina',
        texto: 'En la misma pantalla puedes registrar una avería con la sala, el motivo y hasta cuándo. Mientras dure, todas las clases de esa sala tienen una plaza menos automáticamente. No hay que tocar clase por clase.',
      },
      {
        titulo: 'Cerrar por vacaciones',
        texto: 'Si cierras unos días, dilo en Horario → «Cerrar el centro unos días». Tentare cancela las clases de esas fechas, avisa a quien tuviera reserva, devuelve las sesiones de bono y —esto es lo que nadie hace a mano— alarga la caducidad de los bonos y las recuperaciones de todas tus alumnas tantos días como dure el cierre.',
      },
    ],
    acciones: [
      { label: 'Configurar mis salas', href: '/configuracion?tab=clases-salas&sub=salas' },
      { label: 'Datos y textos de mi estudio', href: '/configuracion?tab=estudio&sub=general' },
      { label: 'Mi horario de apertura', href: '/configuracion?tab=estudio&sub=horario' },
    ],
    consejo: 'Si bajas la capacidad de una sala, Tentare te avisa de las clases futuras que se quedarían sobrevendidas antes de guardar. Léelo: esas plazas ya están vendidas.',
    pasos: ['salas'],
  },

  // ── 03 ─────────────────────────────────────────────────────────────────────
  {
    id: 'tu-equipo',
    numero: '03',
    titulo: 'Tu equipo',
    resumen: 'Quién trabaja contigo, qué puede ver cada una y cómo se cubren las bajas.',
    nivel: 'esencial',
    minutos: 7,
    queAprendes: [
      'Los cuatro roles y qué ve cada uno',
      'Por qué la disponibilidad de tus instructoras hace trabajar al buscador de sustitutas',
      'Cómo se gestionan vacaciones y bajas',
    ],
    porQue: 'Sin al menos una instructora no puedes programar ninguna clase: toda clase necesita quien la dé.',
    apartados: [
      {
        titulo: 'Los cuatro roles',
        texto: 'Propietaria lo ve todo. Responsable de sede lleva lo operativo y el equipo, pero no el dinero ni la configuración. Recepción cobra y gestiona alumnas, pero no ve informes ni configuración. Instructora ve su calendario, sus alumnas y poco más. No es una cuestión de confianza: es que cada una vea lo suyo y no se pierda en lo demás.',
      },
      {
        titulo: 'Dar de alta a alguien',
        texto: 'En Equipo añades a la persona con su nombre, email y rol. Si le das un email, recibe una invitación para entrar con su propia cuenta. Puedes tener instructoras sin cuenta —solo para asignarles clases— y darles acceso más adelante.',
      },
      {
        titulo: 'Su disponibilidad, y por qué merece la pena',
        texto: 'Cada instructora puede decir en qué franjas puede trabajar. Esto alimenta al buscador de sustitutas: cuando alguien no pueda dar una clase, Tentare propone quién puede cubrirla explicándote por qué —«ya ha dado esta clase 4 veces», «este mes va holgada de horas»—, en vez de dejarte llamando una por una.',
      },
      {
        titulo: 'Que la rellene ella, no tú',
        texto: 'Desde Equipo puedes mandarle un enlace por WhatsApp para que marque su disponibilidad ella misma, sin instalar nada y sin cuenta. Es medio minuto suyo y te ahorra la conversación entera.',
      },
      {
        titulo: 'Vacaciones y bajas',
        texto: 'Una ausencia se registra con su rango de fechas y su motivo. A partir de ahí deja de aparecer como candidata en esas fechas. Ojo: registrar una ausencia no reasigna sola las clases que ya tuviera programadas — para eso está «reasignar instructora», que pasa todas sus clases de un rango a otra persona de una vez.',
      },
      {
        titulo: 'Su tarifa por hora',
        texto: 'Puedes guardar la tarifa de cada instructora para preparar las liquidaciones. Solo tú y quien lleve la sede la veis; ella puede consultar la suya, pero nunca la de otra ni cambiar la propia.',
      },
    ],
    acciones: [
      { label: 'Añadir a alguien a mi equipo', href: '/equipo' },
      { label: 'Ver el buscador de sustitutas', href: '/sustituciones' },
    ],
    consejo: 'Aunque des clases tú sola, date de alta como instructora: tus clases necesitan a alguien asignado y así tu calendario cuadra desde el primer día.',
    pasos: ['instructor', 'invitar-equipo'],
  },

  // ── 04 ─────────────────────────────────────────────────────────────────────
  {
    id: 'tus-clases',
    numero: '04',
    titulo: 'Tus clases',
    resumen: 'La diferencia entre un tipo de clase y una clase, y todo lo que un tipo decide por ti.',
    nivel: 'esencial',
    minutos: 6,
    queAprendes: [
      'Qué es un tipo de clase y por qué se crea una sola vez',
      'Qué define: duración, plazas, nivel, color e imágenes',
      'Cuándo merece la pena que una clase tenga reglas propias',
    ],
    porQue: 'Un tipo de clase se define una vez y se reutiliza en las cien clases que programes después.',
    apartados: [
      {
        titulo: 'Tipo de clase ≠ clase',
        texto: '«Reformer» es un tipo de clase: existe una vez, con su duración, su aforo y su color. «Reformer del martes a las 10:00» es una clase: una fecha concreta con su instructora y sus alumnas. Primero se crea el tipo, y luego se programan todas las clases que quieras a partir de él.',
      },
      {
        titulo: 'Lo básico',
        texto: 'Nombre, cuánto dura, a quién va dirigida (nivel), cuántas alumnas caben y de qué color se pinta en el calendario. Si no dices cuántas caben, se usa la capacidad de la sala — que casi siempre es lo que quieres.',
      },
      {
        titulo: 'Su cara pública',
        texto: 'Cada tipo de clase puede tener su logo cuadrado y su banner ancho, una descripción y unos objetivos («ganar fuerza», «recuperarme de una lesión»). Los objetivos no son texto libre: son la lista que usa el asistente de tu página pública para recomendar clases a quien todavía no sabe cuál elegir.',
      },
      {
        titulo: 'Reglas propias, solo para la excepción',
        texto: 'Cada tipo puede sobrescribir las reglas de reserva del estudio: hasta cuándo se puede cancelar, si hace falta bono, si hay lista de espera, cuántas alumnas mínimo para que salga. Cuando no lo tocas, hereda lo del estudio y te lo dice en pantalla. Empieza sin tocar nada: personaliza solo la clase que sea de verdad distinta.',
      },
      {
        titulo: 'Clases con autorización',
        texto: 'Si tienes una clase a la que no debe apuntarse cualquiera —avanzado, pre y posparto—, puedes marcar que requiere autorización: entonces solo reservan las alumnas a las que se la hayas dado una a una.',
      },
    ],
    acciones: [{ label: 'Crear un tipo de clase', href: '/configuracion?tab=clases-salas' }],
    consejo: 'Empieza con dos o tres tipos como mucho. Siempre puedes añadir más; lo difícil es reordenar un catálogo de doce cuando ya tienes alumnas reservando.',
    pasos: ['clase'],
  },

  // ── 05 ─────────────────────────────────────────────────────────────────────
  {
    id: 'tu-horario',
    numero: '05',
    titulo: 'Pon tu horario en pie',
    resumen: 'De un calendario vacío a tu semana entera programada, sin meter clase por clase.',
    nivel: 'esencial',
    minutos: 8,
    queAprendes: [
      'Crear clases que se repiten cada semana, en vez de una a una',
      'Cambiar una clase de una serie sin romper el resto',
      'Mover, duplicar y cancelar sin perder a nadie por el camino',
    ],
    porQue: 'Es el paso donde se queda la mitad de los estudios, y sin él tu página de reservas no tiene nada que enseñar.',
    apartados: [
      {
        titulo: 'Créalas en serie, no una a una',
        texto: 'Un estudio de Pilates repite su horario cada semana. En el calendario, «Crear clases recurrentes» te deja decir «los martes y jueves a las 10:00, durante doce semanas» y las crea todas de golpe. Meter cuarenta clases a mano es la razón más común de abandonar a medias.',
      },
      {
        titulo: 'Cambiar una serie sin romperla',
        texto: 'Si a partir de marzo esa clase pasa de las 10:00 a las 10:30, no hay que borrar nada: «editar la serie desde esta fecha» cambia esa clase y todas las siguientes, y deja intactas las que ya pasaron. Lo que ya ocurrió es tu historial y no se toca.',
      },
      {
        titulo: 'Mover una clase suelta',
        texto: 'En el calendario puedes arrastrar una clase a otra hora. La duración se mantiene, y si al soltarla chocara con otra clase en la misma sala, Tentare te lo dice antes de guardar. Dos clases no pueden solapar en la misma sala: eso lo impide la propia base de datos, no un aviso que se pueda ignorar.',
      },
      {
        titulo: 'Cancelar una clase',
        texto: 'Al cancelar puedes avisar a las apuntadas y devolverles la sesión del bono. Cuando cancelas tú, lo normal es devolver: no fue decisión suya. Esa preferencia se configura una vez en las reglas de reserva y luego se aplica sola.',
      },
      {
        titulo: 'Incidencias',
        texto: 'Si en una clase pasó algo —se fue la luz, vino la mitad—, puedes dejar una nota en esa sesión. Es para ti y para tu equipo, no la ve la alumna.',
      },
    ],
    acciones: [
      { label: 'Ir a mi calendario', href: '/calendario' },
      { label: 'Crear clases que se repiten', href: '/calendario?recurrentes=1' },
      { label: 'Traer mi horario de otro software', href: '/calendario/importar' },
    ],
    consejo: 'No intentes dejar programado todo el año. Programa cuatro o seis semanas, comprueba que el horario funciona de verdad, y luego amplía.',
    pasos: ['horario'],
  },

  // ── 06 ─────────────────────────────────────────────────────────────────────
  {
    id: 'abre-reservas',
    numero: '06',
    titulo: 'Abre las reservas',
    resumen: 'Tu página pública, el enlace que compartes y la primera reserva de verdad.',
    nivel: 'esencial',
    minutos: 4,
    queAprendes: [
      'Dónde está tu página de reservas y cómo se comparte',
      'Qué ve una alumna que entra por primera vez',
      'Cómo meter el calendario en tu propia web',
    ],
    porQue: 'Es el momento en que Tentare empieza a trabajar para ti en vez de al revés.',
    apartados: [
      {
        titulo: 'Ya tienes página, aunque no lo sepas',
        texto: 'Tu estudio tiene una dirección pública desde el primer día. Ahí se ve tu horario y desde ahí se reserva. No hay que publicarla ni activarla: en cuanto tienes clases programadas, funciona.',
      },
      {
        titulo: 'No necesitas Stripe para esto',
        texto: 'Recibir reservas y cobrar por internet son dos cosas distintas. Puedes abrir hoy y seguir cobrando en el mostrador; conectar Stripe es el capítulo 09 y puede esperar.',
      },
      {
        titulo: 'Comparte el enlace donde ya te buscan',
        texto: 'En la biografía de Instagram, en tu ficha de Google, en el grupo de WhatsApp de tus alumnas. La mayoría de las primeras reservas llegan del sitio donde ya te conocían, no de gente nueva.',
      },
      {
        titulo: 'Si tienes web propia',
        texto: 'Puedes incrustar el calendario de reservas dentro de tu web, con tus colores y tu tipografía, de dos formas: un recuadro que se pega tal cual, o un trozo de código que se integra sin marco. La segunda necesita que autorices tu dominio.',
      },
    ],
    acciones: [
      { label: 'Ver mi página de reservas', href: '/configuracion?tab=estudio&sub=enlaces' },
      { label: 'Meter el calendario en mi web', href: '/configuracion?tab=api' },
    ],
    consejo: 'Antes de compartirlo, ábrelo tú desde el móvil y reserva una clase como si fueras una alumna. Es la mejor forma de ver lo que ve ella.',
    pasos: ['reservas', 'primera-reserva'],
  },

  // ── 07 ─────────────────────────────────────────────────────────────────────
  {
    id: 'reglas',
    numero: '07',
    titulo: 'Las reglas del juego',
    resumen: 'Hasta cuándo se cancela, qué pasa si no vienen, y quién se queda cuando una clase se llena.',
    nivel: 'recomendado',
    minutos: 9,
    queAprendes: [
      'La ventana de cancelación y qué pasa con la sesión del bono',
      'Cómo funciona la lista de espera y el plazo para aceptar una plaza',
      'Recuperaciones: qué son y cuándo se ganan',
      'Aprobar reservas a mano y mínimo de asistentes',
    ],
    porQue: 'Son las reglas que evitan las conversaciones incómodas: si están escritas, no hay que negociarlas cada vez.',
    apartados: [
      {
        titulo: 'La ventana de cancelación',
        texto: 'Decides con cuántas horas de antelación se puede cancelar sin perder la sesión. Por debajo de esa ventana, la cancelación es tardía. Es la regla más importante de todas: define qué es «avisar a tiempo» en tu estudio.',
      },
      {
        titulo: 'Recuperaciones',
        texto: 'Una recuperación es una clase que una alumna se ha ganado y puede usar por encima de su límite semanal. Se gastan solas cuando choca con el tope, sin que nadie tenga que acordarse. Y si lo activas, se conceden solas al cerrar la semana a quien canceló a tiempo y se quedó sin poder recuperar el hueco.',
      },
      {
        titulo: 'Lista de espera',
        texto: 'Cuando una clase se llena, quien llega después entra en lista de espera. Si alguien cancela, la plaza pasa a la primera de la cola. De fábrica se le asigna al instante, aunque no esté mirando el móvil. Puedes darle en cambio un plazo para aceptar: si no responde a tiempo, pasa a la siguiente.',
      },
      {
        titulo: 'Aprobar tú cada reserva',
        texto: 'Si tu estudio funciona así, puedes exigir que apruebes cada reserva. Una reserva pendiente no ocupa plaza ni gasta bono: eso se decide al aprobarla, no al pedirla.',
      },
      {
        titulo: 'Mínimo de asistentes',
        texto: 'Puedes decir que una clase con menos de N apuntadas no sale. Dos horas antes, si no se alcanza, se cancela sola y se devuelve el bono a quien estuviera apuntada. Nadie se planta en el estudio para encontrárselo cerrado.',
      },
      {
        titulo: 'Cobrar por no venir',
        texto: 'Puedes poner un importe por cancelación tardía o por no presentarse. Empieza apagado, y cuando lo enciendes cada cargo espera tu aprobación salvo que le digas lo contrario. Solo se le puede cobrar a quien tenga tarjeta guardada y haya aceptado las condiciones.',
      },
      {
        titulo: 'El estudio manda, la clase matiza',
        texto: 'Todo esto se decide una vez para el estudio entero. Si una clase concreta necesita otra regla, se cambia solo ahí y el resto sigue heredando. No configures clase por clase: configura el estudio y haz excepciones.',
      },
    ],
    acciones: [{ label: 'Configurar mis reglas de reserva', href: '/configuracion?tab=estudio&sub=reservas' }],
    consejo: 'Empieza con las reglas de fábrica durante un mes. Cambia solo lo que te haya dado un problema real — es mucho más fácil endurecer una regla que relajarla cuando tus alumnas ya se acostumbraron.',
    pasos: [],
  },

  // ── 08 ─────────────────────────────────────────────────────────────────────
  {
    id: 'que-vendes',
    numero: '08',
    titulo: 'Qué vendes',
    resumen: 'Cuotas, bonos y clases sueltas: qué es cada uno y cuál le conviene a tu estudio.',
    nivel: 'recomendado',
    minutos: 7,
    queAprendes: [
      'La diferencia real entre una cuota, un bono y una clase suelta',
      'Caducidades y límites semanales',
      'La matrícula, y cómo regalarla a las primeras',
    ],
    porQue: 'Sin nada que vender, cada alumna paga clase a clase y tú llevas las cuentas a mano.',
    apartados: [
      {
        titulo: 'Los tres tipos',
        texto: 'Una **cuota** se cobra sola cada mes (o trimestre, semestre o año) hasta que se den de baja. Un **bono** es un puñado de sesiones que se van gastando al reservar. Una **clase suelta** es un pago único sin renovación. La mayoría de los estudios viven de cuotas y usan bonos para quien viene con menos constancia.',
      },
      {
        titulo: 'Caducidad',
        texto: 'Un bono puede caducar a los X días de comprarlo. Sin caducidad, un bono de diez sesiones comprado hace dos años sigue vivo. Ponle caducidad: es lo que convierte un bono en una razón para venir esta semana.',
      },
      {
        titulo: 'Límites semanales',
        texto: 'Puedes limitar cuántas clases por semana da derecho un plan, en total o por actividad: «dos de Máquina y una de Mat». Es lo que hace que una cuota de clases ilimitadas no acabe siendo un problema de aforo.',
      },
      {
        titulo: 'Para qué clases sirve cada plan',
        texto: 'Un plan puede valer para todas tus clases o solo para algunas. Si no dices nada, vale para todas — que casi siempre es lo que quieres al empezar.',
      },
      {
        titulo: 'La matrícula',
        texto: 'Un cargo único la primera vez que alguien contrata contigo. Va en un recibo aparte del de la cuota, para que las renovaciones no la vuelvan a cobrar. Y puedes hacer promoción: gratis hasta una fecha, para las primeras N personas, o las dos cosas.',
      },
    ],
    acciones: [{ label: 'Crear un bono o una cuota', href: '/configuracion?tab=planes' }],
    consejo: 'Los precios que escribes llevan el IVA incluido. Cambiar el IVA general solo cambia cómo se desglosa en la factura, nunca lo que paga tu alumna.',
    pasos: ['bonos'],
  },

  // ── 09 ─────────────────────────────────────────────────────────────────────
  {
    id: 'cobrar',
    numero: '09',
    titulo: 'Cobrar',
    resumen: 'Conectar Stripe, cobrar en el mostrador y saber en todo momento quién te debe.',
    nivel: 'recomendado',
    minutos: 8,
    queAprendes: [
      'Cómo conectar tu cuenta y por qué el dinero no pasa por Tentare',
      'Las formas de cobrar: internet, tarjeta guardada, efectivo, Bizum, recibo bancario',
      'Dónde se ve lo que has cobrado y lo que te deben',
    ],
    porQue: 'Con el cobro automático dejas de perseguir a nadie a final de mes.',
    apartados: [
      {
        titulo: 'El dinero es tuyo desde el primer momento',
        texto: 'Al conectar Stripe, los cobros entran en tu propia cuenta, no en la de Tentare. No hay que introducir ninguna clave: se hace con un botón y se completa en la web de Stripe con tus datos y tu cuenta bancaria.',
      },
      {
        titulo: 'Cuando una alumna compra por internet',
        texto: 'Paga con tarjeta desde su app o desde tu página. Se le entrega el bono o la cuota al instante, se le genera el recibo y, si tienes la facturación lista, su factura. Tú no tienes que hacer nada.',
      },
      {
        titulo: 'Cobrar en el mostrador',
        texto: 'Efectivo, Bizum, transferencia o datáfono: marcas el recibo como cobrado con el método que fuera y queda registrado igual. Tentare no te obliga a cobrar por internet.',
      },
      {
        titulo: 'Quién me debe',
        texto: 'Es la pantalla que más vas a mirar. Muestra lo pendiente, deja cobrar con la tarjeta ya guardada de una alumna, marcar como cobrado lo que te han pagado en mano, y generar el recibo bancario del mes para subirlo a tu banco.',
      },
      {
        titulo: 'Renovaciones y pagos fallidos',
        texto: 'Las cuotas generan su recibo solas cada ciclo. Si un cobro falla, se reintenta a los 1, 3 y 7 días antes de darlo por fallido, y se avisa a la alumna la primera vez y la última. No hay que estar pendiente.',
      },
    ],
    acciones: [
      { label: 'Conectar Stripe', href: '/configuracion?tab=integraciones' },
      { label: 'Ver quién me debe', href: '/cobros' },
    ],
    consejo: 'Antes de cobrarle a nadie de verdad, haz una compra de prueba desde tu propia página con un importe pequeño. Ver el recibo aparecer solo es la mejor forma de fiarte del sistema.',
    pasos: ['stripe', 'renovacion'],
  },

  // ── 10 ─────────────────────────────────────────────────────────────────────
  {
    id: 'tus-alumnas',
    numero: '10',
    titulo: 'Tus alumnas',
    resumen: 'Su ficha, su historial y todo lo que Tentare sabe de cada persona que entrena contigo.',
    nivel: 'recomendado',
    minutos: 7,
    queAprendes: [
      'Traer tus alumnas de otro software en vez de teclearlas',
      'Qué hay en una ficha y quién puede ver cada parte',
      'Etiquetas, campos propios y grupos para hablarles',
    ],
    porQue: 'La ficha es de donde salen las reservas, los bonos y los cobros: sin ella, lo demás no tiene a quién apuntar.',
    apartados: [
      {
        titulo: 'No las teclees: tráelas',
        texto: 'Si vienes de otro software, «Traer mis datos» sube tus alumnas, sus bonos, tu horario, sus reservas y sus pagos históricos. Te enseña antes qué va a hacer, avisa de lo que no entiende, y se puede deshacer entero después. Teclear doscientas fichas a mano no es un buen primer día.',
      },
      {
        titulo: 'La ficha',
        texto: 'Cada alumna tiene su resumen, sus reservas, sus pagos, sus comunicaciones y sus documentos. Si tu estudio lleva ficha clínica, también su historial de molestias y lesiones — esa parte solo la ves tú y tus instructoras, nunca recepción, y solo existe si la alumna dio su consentimiento aparte.',
      },
      {
        titulo: 'Etiquetas y campos propios',
        texto: 'Puedes marcar a una alumna como VIP, embarazo, lesión o lo que necesites, y añadir campos tuyos que no vienen de serie. Aparecen en el alta y en su ficha.',
      },
      {
        titulo: 'Grupos para hablarles',
        texto: 'Puedes guardar grupos con condiciones —«lleva 30 días sin venir», «su bono caduca en una semana», «cumple años este mes»— y usarlos para escribirles. Se recalculan solos: no es una lista que se queda vieja.',
      },
      {
        titulo: 'Consentimientos',
        texto: 'Tentare lleva tres por separado: las condiciones del estudio, los datos de salud y el marketing. Sin el de marketing, ninguna campaña ni automatización comercial alcanza a esa persona. No es burocracia: es lo que te protege.',
      },
    ],
    acciones: [
      { label: 'Dar de alta a una alumna', href: '/clientas?nuevo=1' },
      { label: 'Traer mis datos de otro software', href: '/migracion' },
    ],
    consejo: 'Empieza por las que ya tienes. Las nuevas se dan de alta solas al reservar desde tu página, sin que tú toques nada.',
    pasos: ['clientes'],
  },

  // ── 11 ─────────────────────────────────────────────────────────────────────
  {
    id: 'la-app-de-tus-alumnas',
    numero: '11',
    titulo: 'La app de tus alumnas',
    resumen: 'Lo que ven ellas en el móvil, con tu nombre y tus colores.',
    nivel: 'recomendado',
    minutos: 6,
    queAprendes: [
      'Qué puede hacer una alumna sin escribirte',
      'Cómo se instala en su móvil sin pasar por ninguna tienda',
      'Qué puedes personalizar hoy',
    ],
    porQue: 'Cada cosa que una alumna resuelve sola es un WhatsApp que no tienes que contestar.',
    apartados: [
      {
        titulo: 'Qué puede hacer ella sola',
        texto: 'Reservar y cancelar, ver cuántas sesiones le quedan y cuándo le caducan, comprar un bono o una cuota, consultar sus recibos y facturas, escribirte, y llevar sus datos. Todo sin llamarte.',
      },
      {
        titulo: 'Se instala sin tienda de aplicaciones',
        texto: 'Es una web que se añade a la pantalla de inicio del móvil y desde ahí se abre como una app. No hay que buscar nada en App Store ni en Google Play, ni esperar a que aprueben una actualización.',
      },
      {
        titulo: 'Con tu cara, no con la nuestra',
        texto: 'Lleva tu nombre, tu logo y tus colores. Para tus alumnas es la app de tu estudio. Hoy puedes cambiar el logo, el favicon, los colores de marca y los textos que se leen al entrar.',
      },
      {
        titulo: 'Tu tablón',
        texto: 'En «Descubre y tablón» pones el mensaje destacado que ven al entrar y los avisos del estudio. Cada tarjeta nace oculta: no se publica hasta que tú lo dices.',
      },
      {
        titulo: 'El editor de marca completo, ahora mismo',
        texto: 'El editor grande —tipografías, redondeos, estilos de tarjeta, bloques de la portada— está en mantenimiento mientras se rehace. Lo que ya tuvieras publicado sigue funcionando igual; lo que está cerrado es la edición.',
      },
    ],
    acciones: [
      { label: 'Personalizar mi tablón', href: '/configuracion?tab=descubre' },
      { label: 'Mis colores y mi menú', href: '/configuracion/apariencia/panel' },
      { label: 'El enlace de la app de mis alumnas', href: '/configuracion?tab=estudio&sub=enlaces' },
    ],
    consejo: 'Pídele a una alumna de confianza que la instale y te cuente qué no entiende. Vale más que cualquier cosa que puedas mirar tú desde el panel.',
    pasos: ['portal-contenido', 'marca'],
  },

  // ── 12 ─────────────────────────────────────────────────────────────────────
  {
    id: 'facturar',
    numero: '12',
    titulo: 'Facturas y contabilidad',
    resumen: 'Tus datos fiscales, las facturas que se emiten solas y el cierre para tu gestoría.',
    nivel: 'recomendado',
    minutos: 6,
    queAprendes: [
      'Qué datos hacen falta para poder facturar',
      'Cuándo se emite una factura sola y cuándo la haces tú',
      'Cómo se le manda todo a la gestoría',
    ],
    porQue: 'Sin tu NIF no se emite ninguna factura, y las ventas se van acumulando sin factura sin que nadie te avise.',
    apartados: [
      {
        titulo: 'Lo que hace falta',
        texto: 'Tu NIF y tu razón social, en Configuración → Estudio → General. El NIF se valida: uno de relleno no cuela. Sin él, Tentare cobra igual pero no emite ninguna factura, y te lo avisa en rojo en la pantalla de Facturas.',
      },
      {
        titulo: 'Se emiten solas',
        texto: 'Al cobrar se emite la factura, con su numeración correlativa por año, salvo si cobraste en efectivo — ahí la decides tú, porque no todos los estudios facturan el efectivo igual. La vía manual sigue estando para cuando la quieras.',
      },
      {
        titulo: 'Rectificar',
        texto: 'Una factura emitida no se edita ni se borra: se rectifica con otra factura que la corrige, en su propia serie. Es como funciona una contabilidad que aguanta una inspección.',
      },
      {
        titulo: 'Tu gestoría',
        texto: 'En Cierre de año preparas el resumen de un año o de un trimestre y se lo mandas a tu gestoría con su CSV. Puedes dejarlo automático cada trimestre y olvidarte.',
      },
    ],
    acciones: [
      { label: 'Poner mis datos fiscales', href: '/configuracion?tab=estudio&sub=general' },
      { label: 'Ver mis facturas', href: '/cobros?tab=facturas' },
      { label: 'Cierre para la gestoría', href: '/cierre' },
    ],
    consejo: 'Ponlo antes de tu primera venta. Las facturas se numeran en orden y con fecha: rellenar hacia atrás lo que se cobró sin facturar es mucho más incómodo que dedicarle dos minutos hoy.',
    pasos: ['estudio'],
  },

  // ── 13 ─────────────────────────────────────────────────────────────────────
  {
    id: 'dia-a-dia',
    numero: '13',
    titulo: 'Tu día a día',
    resumen: 'Lo que abrirás cada mañana cuando todo esté en marcha.',
    nivel: 'avanzado',
    minutos: 6,
    queAprendes: [
      'Qué mirar al abrir el panel',
      'Pasar lista y qué desencadena',
      'Qué hacer cuando una instructora no puede venir',
    ],
    porQue: 'Cuando el estudio ya rueda, Tentare deja de ser algo que configuras y pasa a ser algo que usas cinco minutos al día.',
    apartados: [
      {
        titulo: 'Tu inicio',
        texto: 'Lo primero es la agenda de hoy: qué clases hay, quién las da y cuánta gente viene. Debajo, lo que necesita tu atención. Puedes reordenar y ocultar las secciones para que lo primero sea lo que tú miras.',
      },
      {
        titulo: 'Pasar lista',
        texto: 'Marcar quién vino no es cosmético: la asistencia dispara los créditos, las rachas y los logros de tus alumnas. Puedes marcarlo a mano, escanear su pase, o dejar que se dé por asistido al terminar la clase. Y se puede decidir clase por clase: en un Reformer de seis sí, en un Mat de veinticinco quizá no.',
      },
      {
        titulo: 'Una baja de última hora',
        texto: 'La instructora avisa desde su móvil sin entrar al panel, o lo marcas tú. Tentare propone quién puede cubrirla y por qué, y según cómo lo tengas configurado las contacta solo o espera tu visto bueno.',
      },
      {
        titulo: 'Rellenar un hueco',
        texto: 'Si una clase de mañana va vacía, puedes avisar a las alumnas que encajan con esa franja, por WhatsApp o por email. Solo llega a quien aceptó recibir ese tipo de avisos.',
      },
    ],
    acciones: [
      { label: 'Ver mi inicio', href: '/dashboard' },
      { label: 'Ver mi calendario', href: '/calendario' },
    ],
    pasos: [],
  },

  // ── 14 ─────────────────────────────────────────────────────────────────────
  {
    id: 'que-trabaje-solo',
    numero: '14',
    titulo: 'Que trabaje solo',
    resumen: 'Los avisos y las rutinas que dejas puestos una vez y siguen funcionando.',
    nivel: 'avanzado',
    minutos: 5,
    queAprendes: [
      'Las tres automatizaciones que merecen la pena desde el principio',
      'Cómo se conecta WhatsApp',
      'Qué correos ven tus alumnas y cómo cambiarlos',
    ],
    porQue: 'Cada aviso automático es una tarea que dejas de hacer todas las tardes.',
    apartados: [
      {
        titulo: 'Recordatorios de clase',
        texto: 'Avisa a cada alumna el día antes. Es la que menos discusión tiene y la que más faltas evita.',
      },
      {
        titulo: 'Recuperar a quien no viene',
        texto: 'Pregunta cómo está quien lleva días sin aparecer, antes de que se convierta en una baja. Recuperar a una alumna cuesta mucho menos que conseguir una nueva.',
      },
      {
        titulo: 'Acompañar a las nuevas',
        texto: 'Anima a reservar a quien se acaba de dar de alta y todavía no ha venido. La primera clase es el momento en que una alumna decide si se queda.',
      },
      {
        titulo: 'WhatsApp',
        texto: 'Se conecta con tu propia cuenta de WhatsApp Business, así que los mensajes salen de tu número. Los mensajes automáticos usan plantillas que Meta tiene que aprobar antes; sin la plantilla aprobada, ese aviso no sale por WhatsApp.',
      },
      {
        titulo: 'Los correos',
        texto: 'Bienvenida, reserva confirmada, recordatorio, clase cancelada, plaza liberada y pago fallido se pueden reescribir enteros: asunto, texto, botón y color. Y cualquiera se puede apagar si prefieres no mandarlo.',
      },
    ],
    acciones: [
      { label: 'Activar mis automatizaciones', href: '/automatizaciones' },
      { label: 'Mis correos', href: '/configuracion?tab=plantillas' },
      { label: 'Conectar WhatsApp', href: '/configuracion?tab=integraciones' },
    ],
    consejo: 'Activa solo los recordatorios de clase y vive con ellos dos semanas. Encender cinco cosas a la vez hace imposible saber cuál funcionó.',
    pasos: ['recordatorios', 'ausencias', 'nuevas'],
  },

  // ── 15 ─────────────────────────────────────────────────────────────────────
  {
    id: 'entiende-tu-negocio',
    numero: '15',
    titulo: 'Entiende tu negocio',
    resumen: 'Qué clases dan dinero, quién se está yendo y qué merece la pena hacer esta semana.',
    nivel: 'avanzado',
    minutos: 6,
    queAprendes: [
      'Qué mide cada informe',
      'Qué es el Centro de Control y en qué se diferencia de un panel de gráficas',
      'Cómo llevarte tus datos cuando quieras',
    ],
    porQue: 'Un estudio pequeño no se pierde por falta de datos: se pierde por no mirar los dos que importan.',
    apartados: [
      {
        titulo: 'Informes',
        texto: 'Ingresos del periodo, retención, ocupación por tipo de clase, quién repite según el mes en que se dio de alta, y margen por clase. Ese último es el que más sorprende: enseña qué clases pagan el alquiler y cuáles no.',
      },
      {
        titulo: 'Centro de Control',
        texto: 'No es un tablero de gráficas: es un motor que mira tus datos dos veces al día y te dice qué merece la pena atender. Como mucho te interrumpe con una sola cosa al día, y si no hay nada que valga la pena, se calla. El silencio también es una respuesta.',
      },
      {
        titulo: 'Tu equipo',
        texto: 'Puedes ver retención y conversión por instructora, y si demasiadas alumnas dependen de una sola persona. Con pocos datos no inventa un número: dice que no lo sabe.',
      },
      {
        titulo: 'Tus datos son tuyos',
        texto: 'Puedes exportarlo todo a Excel cuando quieras, y la Libreta imprime tu estudio entero —cada alumna con su plan, sus sesiones y su plaza— en papel. Está ahí para que nunca te sientas atrapada.',
      },
    ],
    acciones: [
      { label: 'Ver mis informes', href: '/informes' },
      { label: 'Ir al Centro de Control', href: '/centro-de-control' },
    ],
    pasos: [],
  },
];

/** Índice por id, para resolver un capítulo desde la ruta sin recorrer la lista. */
export function capituloPorId(id: string): CapituloGuia | undefined {
  return CAPITULOS.find(c => c.id === id);
}

/** Los capítulos de un nivel, en orden. */
export function capitulosDeNivel(nivel: NivelGuia): CapituloGuia[] {
  return CAPITULOS.filter(c => c.nivel === nivel);
}

export const NIVELES: NivelGuia[] = ['esencial', 'recomendado', 'avanzado'];
