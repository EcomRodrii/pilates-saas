// Todo el texto de la maqueta, en español, en UN sitio: para corregir una frase se toca aquí y nada más. Sin imports.
// La estructura y los mensajes salen del diseño de Figma (que está en inglés); el español es traducción, con cuatro cambios
// de fondo que hay que conocer:
//   · PRECIOS: los planes del diseño (Starter/Professional/Business, 19/49/99 $) eran de ejemplo y no son los de Tentare. Aquí
//     van los reales (lib/billing/entitlements.ts → `PLAN_INFO`): Founding Studio, Estudio y Cadena, en euros. Las filas de
//     cada plan son las que el producto cumple hoy (y nada de «sustituciones» ni de lo congelado).
//   · CONFIANZA: «Trusted by thousand of countries» y sus marcas (Puma, Nike…) eran de relleno: aquí van los logos de los
//     estudios que ya trabajan con Tentare y dieron su consentimiento, o la sección no se pinta.
//   · HÉROE: el panel que se veía en el ordenador era de otro producto (ofertas de licitaciones, en PLN): es una captura REAL
//     del panel de Tentare.
//   · FAQ: el diseño solo enseña la respuesta de «¿Cómo se gestionan los pagos?»; las otras cuatro son nuestras y dicen solo
//     lo que el producto hace hoy.
// Lo de las tarjetas de «Funciones» (calendario, gráfica, importes) es ilustrativo, como en el diseño.

export const NAV = {
  enlaces: [
    { texto: 'Inicio', href: '/' },
    { texto: 'Producto', href: '/funcionalidades' },
    { texto: 'Precios', href: '#precio' },
    { texto: 'Soluciones', href: '/soluciones' },
  ],
  login: { texto: 'Entrar', href: '/login' },
  empezar: { texto: 'Empezar gratis', href: '/crear-estudio' },
} as const;

export const HERO = {
  etiqueta: 'Gestión de estudios, reinventada',
  // El <h1> ACTUAL de la home (components/web/home/Heroe.tsx): la categoría que se busca, en pequeño, y la promesa del fundador, en grande.
  categoria: 'Software de gestión para estudios de Pilates y yoga',
  promesa: ['Tu estudio sigue funcionando', 'aunque sueltes el móvil.'],
  texto: 'Reservas, cuotas, cobros y comunidad en una sola plataforma para estudios de pilates, yoga y bienestar.',
  demo: { texto: 'Pedir una demo', href: '#contacto' },
  como: { texto: 'Ver cómo funciona', href: '#funciones' },
  panel: 'El panel de Tentare: las clases de hoy, sus plazas y lo que falta por hacer',
} as const;

export const CONFIANZA = {
  titulo: 'Estudios que ya trabajan con Tentare',
} as const;

export const FUNCIONES = {
  etiqueta: 'Funciones',
  titulo: 'Todo lo que tu estudio necesita, en un solo lugar.',
  reservas: {
    titulo: 'Reservas sin complicaciones',
    texto: 'Tus alumnas reservan cuando quieren. Tú gestionas las reservas y los cambios, y siempre lo tienes bajo control.',
    chips: ['Reservas', 'Cambios de clase', 'Pagos', 'Recordatorios'],
    instantanea: 'Reserva al instante',
    recordatorios: 'Recordatorios automáticos',
    mes: 'octubre de 2026',
    dias: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
    numeros: [13, 14, 15, 16, 17, 18, 19],
    elegido: 16,
  },
  clases: {
    titulo: 'Clases a tu ritmo',
    texto: 'Organiza tus clases y sigue cada sesión con una agenda que se adapta al ritmo de tu estudio.',
    chips: ['Clases', 'Horario', 'Instructoras', 'Sesiones', 'Disponibilidad'],
    panel: 'Mis clases',
    pestanas: ['Próximas', 'En curso', 'Completadas'],
    filas: [
      { nombre: 'Pilates Flow', cuando: 'Hoy', hoy: true },
      { nombre: 'Yoga de mañana', cuando: 'Mar', hoy: false },
      { nombre: 'Barre Fuerza', cuando: 'Jue', hoy: false },
    ],
    mas: 'Ver más',
  },
  clientes: {
    titulo: 'Cada alumna, más cerca',
    texto: 'Su ficha, su plan, su asistencia y sus reservas, juntos: conoces a cada alumna y la acompañas mejor.',
    chips: ['Fichas', 'Cuotas y bonos', 'Asistencia', 'Reservas', 'Constancia'],
    lateral: 'Alumna',
    central: 'Alumna',
  },
  pagos: {
    titulo: 'Cobros seguros',
    texto: 'Sigue tus cobros y tus facturas de una forma sencilla y segura.',
    chips: ['Cobros', 'Facturas', 'Transacciones', 'Recibos', 'Devoluciones'],
    recibido: 'Pago recibido',
    importe: '120,00 €',
    ingresos: 'Ingresos del mes',
    total: '12.400 €',
    variacion: '+12 % sobre el mes pasado',
  },
  datos: {
    titulo: 'Decisiones con datos',
    texto: 'Entiende la actividad de tu estudio con informes claros y una visión completa de tus números.',
    chips: ['Analítica', 'Ingresos', 'Ocupación', 'Informes', 'Actividad'],
    panel: 'Actividad del estudio',
    periodo: 'Esta semana',
    barras: [
      { h: '06 h', v: 18 },
      { h: '09 h', v: 24 },
      { h: '12 h', v: 32 },
      { h: '15 h', v: 46 },
      { h: '18 h', v: 12 },
    ],
    actividad: '+24 %',
    actividadEtiqueta: 'Actividad',
  },
} as const;

export const BENEFICIOS = {
  etiqueta: 'Ventajas',
  titulo: 'Más tiempo para lo que de verdad importa.',
  texto: 'Tu trabajo es cuidar de cada persona que entra en tu estudio. Deja que la gestión encuentre su propio ritmo.',
  lista: [
    { titulo: 'Simplifica tu día a día.', detalle: null },
    { titulo: 'Crea mejores experiencias para tus alumnas.', detalle: 'Haz que cada interacción sea más fluida, más sencilla y más agradable para quienes atiendes.' },
    { titulo: 'Ordena la gestión de tu estudio.', detalle: null },
    { titulo: 'Haz crecer tu negocio con confianza.', detalle: null },
  ],
} as const;

export const CTA = {
  etiqueta: 'Empieza hoy',
  titulo: 'Tu estudio merece una forma mejor de gestionarse.',
  texto: 'Una experiencia de reserva a la altura de tus clases, desde la primera reserva hasta la última sesión.',
  boton: { texto: 'Empezar hoy', href: '/crear-estudio' },
} as const;

// Los planes REALES (lib/billing/entitlements.ts → PLAN_INFO: Founding Studio 29 €, Estudio 59 €, Cadena 149 €). Founding Studio
// es gratis hasta 150 reservas al mes. Las filas, solo lo que el producto cumple hoy.
export const PRECIOS = {
  etiqueta: 'Planes y precios',
  titulo: 'Un plan para cada etapa de tu estudio.',
  planes: [
    {
      nombre: 'Founding Studio', texto: 'Todo lo esencial, gratis hasta 150 reservas al mes.', precio: 'Gratis', periodo: '', boton: 'Empezar gratis', destacado: false,
      lista: ['Calendario de clases y salas', 'Reservas online con lista de espera', 'Cuotas, bonos y clases sueltas', 'Cobros con tarjeta', 'App de tus alumnas con tu marca'],
    },
    {
      nombre: 'Estudio', texto: 'Más herramientas para un estudio que crece.', precio: '59 €', periodo: '/ mes', boton: 'Elegir Estudio', destacado: true,
      lista: ['Todo lo de Founding Studio', 'Sin límite de alumnas ni de reservas', 'Centro de Control', 'Redacción con IA', 'Más consultas al asistente'],
    },
    {
      nombre: 'Cadena', texto: 'Para quien lleva varios estudios.', precio: '149 €', periodo: '/ mes', boton: 'Hablar con el equipo', destacado: false,
      lista: ['Todo lo de Estudio', 'Varias sedes en una sola cuenta', 'Catálogo común para todas las sedes'],
    },
  ],
  etiquetaDestacado: 'PARA CRECER',
} as const;

export const FAQ = {
  etiqueta: 'Preguntas frecuentes',
  titulo: '¿Tienes dudas? Tenemos respuestas.',
  texto: '¿Quieres saber más sobre Tentare? Aquí tienes algunas respuestas para empezar.',
  boton: { texto: 'Ver planes', href: '#precio' },
  preguntas: [
    { q: '¿Pueden mis alumnas reservar clases online?', a: 'Sí. Reservan desde la página de tu estudio o desde su propia app, a cualquier hora del día.' },
    { q: '¿Cómo se gestionan los pagos?', a: 'Puedes consultar el estado de los pagos y de las cuotas desde tu panel. Las opciones de pago disponibles dependen de cómo tengas configurado tu estudio.' },
    { q: '¿Cuánto se tarda en configurar mi estudio?', a: 'Puedes empezar gratis y añadir tus clases, tus salas y tus planes a tu ritmo. No te ata a nada.' },
    { q: '¿Puedo gestionar cuotas y bonos?', a: 'Sí. Cuotas, bonos y clases sueltas viven en el mismo sitio, cada uno con sus propias reglas.' },
    { q: '¿Dónde encuentro la información de mis alumnas?', a: 'En la ficha de cada alumna: su plan, sus reservas, su asistencia y sus pagos, todo junto.' },
  ],
  abierta: 1,
} as const;

export const CONTACTO = {
  etiqueta: 'Contacto',
  titulo: 'Hablemos de tu estudio.',
  texto: 'Cuéntanos un poco cómo trabajas. Te enseñaremos cómo puede encajar tentare.app en tu estudio y con tus alumnas.',
  listos: '¿Listo para simplificar la gestión de tu estudio? Busquemos juntos la solución adecuada.',
  boton: { texto: 'Escribir al equipo', href: 'mailto:hola@tentare.app' },
  formulario: {
    titulo: 'Planifiquemos tu siguiente paso.',
    nombre: { etiqueta: 'Nombre', marcador: 'Tu nombre' },
    estudio: { etiqueta: 'Nombre del estudio', marcador: 'El nombre de tu estudio' },
    email: { etiqueta: 'Correo electrónico', marcador: 'Tu correo electrónico' },
    tamano: { etiqueta: 'Tamaño del estudio', marcador: 'Elige el tamaño', opciones: ['Solo yo', 'De 2 a 5 personas', 'De 6 a 15 personas', 'Más de 15', 'Varias sedes'] },
    mensaje: { etiqueta: 'Mensaje', marcador: 'Cuéntanos sobre tu estudio y lo que necesitas…' },
    enviar: 'Pedir una demo',
    nota: 'Tus datos solo se usarán para responder a tu consulta.',
    aviso: 'Se abre tu correo con el mensaje listo para enviar.',
    enviando: 'Enviando…',
    enviadoTitulo: 'Recibido. Te escribimos pronto.',
    enviadoTexto: 'Hemos recibido tu mensaje. Te responderemos al correo que nos has dado, normalmente en un día laborable.',
    errorEnvio: 'No hemos podido enviar tu mensaje. Escríbenos a hola@tentare.app.',
    errorRed: 'No hemos podido enviarlo. Revisa tu conexión y vuelve a intentarlo.',
  },
} as const;

export const PIE = {
  lema: 'Tu estudio. Tu gente. A tu manera.',
  texto: 'Gestiona tu estudio con claridad, conecta con tus alumnas y haz más sitio para crecer.',
  columnas: [
    { titulo: 'PRODUCTO', enlaces: [{ t: 'Funciones', h: '/funcionalidades' }, { t: 'Precios', h: '/precios' }, { t: 'Soluciones', h: '/soluciones' }, { t: 'Pedir una demo', h: '#contacto' }] },
    { titulo: 'EMPRESA', enlaces: [{ t: 'Contacto', h: '#contacto' }, { t: 'Seguridad', h: '/seguridad' }, { t: 'Privacidad', h: '/privacidad' }, { t: 'Cookies', h: '/cookies' }] },
    { titulo: 'RECURSOS', enlaces: [{ t: 'Centro de ayuda', h: '/ayuda' }, { t: 'Preguntas frecuentes', h: '#faq' }, { t: 'Guías', h: '/recursos' }, { t: 'Soporte', h: '/soporte' }] },
  ],
  copyright: '© 2026 Tentare',
  legal: [{ t: 'Privacidad', h: '/privacidad' }, { t: 'Términos y condiciones', h: '/terminos' }],
} as const;

// Textos alternativos de las fotos (las que dejó el fundador en el escritorio; derivadas en public/landing-nueva/).
export const ALT = {
  hierba: '',
  alumna1: 'Una alumna de pilates ante el espejo de un estudio, con su móvil',
  alumna2: 'Una alumna con su móvil en una sala de entrenamiento',
  alumna3: 'Una alumna sobre un reformer de pilates, ante el espejo',
  cobros: 'Una alumna consulta en su móvil el pago de una clase',
  postura: 'Una alumna en una postura de pilates, con luz cálida de estudio',
  meditacion: 'Dos alumnas meditando sobre sus esterillas, con luz cálida de estudio',
  retrato: 'Una alumna con auriculares, con los ojos cerrados y luz natural',
} as const;

